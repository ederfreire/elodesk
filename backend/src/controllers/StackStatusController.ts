import { Request, Response } from "express";
import http from "http";

// Lista de containers monitorados (nome do container -> rótulo amigável)
const SERVICES: { key: string; name: string; label: string; url?: string }[] = [
  { key: "n8n",             name: "multiflow-n8n",             label: "n8n" },
  { key: "typebot-builder", name: "multiflow-typebot-builder", label: "Typebot Builder" },
  { key: "typebot-viewer",  name: "multiflow-typebot-viewer",  label: "Typebot Viewer" }
];

const SOCKET_PATH = process.env.DOCKER_SOCKET || "/var/run/docker.sock";

function dockerRequest(path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath: SOCKET_PATH, path, method: "GET" },
      res => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", chunk => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode || 0, body: data }));
      }
    );
    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error("docker socket timeout"));
    });
    req.end();
  });
}

// Remove cabeçalhos binários de stream multiplexada do docker logs
function cleanLogs(raw: string): string {
  // Quando o container não foi iniciado em modo TTY, cada frame começa com 8 bytes:
  // [stream_type, 0, 0, 0, size(uint32 BE)]
  const buf = Buffer.from(raw, "binary");
  let out = "";
  let i = 0;
  while (i < buf.length) {
    if (i + 8 > buf.length) break;
    const type = buf[i];
    if (type !== 0 && type !== 1 && type !== 2) {
      // Não é frame multiplexado — devolve cru
      return raw;
    }
    const size = buf.readUInt32BE(i + 4);
    i += 8;
    out += buf.slice(i, i + size).toString("utf8");
    i += size;
  }
  return out || raw;
}

export const list = async (req: Request, res: Response): Promise<Response> => {
  const results = await Promise.all(
    SERVICES.map(async svc => {
      try {
        const r = await dockerRequest(`/containers/${svc.name}/json`);
        if (r.status === 404) {
          return { ...svc, installed: false, status: "not_installed" };
        }
        if (r.status !== 200) {
          return { ...svc, installed: false, status: "error", error: `HTTP ${r.status}` };
        }
        const data = JSON.parse(r.body);
        return {
          ...svc,
          installed: true,
          status: data.State?.Status || "unknown",
          running: !!data.State?.Running,
          startedAt: data.State?.StartedAt,
          health: data.State?.Health?.Status || null,
          restartCount: data.RestartCount || 0,
          image: data.Config?.Image
        };
      } catch (err: any) {
        return { ...svc, installed: false, status: "error", error: err.message };
      }
    })
  );
  return res.json({ services: results, dockerSocket: SOCKET_PATH });
};

export const logs = async (req: Request, res: Response): Promise<Response> => {
  const { service } = req.params;
  const tail = Math.min(Number(req.query.tail) || 200, 1000);
  const svc = SERVICES.find(s => s.key === service);
  if (!svc) return res.status(404).json({ error: "service not found" });
  try {
    const r = await dockerRequest(
      `/containers/${svc.name}/logs?stdout=1&stderr=1&tail=${tail}&timestamps=1`
    );
    if (r.status === 404) return res.status(404).json({ error: "container not installed" });
    if (r.status !== 200) return res.status(502).json({ error: `docker HTTP ${r.status}` });
    return res.json({ service: svc.key, logs: cleanLogs(r.body) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const restart = async (req: Request, res: Response): Promise<Response> => {
  const { service } = req.params;
  const svc = SERVICES.find(s => s.key === service);
  if (!svc) return res.status(404).json({ error: "service not found" });
  return new Promise<Response>((resolve, reject) => {
    const req2 = http.request(
      {
        socketPath: SOCKET_PATH,
        path: `/containers/${svc.name}/restart`,
        method: "POST"
      },
      r => {
        r.on("data", () => {});
        r.on("end", () => {
          if (r.statusCode === 204) resolve(res.json({ ok: true }));
          else resolve(res.status(502).json({ error: `docker HTTP ${r.statusCode}` }));
        });
      }
    );
    req2.on("error", e => resolve(res.status(500).json({ error: e.message })));
    req2.end();
  });
};