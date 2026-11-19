import { Op, fn, col, where, literal } from "sequelize";
import Campaign from "../../models/Campaign";
import { isEmpty } from "lodash";
import ContactList from "../../models/ContactList";
import Whatsapp from "../../models/Whatsapp";

interface Request {
  companyId: number | string;
  searchParam?: string;
  pageNumber?: string;
  pageSize?: string;
  status?: string;
  isRecurring?: string;
}

interface Response {
  records: any[];
  count: number;
  hasMore: boolean;
  totalPages: number;
  currentPage: number;
  pageSize: number;
}

const ListService = async ({
  searchParam = "",
  pageNumber = "1",
  pageSize = "10",
  companyId,
  status,
  isRecurring
}: Request): Promise<Response> => {
  let whereCondition: any = {
    companyId
  };

  // Filtro por status
  if (status && status !== "") {
    whereCondition.status = status;
  }

  // Filtro por recorrência
  if (isRecurring && isRecurring !== "") {
    if (isRecurring === "true") {
      whereCondition.isRecurring = true;
    } else if (isRecurring === "false") {
      whereCondition.isRecurring = false;
    }
  }

  // Filtro por busca de texto
  if (!isEmpty(searchParam)) {
    whereCondition = {
      ...whereCondition,
      [Op.or]: [
        {
          name: where(
            fn("LOWER", col("Campaign.name")),
            "LIKE",
            `%${searchParam.toLowerCase().trim()}%`
          )
        }
      ]
    };
  }

  const limit = parseInt(pageSize);
  const offset = limit * (+pageNumber - 1);

  const { count, rows: records } = await Campaign.findAndCountAll({
    where: whereCondition,
    limit,
    offset,
    order: [["status", "ASC"], ["scheduledAt", "DESC"]],
    attributes: {
      include: [
        [
          literal(`(SELECT COUNT(*) FROM "CampaignShipping" WHERE "CampaignShipping"."campaignId" = "Campaign"."id")`),
          "shippingTotal"
        ],
        [
          literal(`(SELECT COUNT(*) FROM "CampaignShipping" WHERE "CampaignShipping"."campaignId" = "Campaign"."id" AND "CampaignShipping"."deliveredAt" IS NOT NULL)`),
          "shippingDelivered"
        ],
        [
          literal(`(SELECT COUNT(*) FROM "CampaignShipping" WHERE "CampaignShipping"."campaignId" = "Campaign"."id" AND "CampaignShipping"."confirmationRequestedAt" IS NOT NULL)`),
          "shippingConfirmed"
        ],
        // Nome da Tag vinculada (quando a campanha usa tagListId em vez de contactListId)
        [
          literal(`(SELECT "name" FROM "Tags" WHERE CAST("Tags"."id" AS TEXT) = "Campaign"."tagListId" LIMIT 1)`),
          "tagListName"
        ]
      ]
    },
    include: [
      { model: ContactList, required: false },
      {
        model: Whatsapp,
        attributes: ["id", "name", "color", "status", "isOficial", "channel"],
        required: false
      }
    ],
    subQuery: false
  });

  const totalPages = Math.ceil(count / limit);
  const hasMore = +pageNumber < totalPages;

  return {
    records,
    count,
    hasMore,
    totalPages,
    currentPage: +pageNumber,
    pageSize: limit
  };
};

export default ListService;
