// src/services/ContactServices/UpdateContactService.ts - CORRIGIDO
import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";
import ContactCustomField from "../../models/ContactCustomField";
import DeleteContactWalletService from "./DeleteContactWalletService";
import UpdateContactWalletsService from "./UpdateContactWalletsService";

interface ExtraInfo {
  id?: number;
  name: string;
  value: string;
}

interface ContactData {
  email?: string;
  number?: string;
  name?: string;
  acceptAudioMessage?: boolean;
  active?: boolean;
  extraInfo?: ExtraInfo[];
  disableBot?: boolean;
  remoteJid?: string;
  contactWallets?: null | number[] | string[];
  birthDate?: Date | string; // 🎂 NOVO CAMPO ADICIONADO
}

interface Request {
  contactData: ContactData;
  contactId: string;
  companyId: number;
}

const updateCustomFields = async (
  contactId: number,
  extraInfo: ExtraInfo[]
) => {
  const currentFields = await ContactCustomField.findAll({
    where: { contactId }
  });

  await Promise.all(
    extraInfo.map(async (info: ExtraInfo) => {
      const existingField = currentFields.find(
        field => field.name === info.name
      );
      if (existingField) {
        await existingField.update({ value: info.value });
      } else {
        await ContactCustomField.create({ ...info, contactId });
      }
    })
  );

  await Promise.all(
    currentFields.map(async oldInfo => {
      const stillExists = extraInfo.find(info => info.name === oldInfo.name);
      if (!stillExists) {
        await ContactCustomField.destroy({ where: { id: oldInfo.id } });
      }
    })
  );
};

const UpdateContactService = async ({
  contactData,
  contactId,
  companyId
}: Request): Promise<Contact> => {
  const {
    email,
    name,
    number,
    extraInfo,
    acceptAudioMessage,
    active,
    disableBot,
    remoteJid,
    contactWallets,
    birthDate // 🎂 INCLUIR NO DESTRUCTURING
  } = contactData;

  const contact = await Contact.findOne({
    where: { id: contactId },
    include: ["extraInfo"]
  });

  if (!contact) {
    throw new AppError("Contato não encontrado", 404);
  }

  if (contact.companyId !== companyId) {
    throw new AppError("Não é possível alterar registros de outra empresa");
  }

  if (extraInfo) {
    await updateCustomFields(contact.id, extraInfo);
  }

  if (contactWallets) {
    await DeleteContactWalletService({
      contactId,
      companyId
    });

    // `for...of` (e não forEach) — o forEach com callback async não era
    // aguardado, então a resposta voltava antes das carteiras serem
    // gravadas e corria com o PUT /contacts/wallet do modal, fazendo a
    // carteira "não salvar".
    for (const wallet of contactWallets as any[]) {
      const userId = wallet?.walletId ?? wallet?.userId ?? wallet?.wallet?.id;
      const queueId = wallet?.queueId ?? wallet?.queue?.id;
      if (!userId) continue;
      await UpdateContactWalletsService({
        userId,
        queueId,
        contactId,
        companyId
      });
    }
  }


  // 🎂 PROCESSAR DATA DE NASCIMENTO - CORREÇÃO DE TIMEZONE
  let processedBirthDate: Date | null = contact.birthDate;
  if (birthDate !== undefined) {
    if (birthDate === null || birthDate === '') {
      processedBirthDate = null;
    } else if (typeof birthDate === 'string') {
      // Se vier no formato ISO, extrair apenas a parte da data
      const dateOnly = birthDate.split('T')[0];
      // Criar data local com meio-dia para evitar problemas de timezone
      const [year, month, day] = dateOnly.split('-').map(Number);
      processedBirthDate = new Date(year, month - 1, day, 12, 0, 0);
    } else if (birthDate instanceof Date) {
      // Se for objeto Date, criar nova data local com meio-dia
      const year = birthDate.getFullYear();
      const month = birthDate.getMonth();
      const day = birthDate.getDate();
      processedBirthDate = new Date(year, month, day, 12, 0, 0);
    }
  }

  await contact.update({
    name,
    number,
    email,
    acceptAudioMessage,
    active,
    disableBot,
    remoteJid,
    birthDate: processedBirthDate // 🎂 INCLUIR NO UPDATE
  });

  await contact.reload({
    include: ["extraInfo"]
  });

  return contact;
};

export default UpdateContactService;