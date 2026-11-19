/**
 * Versão JSON (arquivo) do useMultiFileAuthState.
 * Import corrigido: usa somente o compat shim local em vez de "baileys"
 * ou "@whiskeysockets/baileys". Assim o build não depende de tipos externos.
 */
import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap
} from "../compat/baileys";
import { proto, initAuthCreds, BufferJSON } from "../compat/baileys";
import fs from "fs";
import path from "path";
import Whatsapp from "../models/Whatsapp";

export const useMultiFileAuthStateJson = async (
  whatsapp: Whatsapp
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
  const folder = path.resolve(__dirname, "..", "..", "sessions", `${whatsapp.id}`);
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

  const filePath = (file: string) => path.join(folder, `${file}.json`);

  const writeData = async (data: any, file: string) => {
    try {
      fs.writeFileSync(
        filePath(file),
        JSON.stringify(data, BufferJSON.replacer)
      );
    } catch {
      return null;
    }
  };

  const readData = async (file: string) => {
    try {
      const raw = fs.readFileSync(filePath(file), { encoding: "utf-8" });
      return JSON.parse(raw, BufferJSON.reviver);
    } catch {
      return null;
    }
  };

  const removeData = async (file: string) => {
    try {
      fs.unlinkSync(filePath(file));
    } catch {}
  };

  const creds: AuthenticationCreds =
    (await readData("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [_: string]: SignalDataTypeMap[typeof type] } = {};
          await Promise.all(
            ids.map(async id => {
              let value = await readData(`${type}-${id}`);
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.create(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async data => {
          const tasks: Promise<void>[] = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const file = `${category}-${id}`;
              tasks.push(value ? writeData(value, file) : removeData(file));
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: () => writeData(creds, "creds")
  };
};

export default useMultiFileAuthStateJson;
