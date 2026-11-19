type BookingMessageVariables = Record<string, string>;

const getAppointmentBookingMessage = (
  messages: Record<string, unknown> | undefined,
  key: string,
  fallback: string,
  variables: BookingMessageVariables = {}
): string => {
  const configured = messages?.[key];
  const template =
    typeof configured === "string" && configured.trim()
      ? configured
      : fallback;

  return template.replace(
    /\{\{\s*([\w.]+)\s*\}\}/g,
    (placeholder, variable: string) =>
      Object.prototype.hasOwnProperty.call(variables, variable)
        ? variables[variable]
        : placeholder
  );
};

export default getAppointmentBookingMessage;
