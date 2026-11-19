import getAuthenticatedClient from "./getAuthenticatedClient";
import { ensureGoogleLib } from "./oauthClient";

const ListCalendarsService = async (companyId: number) => {
  const { oauth2 } = await getAuthenticatedClient(companyId);
  const { google } = ensureGoogleLib();
  const calendar = google.calendar({ version: "v3", auth: oauth2 });
  const { data } = await calendar.calendarList.list();
  return (data.items || []).map((c: any) => ({
    id: c.id,
    summary: c.summary,
    primary: !!c.primary,
    timeZone: c.timeZone,
    accessRole: c.accessRole
  }));
};

export default ListCalendarsService;
