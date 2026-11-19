import { getIO } from "../../libs/socket";
import Contact from "../../models/Contact";

interface ExtraInfo {
  name: string;
  value: string;
}

interface Request {
  name: string;
  number: string;
  isGroup: boolean;
  email?: string;
  commandBot?: string;
  profilePicUrl?: string;
  extraInfo?: ExtraInfo[];
  companyId: number;
  whatsappId?: number;
  birthDate?: Date | string;
}

const CreateOrUpdateContactServiceForImport = async ({
  name,
  number: rawNumber,
  profilePicUrl,
  isGroup,
  email = "",
  commandBot = "",
  extraInfo = [],
  companyId,
  whatsappId,
  birthDate
}: Request): Promise<Contact> => {
  // Normalizar número de telefone para evitar duplicações com formatos diferentes.
  // Corta primeiro qualquer sufixo de dispositivo multi-device
  // ("558198593719:0" -> "558198593719") ANTES de tirar os caracteres
  // não-numéricos — mesma ordem que verifyContact.ts usa no fluxo de
  // mensagem ao vivo. Sem isso, o ":0" virava um "0" colado no final do
  // número (um número diferente do real), que podia coincidir por acaso
  // com o de outro contato já existente e sobrescrever nome/foto dele
  // (bug relatado: import trazendo a foto de um contato pra outro).
  const number = isGroup ? rawNumber : rawNumber.split(":")[0].replace(/[^0-9]/g, "");
  
  const io = getIO();
  let contact: Contact | null;

  try {
    // Buscar contato existente
    contact = await Contact.findOne({ where: { number, companyId } });

    if (contact) {
      // Atualizar contato existente
      if (contact.companyId === null) {
        await contact.update({ 
          name, 
          profilePicUrl, 
          companyId,
          email: email || contact.email,
          whatsappId: whatsappId || contact.whatsappId,
          birthDate
        });
      } else {
        await contact.update({ 
          name, 
          profilePicUrl,
          email: email || contact.email,
          whatsappId: whatsappId || contact.whatsappId,
          birthDate
        });
      }

      io.of(String(companyId))
        .emit(`company-${companyId}-contact`, {
          action: "update",
          contact
        });
    } else {
      // Criar novo contato
      contact = await Contact.create({
        name,
        companyId,
        number,
        profilePicUrl,
        email,
        commandBot,
        isGroup,
        extraInfo,
        whatsappId,
        birthDate
      });

      io.of(String(companyId))
        .emit(`company-${companyId}-contact`, {
          action: "create",
          contact
        });
    }

    return contact;
  } catch (error) {
    throw new Error(`Erro ao criar/atualizar contato: ${error.message}`);
  }
};

export default CreateOrUpdateContactServiceForImport;
