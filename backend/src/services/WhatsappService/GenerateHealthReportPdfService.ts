import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { getAllWhatsAppOficialHealth } from "./GetWhatsAppOficialHealthService";

const COLORS = {
  primary: "#1E88E5",
  primaryDark: "#0D47A1",
  text: "#1F2937",
  muted: "#6B7280",
  border: "#E5E7EB",
  bg: "#F9FAFB",
  green: "#16A34A",
  yellow: "#F59E0B",
  red: "#DC2626"
};

const qualityColor = (q?: string | null) => {
  const v = String(q || "").toUpperCase();
  if (v === "GREEN") return COLORS.green;
  if (v === "YELLOW") return COLORS.yellow;
  if (v === "RED") return COLORS.red;
  return COLORS.muted;
};

const usageColor = (pct: number) => {
  if (pct >= 90) return COLORS.red;
  if (pct >= 70) return COLORS.yellow;
  return COLORS.green;
};

type Lang = "pt" | "es" | "en";

const LOCALE_MAP: Record<Lang, string> = {
  pt: "pt-BR",
  es: "es-ES",
  en: "en-US"
};

const I18N: Record<Lang, Record<string, string>> = {
  pt: {
    pdfTitle: "Saúde dos Números - API Oficial",
    heroTitle: "Saúde dos Números — API Oficial",
    generatedAt: "Gerado em {date}",
    kpiNumbers: "Números",
    kpiHighQuality: "Qualidade Alta",
    kpiSent24h: "Enviadas (24h)",
    kpiMetaLimit: "Limite Meta",
    unlimited: "Ilimitado",
    sendSummary: "Resumo de envios (24h)",
    sentOfLimit: "Enviadas: {sent} de {limit} • Entregues: {delivered} • Uso: {pct}%",
    sentUnlimited: "Enviadas: {sent} • Entregues: {delivered} • Limite: Ilimitado",
    alertsByNumber: "Alertas por número ({count})",
    noAlerts: "Nenhum alerta. Todos os números estão saudáveis. ✅",
    details: "Detalhes por número",
    sends24h: "ENVIOS · 24H",
    sentOfLimitDetail: "Enviadas: {sent} de {limit} • Entregues: {delivered} • Disponível: {rem} ({pct}%)",
    sentUnlimitedDetail: "Enviadas: {sent} • Entregues: {delivered} • Limite: Ilimitado",
    quality: "Qualidade: {q}",
    tier: "Tier",
    verification: "Verificação",
    nameStatus: "Status do nome",
    accountReview: "Revisão conta",
    businessVerification: "Verificação negócio",
    waba: "WABA",
    errorLabel: "Erro: {err}",
    issueVerification: "Verificação: {v}",
    issueName: "Nome: {v}",
    issueAccountReview: "Revisão conta: {v}",
    issueBusiness: "Negócio: {v}",
    issueQualityYellow: "Qualidade: AMARELA",
    issueQualityRed: "Qualidade: VERMELHA",
    issueUsage90: "Uso ≥ 90% ({p}%)",
    issueUsage70: "Uso ≥ 70% ({p}%)",
    issueError: "Erro: {err}",
    pageOf: "Página {i} de {n}"
  },
  es: {
    pdfTitle: "Salud de los Números - API Oficial",
    heroTitle: "Salud de los Números — API Oficial",
    generatedAt: "Generado el {date}",
    kpiNumbers: "Números",
    kpiHighQuality: "Calidad Alta",
    kpiSent24h: "Enviadas (24h)",
    kpiMetaLimit: "Límite Meta",
    unlimited: "Ilimitado",
    sendSummary: "Resumen de envíos (24h)",
    sentOfLimit: "Enviadas: {sent} de {limit} • Entregadas: {delivered} • Uso: {pct}%",
    sentUnlimited: "Enviadas: {sent} • Entregadas: {delivered} • Límite: Ilimitado",
    alertsByNumber: "Alertas por número ({count})",
    noAlerts: "Sin alertas. Todos los números están saludables. ✅",
    details: "Detalles por número",
    sends24h: "ENVÍOS · 24H",
    sentOfLimitDetail: "Enviadas: {sent} de {limit} • Entregadas: {delivered} • Disponible: {rem} ({pct}%)",
    sentUnlimitedDetail: "Enviadas: {sent} • Entregadas: {delivered} • Límite: Ilimitado",
    quality: "Calidad: {q}",
    tier: "Tier",
    verification: "Verificación",
    nameStatus: "Estado del nombre",
    accountReview: "Revisión cuenta",
    businessVerification: "Verificación negocio",
    waba: "WABA",
    errorLabel: "Error: {err}",
    issueVerification: "Verificación: {v}",
    issueName: "Nombre: {v}",
    issueAccountReview: "Revisión cuenta: {v}",
    issueBusiness: "Negocio: {v}",
    issueQualityYellow: "Calidad: AMARILLA",
    issueQualityRed: "Calidad: ROJA",
    issueUsage90: "Uso ≥ 90% ({p}%)",
    issueUsage70: "Uso ≥ 70% ({p}%)",
    issueError: "Error: {err}",
    pageOf: "Página {i} de {n}"
  },
  en: {
    pdfTitle: "Numbers Health - Official API",
    heroTitle: "Numbers Health — Official API",
    generatedAt: "Generated on {date}",
    kpiNumbers: "Numbers",
    kpiHighQuality: "High Quality",
    kpiSent24h: "Sent (24h)",
    kpiMetaLimit: "Meta Limit",
    unlimited: "Unlimited",
    sendSummary: "Send summary (24h)",
    sentOfLimit: "Sent: {sent} of {limit} • Delivered: {delivered} • Usage: {pct}%",
    sentUnlimited: "Sent: {sent} • Delivered: {delivered} • Limit: Unlimited",
    alertsByNumber: "Alerts per number ({count})",
    noAlerts: "No alerts. All numbers are healthy. ✅",
    details: "Per-number details",
    sends24h: "SENDS · 24H",
    sentOfLimitDetail: "Sent: {sent} of {limit} • Delivered: {delivered} • Available: {rem} ({pct}%)",
    sentUnlimitedDetail: "Sent: {sent} • Delivered: {delivered} • Limit: Unlimited",
    quality: "Quality: {q}",
    tier: "Tier",
    verification: "Verification",
    nameStatus: "Name status",
    accountReview: "Account review",
    businessVerification: "Business verification",
    waba: "WABA",
    errorLabel: "Error: {err}",
    issueVerification: "Verification: {v}",
    issueName: "Name: {v}",
    issueAccountReview: "Account review: {v}",
    issueBusiness: "Business: {v}",
    issueQualityYellow: "Quality: YELLOW",
    issueQualityRed: "Quality: RED",
    issueUsage90: "Usage ≥ 90% ({p}%)",
    issueUsage70: "Usage ≥ 70% ({p}%)",
    issueError: "Error: {err}",
    pageOf: "Page {i} of {n}"
  }
};

const normalizeLang = (l?: string): Lang => {
  const v = String(l || "pt").toLowerCase().split("-")[0];
  if (v === "es" || v === "en" || v === "pt") return v as Lang;
  return "pt";
};

const tt = (lang: Lang, key: string, vars?: Record<string, any>) => {
  let s = I18N[lang][key] || I18N.pt[key] || key;
  if (vars) {
    Object.keys(vars).forEach(k => {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(vars[k]));
    });
  }
  return s;
};

const fmtFor = (lang: Lang) => (n: number | null | undefined) =>
  typeof n === "number" ? n.toLocaleString(LOCALE_MAP[lang]) : "—";


const drawProgressBar = (
  doc: any,
  x: number,
  y: number,
  w: number,
  h: number,
  pct: number,
  color: string
) => {
  const safe = Math.max(0, Math.min(100, pct));
  doc.roundedRect(x, y, w, h, h / 2).fill(COLORS.border);
  if (safe > 0) {
    doc
      .roundedRect(x, y, (w * safe) / 100, h, h / 2)
      .fill(color);
  }
  doc.fillColor(COLORS.text);
};

const ensureSpace = (doc: any, needed: number) => {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
};

export const buildHealthReportPdf = (
  items: any[],
  langInput: string = "pt"
): Promise<Buffer> => {
  const lang = normalizeLang(langInput);
  const fmt = fmtFor(lang);
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 40,
        info: { Title: tt(lang, "pdfTitle") }
      });

      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // ===== Hero header =====
      const pageW = doc.page.width;
      const margin = doc.page.margins.left;
      const heroH = 90;
      doc.rect(0, 0, pageW, heroH).fill(COLORS.primaryDark);
      doc.rect(0, 0, pageW, heroH).fill(COLORS.primary).opacity(0.85);
      doc.opacity(1);

      doc
        .fillColor("#FFFFFF")
        .font("Helvetica-Bold")
        .fontSize(20)
        .text(tt(lang, "heroTitle"), margin, 28);
      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor("#E3F2FD")
        .text(
          tt(lang, "generatedAt", {
            date: new Date().toLocaleString(LOCALE_MAP[lang])
          }),
          margin,
          58
        );

      doc.fillColor(COLORS.text);
      doc.y = heroH + 18;

      // ===== Aggregated stats =====
      let total = items.length;
      let green = 0, yellow = 0, red = 0, withError = 0;
      let sent = 0, delivered = 0, limit = 0, anyUnlimited = false;
      items.forEach(it => {
        const q = String(it.quality_rating || "").toUpperCase();
        if (q === "GREEN") green++;
        else if (q === "YELLOW") yellow++;
        else if (q === "RED") red++;
        if (it.error) withError++;
        if (typeof it.sent_24h === "number") sent += it.sent_24h;
        if (typeof it.delivered_24h === "number") delivered += it.delivered_24h;
        if (it.limit_24h === -1) anyUnlimited = true;
        else if (typeof it.limit_24h === "number" && it.limit_24h > 0)
          limit += it.limit_24h;
      });
      const usagePct =
        anyUnlimited || limit <= 0
          ? 0
          : Math.min(100, Math.round((sent / limit) * 100));

      // KPI cards
      const cardsTop = doc.y;
      const cardGap = 10;
      const cardW = (pageW - margin * 2 - cardGap * 3) / 4;
      const cardH = 64;
      const kpis = [
        { label: tt(lang, "kpiNumbers"), value: String(total), color: COLORS.primary },
        { label: tt(lang, "kpiHighQuality"), value: String(green), color: COLORS.green },
        { label: tt(lang, "kpiSent24h"), value: fmt(sent), color: COLORS.primaryDark },
        {
          label: tt(lang, "kpiMetaLimit"),
          value: anyUnlimited ? tt(lang, "unlimited") : fmt(limit),
          color: COLORS.muted
        }
      ];
      kpis.forEach((k, i) => {
        const x = margin + i * (cardW + cardGap);
        doc
          .roundedRect(x, cardsTop, cardW, cardH, 10)
          .fillAndStroke("#FFFFFF", COLORS.border);
        doc
          .fillColor(k.color)
          .font("Helvetica-Bold")
          .fontSize(18)
          .text(k.value, x + 12, cardsTop + 12, { width: cardW - 24 });
        doc
          .fillColor(COLORS.muted)
          .font("Helvetica")
          .fontSize(10)
          .text(k.label, x + 12, cardsTop + 40, { width: cardW - 24 });
      });
      doc.y = cardsTop + cardH + 18;
      doc.fillColor(COLORS.text);

      // Usage summary card
      ensureSpace(doc, 80);
      const usageTop = doc.y;
      doc
        .roundedRect(margin, usageTop, pageW - margin * 2, 70, 12)
        .fillAndStroke("#FFFFFF", COLORS.border);
      doc
        .fillColor(COLORS.text)
        .font("Helvetica-Bold")
        .fontSize(12)
        .text(tt(lang, "sendSummary"), margin + 14, usageTop + 12);
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(COLORS.muted)
        .text(
          anyUnlimited
            ? tt(lang, "sentUnlimited", { sent: fmt(sent), delivered: fmt(delivered) })
            : tt(lang, "sentOfLimit", { sent: fmt(sent), limit: fmt(limit), delivered: fmt(delivered), pct: usagePct }),
          margin + 14,
          usageTop + 30
        );
      drawProgressBar(
        doc,
        margin + 14,
        usageTop + 50,
        pageW - margin * 2 - 28,
        8,
        anyUnlimited ? 0 : usagePct,
        usageColor(usagePct)
      );
      doc.y = usageTop + 80;
      doc.fillColor(COLORS.text);

      // ===== Alerts summary =====
      const alerts: { name: string; phone: string; issues: string[] }[] = [];
      items.forEach(it => {
        const issues: string[] = [];
        const cv = String(it.code_verification_status || "").toUpperCase();
        if (cv && cv !== "VERIFIED" && cv !== "EXPIRED") issues.push(tt(lang, "issueVerification", { v: cv }));
        const ns = String(it.name_status || "").toUpperCase();
        if (ns && ns !== "APPROVED") issues.push(tt(lang, "issueName", { v: ns }));
        const ars = String(it.account_review_status || "").toUpperCase();
        if (ars && ars !== "APPROVED") issues.push(tt(lang, "issueAccountReview", { v: ars }));
        const bvs = String(it.business_verification_status || "").toUpperCase();
        if (bvs && bvs !== "VERIFIED") issues.push(tt(lang, "issueBusiness", { v: bvs }));
        const q = String(it.quality_rating || "").toUpperCase();
        if (q === "YELLOW") issues.push(tt(lang, "issueQualityYellow"));
        if (q === "RED") issues.push(tt(lang, "issueQualityRed"));
        if (
          typeof it.sent_24h === "number" &&
          typeof it.limit_24h === "number" &&
          it.limit_24h > 0
        ) {
          const p = Math.round((it.sent_24h / it.limit_24h) * 100);
          if (p >= 90) issues.push(tt(lang, "issueUsage90", { p }));
          else if (p >= 70) issues.push(tt(lang, "issueUsage70", { p }));
        }
        if (it.error) issues.push(tt(lang, "issueError", { err: it.error }));
        if (issues.length) {
          alerts.push({
            name: it.name || it.verified_name || `WA #${it.whatsappId}`,
            phone: it.display_phone_number || it.phone_number || "—",
            issues
          });
        }
      });

      ensureSpace(doc, 60);
      doc
        .fillColor(COLORS.text)
        .font("Helvetica-Bold")
        .fontSize(13)
        .text(tt(lang, "alertsByNumber", { count: alerts.length }), margin, doc.y);
      doc.moveDown(0.4);

      if (alerts.length === 0) {
        doc
          .roundedRect(margin, doc.y, pageW - margin * 2, 40, 10)
          .fillAndStroke("#ECFDF5", "#A7F3D0");
        doc
          .fillColor("#065F46")
          .font("Helvetica")
          .fontSize(11)
          .text(
            tt(lang, "noAlerts"),
            margin + 14,
            doc.y + 14
          );
        doc.y += 50;
        doc.fillColor(COLORS.text);
      } else {
        alerts.forEach(a => {
          const issuesText = a.issues.join(" • ");
          const textH = doc.heightOfString(issuesText, {
            width: pageW - margin * 2 - 28
          });
          const boxH = 22 + textH + 14;
          ensureSpace(doc, boxH + 6);
          const top = doc.y;
          doc
            .roundedRect(margin, top, pageW - margin * 2, boxH, 10)
            .fillAndStroke("#FFFBEB", "#FCD34D");
          doc
            .fillColor(COLORS.text)
            .font("Helvetica-Bold")
            .fontSize(11)
            .text(`${a.name} — ${a.phone}`, margin + 14, top + 10);
          doc
            .fillColor("#92400E")
            .font("Helvetica")
            .fontSize(10)
            .text(issuesText, margin + 14, top + 26, {
              width: pageW - margin * 2 - 28
            });
          doc.y = top + boxH + 6;
          doc.fillColor(COLORS.text);
        });
      }

      // ===== Per-number details =====
      doc.addPage();
      doc
        .fillColor(COLORS.text)
        .font("Helvetica-Bold")
        .fontSize(15)
        .text(tt(lang, "details"), margin, doc.y);
      doc.moveDown(0.6);

      items.forEach(it => {
        const qColor = qualityColor(it.quality_rating);
        const sentN = typeof it.sent_24h === "number" ? it.sent_24h : 0;
        const limN = typeof it.limit_24h === "number" ? it.limit_24h : 0;
        const unlimited = it.limit_24h === -1;
        const pct = unlimited || limN <= 0 ? 0 : Math.min(100, Math.round((sentN / limN) * 100));
        const remaining = unlimited
          ? tt(lang, "unlimited")
          : Math.max(0, limN - sentN).toLocaleString(LOCALE_MAP[lang]);

        ensureSpace(doc, 200);
        const top = doc.y;
        const blockW = pageW - margin * 2;

        // Header bar
        doc.roundedRect(margin, top, blockW, 44, 10).fill(qColor);
        doc
          .fillColor("#FFFFFF")
          .font("Helvetica-Bold")
          .fontSize(13)
          .text(it.name || it.verified_name || `WA #${it.whatsappId}`, margin + 14, top + 9, {
            width: blockW - 200
          });
        doc
          .font("Helvetica")
          .fontSize(10)
          .text(
            it.display_phone_number || it.phone_number || "—",
            margin + 14,
            top + 27,
            { width: blockW - 200 }
          );
        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(
            tt(lang, "quality", { q: String(it.quality_rating || "—").toUpperCase() }),
            margin + blockW - 180,
            top + 16,
            { width: 166, align: "right" }
          );

        // Usage block
        const ub = top + 54;
        doc
          .roundedRect(margin, ub, blockW, 56, 10)
          .fillAndStroke("#FFFFFF", COLORS.border);
        doc
          .fillColor(COLORS.muted)
          .font("Helvetica-Bold")
          .fontSize(9)
          .text(tt(lang, "sends24h"), margin + 14, ub + 10);
        doc
          .fillColor(COLORS.text)
          .font("Helvetica")
          .fontSize(10)
          .text(
            unlimited
              ? tt(lang, "sentUnlimitedDetail", { sent: fmt(sentN), delivered: fmt(it.delivered_24h) })
              : tt(lang, "sentOfLimitDetail", { sent: fmt(sentN), limit: fmt(limN), delivered: fmt(it.delivered_24h), rem: remaining, pct }),
            margin + 14,
            ub + 24
          );
        drawProgressBar(
          doc,
          margin + 14,
          ub + 42,
          blockW - 28,
          6,
          unlimited ? 0 : pct,
          usageColor(pct)
        );

        // Details rows
        const rows: [string, string][] = [
          [tt(lang, "tier"), String(it.messaging_limit_tier || "—")],
          [tt(lang, "verification"), String(it.code_verification_status || "—")],
          [tt(lang, "nameStatus"), String(it.name_status || "—")],
          [tt(lang, "accountReview"), String(it.account_review_status || "—")],
          [tt(lang, "businessVerification"), String(it.business_verification_status || "—")],
          [tt(lang, "waba"), String(it.waba_name || it.waba_id || "—")]
        ];
        let ry = ub + 66;
        const colW = (blockW - 20) / 2;
        rows.forEach((r, idx) => {
          const col = idx % 2;
          const rowIdx = Math.floor(idx / 2);
          const x = margin + 10 + col * colW;
          const y = ry + rowIdx * 18;
          doc
            .fillColor(COLORS.muted)
            .font("Helvetica")
            .fontSize(9)
            .text(r[0], x, y, { width: colW * 0.45, continued: false });
          doc
            .fillColor(COLORS.text)
            .font("Helvetica-Bold")
            .fontSize(9)
            .text(r[1], x + colW * 0.45, y, {
              width: colW * 0.55 - 6,
              ellipsis: true
            });
        });

        if (it.error) {
          const ey = ry + Math.ceil(rows.length / 2) * 18 + 4;
          doc
            .fillColor(COLORS.red)
            .font("Helvetica-Bold")
            .fontSize(9)
            .text(tt(lang, "errorLabel", { err: it.error }), margin + 14, ey, { width: blockW - 28 });
        }

        doc.y = ub + 66 + Math.ceil(rows.length / 2) * 18 + (it.error ? 22 : 10);
        doc.fillColor(COLORS.text);
      });

      // Footer page numbers
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        doc
          .fillColor(COLORS.muted)
          .font("Helvetica")
          .fontSize(8)
          .text(
            tt(lang, "pageOf", { i: i + 1, n: range.count }),
            doc.page.margins.left,
            doc.page.height - 24,
            { align: "right", width: doc.page.width - doc.page.margins.left * 2 }
          );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

export const generateHealthReportPdfForCompany = async (
  companyId: number,
  lang: string = "pt"
): Promise<{ buffer: Buffer; items: any[] }> => {
  const items = await getAllWhatsAppOficialHealth(companyId);
  const buffer = await buildHealthReportPdf(items, lang);
  return { buffer, items };
};


export const saveDailyHealthReportPdf = async (
  companyId: number
): Promise<string | null> => {
  const items = await getAllWhatsAppOficialHealth(companyId);
  if (!items || items.length === 0) return null;
  const buffer = await buildHealthReportPdf(items);
  const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");
  const dir = path.join(publicFolder, `company${companyId}`, "health-reports");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    try { fs.chmodSync(dir, 0o777); } catch (_) {}
  }
  const date = new Date().toISOString().slice(0, 10);
  const filename = `saude-numeros-${date}.pdf`;
  const fullPath = path.join(dir, filename);
  fs.writeFileSync(fullPath, buffer);
  return `company${companyId}/health-reports/${filename}`;
};

export const listHealthReports = (
  companyId: number
): { filename: string; date: string; url: string; size: number }[] => {
  const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");
  const dir = path.join(publicFolder, `company${companyId}`, "health-reports");
  if (!fs.existsSync(dir)) return [];
  const backendUrl = (process.env.BACKEND_URL || "").replace(/\/$/, "");
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith(".pdf"))
    .map(f => {
      const stat = fs.statSync(path.join(dir, f));
      const rel = `company${companyId}/health-reports/${f}`;
      return {
        filename: f,
        date: stat.mtime.toISOString(),
        url: backendUrl ? `${backendUrl}/public/${rel}` : `/public/${rel}`,
        size: stat.size
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
};
