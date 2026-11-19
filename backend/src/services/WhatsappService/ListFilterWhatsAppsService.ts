import { FindOptions } from "sequelize/types";
import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";
import Prompt from "../../models/Prompt";

interface Request {
  companyId: number;
  session?: number | string;
  channel?: string;
}

/**
 * Lista as conexões da empresa, opcionalmente restritas a um canal.
 *
 * O parâmetro `channel` tinha "whatsapp" como valor padrão, então OMITIR o
 * canal não trazia todas as conexões — trazia só as do Baileys. Quem usa
 * apenas WhatsApp Plus ou API Oficial recebia lista vazia e ficava sem nada
 * pra escolher na tela de agendamento (único consumidor desta rota).
 *
 * Agora ausência de canal significa "todos os canais", que é o que a palavra
 * "filtro opcional" sempre sugeriu.
 */
const ListFilterWhatsAppsService = async ({
  session,
  companyId,
  channel
}: Request): Promise<Whatsapp[]> => {
  const where: any = { companyId };

  // String vazia conta como ausência: é o que o frontend manda quando ainda
  // não há contato escolhido.
  if (channel) {
    where.channel = channel;
  }

  const options: FindOptions = { where };

  if (session !== undefined && session == 0) {
    options.attributes = { exclude: ["session"] };
  }

  const whatsapps = await Whatsapp.findAll(options);

  return whatsapps;
};



export default ListFilterWhatsAppsService;
