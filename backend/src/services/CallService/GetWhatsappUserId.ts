import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";

const GetWhatsappUserId = async (id: number) => {
  const user = await User.findOne({
    include: [{
      model: Whatsapp,
      as: "whatsapps",
      through: { attributes: [] },
      attributes: ["id", "status", "name", "companyId", "wavoip"],
      required: false
    }],
    where: { id }
  });

  if (!user) return { whatsapps: [] };

  const whatsapps = (user as any).whatsapps || [];
  const plainWhatsapps = whatsapps.map((w: any) => w.get ? w.get({ plain: true }) : w);

  return { whatsapps: plainWhatsapps };
};

export default GetWhatsappUserId;
