import { head } from "lodash";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import ContactListItem from "../../models/ContactListItem";
import logger from "../../utils/logger";
import Whatsapp from "../../models/Whatsapp";
import { getWbot } from "../../libs/wbot";
import { getIO } from "../../libs/socket";
import WhatsappLidMap from "../../models/WhatsapplidMap";
import Contact from "../../models/Contact";

// Find a value in a row by trying a list of possible header names (case-insensitive)
const pick = (row: Record<string, any>, keys: string[]): string => {
  const lowerMap: Record<string, string> = {};
  Object.keys(row).forEach(k => { lowerMap[k.toLowerCase().trim()] = k; });
  for (const k of keys) {
    const realKey = lowerMap[k.toLowerCase()];
    if (realKey != null && row[realKey] != null && `${row[realKey]}`.trim() !== "") {
      return `${row[realKey]}`.trim();
    }
  }
  return "";
};

// Normalize a phone string to digits only; returns "" if invalid
const normalizePhone = (raw: string): string => {
  const digits = `${raw || ""}`.replace(/\D/g, "");
  if (digits.length < 8) return "";
  return digits;
};

// Collect every phone-like column value from the row (TELEFONE, TELEFONE1..N, TEL_1, CELULAR, PHONE, FONE, WHATSAPP)
const collectPhones = (row: Record<string, any>): string[] => {
  const re = /^(tel|telefone|celular|cel|phone|fone|whats?app|numero|n[uú]mero)[\s_\-]?\d*$/i;
  const out: string[] = [];
  for (const key of Object.keys(row)) {
    if (re.test(key.trim())) {
      const n = normalizePhone(row[key]);
      if (n) out.push(n);
    }
  }
  return out;
};

export async function ImportContacts(
  contactListId: number,
  companyId: number,
  file: Express.Multer.File | undefined
) {
  const filePath = file?.path as string;
  const ext = path.extname(file?.originalname || filePath).toLowerCase();

  let workbook: XLSX.WorkBook;
  if (ext === ".csv" || ext === ".txt") {
    // Read raw text and let sheetjs auto-detect separator (handles `;` and `,`)
    const raw = fs.readFileSync(filePath, "utf8");
    workbook = XLSX.read(raw, { type: "string", raw: false, cellText: true });
  } else {
    workbook = XLSX.readFile(filePath, { raw: false, cellText: true });
  }

  const worksheet = head(Object.values(workbook.Sheets)) as any;
  const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 0, defval: "", raw: false });

  type Parsed = { name: string; number: string; email: string; contactListId: number; companyId: number };
  const contacts: Parsed[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const name = pick(row, ["nome", "name", "contato", "cliente"]);
    const email = pick(row, ["email", "e-mail", "mail"]);
    const phones = collectPhones(row);

    if (phones.length === 0) continue;

    for (const phone of phones) {
      const key = `${phone}`;
      if (seen.has(key)) continue;
      seen.add(key);
      contacts.push({ name: name || phone, number: phone, email, contactListId, companyId });
    }
  }
  const contactList: ContactListItem[] = [];
  for (const contact of contacts) {
    const [newContact, created] = await ContactListItem.findOrCreate({
      where: {
        number: `${contact.number}`,
        contactListId: contact.contactListId,
        companyId: contact.companyId
      },
      defaults: contact
    });
    if (created) {
      contactList.push(newContact);
    }
  }

  if (contactList) {
    for (let newContact of contactList) {
      try {
        // ✅ v7: Verificar localmente via WhatsappLidMap antes de chamar onWhatsApp
        const existingContact = await Contact.findOne({
          where: { number: newContact.number, companyId }
        });

        if (existingContact) {
          const localMap = await WhatsappLidMap.findOne({
            where: { companyId, contactId: existingContact.id }
          });

          if (localMap) {
            newContact.isWhatsappValid = true;
            await newContact.save();
            logger.debug(`[ImportContacts] Contato ${newContact.number} validado localmente via WhatsappLidMap`);

            const io = getIO();
            io.of(String(companyId))
              .emit(`company-${companyId}-ContactListItem-${+contactListId}`, {
                action: "reload",
                records: [newContact]
              });
            continue;
          }
        }

        // Fallback: consultar onWhatsApp
        const whatsapp = await Whatsapp.findOne({ where: { companyId, status: 'CONNECTED', channel: 'whatsapp' }, limit: 1 });
        if (!whatsapp) {
          logger.warn(`[ImportContacts] Nenhum WhatsApp conectado para empresa ${companyId}. Pulando validação do contato ${newContact.number}`);
          continue;
        }
        const wbot = await getWbot(whatsapp.id);
        const response = await wbot.onWhatsApp(`${newContact.number}@s.whatsapp.net`);
       
        newContact.isWhatsappValid = response[0]?.exists ? true : false;
        newContact.number = response[0]?.exists ? response[0]?.jid.split("@")[0] : newContact.number;

        await newContact.save();
      } catch (e) {
        logger.error(`[ImportContacts] Número de contato inválido: ${newContact.number} - ${e.message}`);
      }
      const io = getIO();

      io.of(String(companyId))
        .emit(`company-${companyId}-ContactListItem-${+contactListId}`, {
          action: "reload",
          records: [newContact]
        });
    }
  }

  return contactList;
}
