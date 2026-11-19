import React from "react";
import { MenuItem } from "@material-ui/core";

/**
 * Lista única de fusos, espelhando a que já existia no UserModal, para que o
 * expediente (empresa / conexão / fila) ofereça exatamente as mesmas opções em
 * todos os lugares. Editar aqui reflete em todos os seletores.
 */
export const TIMEZONE_OPTIONS = [
  { value: "America/Sao_Paulo", label: "🇧🇷 (GMT-3) Brasília — São Paulo" },
  { value: "America/Manaus", label: "🇧🇷 (GMT-4) Manaus" },
  { value: "America/Rio_Branco", label: "🇧🇷 (GMT-5) Rio Branco" },
  { value: "America/Noronha", label: "🇧🇷 (GMT-2) Fernando de Noronha" },
  { value: "America/Argentina/Buenos_Aires", label: "🇦🇷 (GMT-3) Buenos Aires" },
  { value: "America/Santiago", label: "🇨🇱 (GMT-3) Santiago" },
  { value: "America/Bogota", label: "🇨🇴 (GMT-5) Bogotá" },
  { value: "America/Lima", label: "🇵🇪 (GMT-5) Lima" },
  { value: "America/Mexico_City", label: "🇲🇽 (GMT-6) México DF" },
  { value: "America/New_York", label: "🇺🇸 (GMT-5) Nova York" },
  { value: "America/Los_Angeles", label: "🇺🇸 (GMT-8) Los Angeles" },
  { value: "Europe/Lisbon", label: "🇵🇹 (GMT+0) Lisboa" },
  { value: "Europe/London", label: "🇬🇧 (GMT+0) Londres" },
  { value: "Europe/Madrid", label: "🇪🇸 (GMT+1) Madrid" },
  { value: "Europe/Paris", label: "🇫🇷 (GMT+1) Paris" },
  { value: "Europe/Berlin", label: "🇩🇪 (GMT+1) Berlim" },
  { value: "Africa/Luanda", label: "🇦🇴 (GMT+1) Luanda" },
  { value: "Africa/Maputo", label: "🇲🇿 (GMT+2) Maputo" },
  { value: "Asia/Dubai", label: "🇦🇪 (GMT+4) Dubai" },
  { value: "Asia/Riyadh", label: "🇸🇦 (GMT+3) Riade" },
  { value: "Asia/Istanbul", label: "🇹🇷 (GMT+3) Istambul" },
  { value: "Asia/Tokyo", label: "🇯🇵 (GMT+9) Tóquio" }
];

/**
 * Renderiza apenas os <MenuItem> do fuso, para uso dentro de um <Select> já
 * existente (Formik ou controlado). Mantém a implementação simples e sem
 * dependências de estilo, para encaixar em qualquer modal.
 */
export const TimezoneMenuItems = () =>
  TIMEZONE_OPTIONS.map(tz => (
    <MenuItem key={tz.value} value={tz.value}>
      {tz.label}
    </MenuItem>
  ));

export default TimezoneMenuItems;
