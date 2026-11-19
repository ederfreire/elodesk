import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import CampaignShipping from "../../models/CampaignShipping";
import Campaign from "../../models/Campaign";
import ContactTag from "../../models/ContactTag";
import Contact from "../../models/Contact";
import ContactListItem from "../../models/ContactListItem";
import { Op } from "sequelize";

/** Quebra de leads por origem, dentro do relatorio da campanha. */
interface CampaignLeadSource {
  source: string;
  total: number;
}

interface CampaignStats {
  /**
   * Quantos contatos alcancados pela campanha vieram de cada origem.
   * Opcional: se a consulta de quebra falhar, o restante do relatorio
   * continua valendo e o campo volta como lista vazia.
   */
  leadSources: CampaignLeadSource[];
  totalMessages: number;
  deliveredMessages: number;
  pendingMessages: number;
  failedMessages: number;
  uniqueNumbers: number;
  deliveryRate: number;
  confirmationRequested: number;
  confirmed: number;
  awaitingTemplateResponse: number;
  templateResponded: number;
  followUpsSent: number;
  followUpExpired: number;
}

const CampaignStatsService = async (campaignId: string | number): Promise<CampaignStats> => {
  try {
    // Buscar informações da campanha para determinar se é por TAG ou lista
    const campaign = await Campaign.findByPk(campaignId, {
      attributes: ["id", "tagListId", "contactListId", "companyId"]
    });

    if (!campaign) {
      throw new Error("Campanha não encontrada");
    }

    let totalContacts = 0;
    let uniqueNumbers = 0;

    // Se é campanha por TAG, contar contatos da tag
    if (campaign.tagListId && !campaign.contactListId) {
      
      // Contar contatos únicos da tag
      const contactTags = await ContactTag.findAll({
        where: { tagId: campaign.tagListId },
        attributes: ["contactId"],
        include: [
          {
            model: Contact,
            as: "contact",
            where: {
              companyId: campaign.companyId,
              active: true
            },
            attributes: ["id", "number"]
          }
        ],
        group: ["ContactTag.contactId", "contact.id", "contact.number"]
      });

      totalContacts = contactTags.length;
      uniqueNumbers = totalContacts;
      
    } else if (campaign.contactListId) {
      // Para campanhas por lista, contar contatos da lista
      
      totalContacts = await ContactListItem.count({
        where: { contactListId: campaign.contactListId }
      });
      
      // Para campanhas por lista, uniqueNumbers deve ser o total de contatos válidos da lista
      uniqueNumbers = totalContacts;
      
    } else {
      // Fallback para campanhas sem lista/tag específica
      
      const uniqueNumbersResult = await CampaignShipping.findAll({
        where: { campaignId },
        attributes: ['number'],
        group: ['number'],
        raw: true
      });
      uniqueNumbers = uniqueNumbersResult.length;
      totalContacts = uniqueNumbers;
    }

    // Buscar estatísticas de envio (sempre baseadas em CampaignShipping)
    const deliveredMessages = await CampaignShipping.count({
      where: {
        campaignId,
        deliveredAt: { [Op.ne]: null }
      }
    });

    const pendingMessages = await CampaignShipping.count({
      where: {
        campaignId,
        deliveredAt: null
      }
    });

    // Calcular mensagens pendentes baseado na diferença entre total da lista/tag e mensagens já processadas
    let totalMessages = deliveredMessages + pendingMessages;
    let actualPendingMessages = pendingMessages;
    
    if (campaign.tagListId && !campaign.contactListId) {
      // Para campanhas por TAG, o total deve ser o número de contatos da tag
      // Calcular pendentes reais incluindo contatos que ainda não foram processados
      const totalPendingFromTag = Math.max(0, totalContacts - totalMessages);
      actualPendingMessages = totalPendingFromTag;
      totalMessages = totalContacts;
      
    } else if (campaign.contactListId) {
      // Para campanhas por lista, o total deve ser o número de contatos da lista
      // Calcular pendentes reais incluindo contatos que ainda não foram processados
      const totalPendingFromList = Math.max(0, totalContacts - totalMessages);
      actualPendingMessages = totalPendingFromList;
      totalMessages = totalContacts;
      
    }

    // Buscar confirmações
    const confirmationRequested = await CampaignShipping.count({
      where: {
        campaignId,
        confirmationRequestedAt: { [Op.ne]: null }
      }
    });

    const confirmed = await CampaignShipping.count({
      where: {
        campaignId,
        confirmedAt: { [Op.ne]: null }
      }
    });

    // Estatísticas do follow-up para campanhas API Oficial:
    // - awaitingTemplateResponse: template enviado, aguardando resposta (sem follow-up nem expirado)
    // - templateResponded / followUpsSent: cliente respondeu e o sistema já enviou as mensagens 2-5
    // - followUpExpired: passou da janela de 24h sem resposta (marcado pelo job ExpireAwaitingFollowUps)
    const awaitingTemplateResponse = await CampaignShipping.count({
      where: {
        campaignId,
        awaitingResponseSince: { [Op.ne]: null },
        followUpSentAt: null,
        followUpExpiredAt: null
      } as any
    });

    const followUpsSent = await CampaignShipping.count({
      where: {
        campaignId,
        followUpSentAt: { [Op.ne]: null }
      } as any
    });

    const followUpExpired = await CampaignShipping.count({
      where: {
        campaignId,
        followUpExpiredAt: { [Op.ne]: null },
        followUpSentAt: null
      } as any
    });

    const templateResponded = followUpsSent;

    // Calcular taxa de entrega
    const deliveryRate = totalMessages > 0 ? (deliveredMessages / totalMessages) * 100 : 0;

    // Falhas são apenas mensagens que realmente falharam no envio, não pendentes
    const failedMessages = 0; // Por enquanto, não temos sistema de falhas implementado


    // ORIGEM DOS LEADS
    // Quebra por `Contact.leadSource` dos contatos alcancados pela campanha.
    // E o que liga a escolha que o atendente faz no cabecalho do atendimento
    // ao relatorio: sem isso a origem ficaria so no cadastro do contato,
    // sem responder "de onde veio quem essa campanha atingiu".
    let leadSources: CampaignLeadSource[] = [];
    try {
      const linhas: any[] = await sequelize.query(
        `
        SELECT COALESCE(NULLIF(c."leadSource", ''), :semOrigem) AS "source",
               COUNT(DISTINCT c."id") AS "total"
        FROM "CampaignShipping" cs
        INNER JOIN "Contacts" c
           ON regexp_replace(c."number", '\\D', '', 'g')
            = regexp_replace(cs."number", '\\D', '', 'g')
        WHERE cs."campaignId" = :campaignId
          AND c."companyId" = :companyId
        GROUP BY 1
        ORDER BY 2 DESC
        `,
        {
          replacements: {
            campaignId: campaign.id,
            companyId: campaign.companyId,
            semOrigem: "__sem_origem__"
          },
          type: QueryTypes.SELECT
        }
      );

      leadSources = linhas.map(l => ({
        source: l.source,
        total: Number(l.total) || 0
      }));
    } catch (err) {
      // Relatorio nao pode quebrar por causa da quebra por origem: sem ela,
      // o restante das estatisticas continua valendo.
      leadSources = [];
    }

    return {
      leadSources,
      totalMessages,
      deliveredMessages,
      pendingMessages: actualPendingMessages, // Usar os pendentes calculados corretamente
      failedMessages,
      uniqueNumbers,
      deliveryRate: Math.round(deliveryRate * 100) / 100, // Arredondar para 2 casas decimais
      confirmationRequested,
      confirmed,
      awaitingTemplateResponse,
      templateResponded,
      followUpsSent,
      followUpExpired
    };
  } catch (error) {
    console.error("Erro ao calcular estatísticas da campanha:", error);
    throw new Error("Erro interno do servidor");
  }
};

export default CampaignStatsService;
