import getAppointmentBookingMessage from "../BookingMessages";

describe("getAppointmentBookingMessage", () => {
  it("uses the default message when no custom text is configured", () => {
    expect(
      getAppointmentBookingMessage(
        { servicePrompt: "   " },
        "servicePrompt",
        "Qual serviço deseja agendar?"
      )
    ).toBe("Qual serviço deseja agendar?");
  });

  it("uses custom text and interpolates booking details", () => {
    expect(
      getAppointmentBookingMessage(
        { confirmation: "Confirmar {{service}} com {{professional}} em {{when}}?" },
        "confirmation",
        "Default",
        {
          service: "Corte",
          professional: "Ana",
          when: "20/11 às 14:00"
        }
      )
    ).toBe("Confirmar Corte com Ana em 20/11 às 14:00?");
  });

  it("keeps unknown placeholders visible", () => {
    expect(
      getAppointmentBookingMessage(
        { confirmation: "Reserva {{unknown}}" },
        "confirmation",
        "Default"
      )
    ).toBe("Reserva {{unknown}}");
  });
});
