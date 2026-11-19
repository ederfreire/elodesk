import Schedule from "../../models/Schedule";
import AppError from "../../errors/AppError";
import { removerEventoDoAgendamento } from "../GoogleCalendarService/SyncScheduleEventService";

const DeleteService = async (id: string | number, companyId: number): Promise<void> => {
  const schedule = await Schedule.findOne({
    where: { id, companyId }
  });

  if (!schedule) {
    throw new AppError("ERR_NO_SCHEDULE_FOUND", 404);
  }

  // Apaga o evento no Google ANTES de destruir a linha — depois do destroy
  // o googleEventId se perde e o compromisso ficaria para sempre na agenda
  // do profissional, sem nenhum agendamento correspondente no sistema.
  //
  // Não bloqueia a exclusão: o serviço engole a falha e registra no log.
  await removerEventoDoAgendamento(schedule);

  await schedule.destroy();
};

export default DeleteService;
