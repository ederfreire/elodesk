/**
 * Icones do menu lateral, desenhados pelo Lucide.
 *
 * POR QUE UM ADAPTADOR EM VEZ DE TROCAR OS 42 PONTOS DE USO
 * O MainListItems.js usa cada icone em varios lugares (<DashboardOutlinedIcon />
 * aparece em submenu, atalho e cabecalho). Trocar import por import obrigaria a
 * revisar todos eles e qualquer engano so apareceria em runtime, numa tela
 * especifica. Aqui os nomes EXPORTADOS sao os mesmos que o menu ja usa, entao
 * o MainListItems troca 34 linhas de import por uma so e nenhum ponto de uso
 * muda. Se voce quiser voltar atras, basta restaurar os imports antigos: este
 * arquivo nao tem nenhuma outra dependencia no projeto.
 *
 * POR QUE `escolher()` EM VEZ DE IMPORT NOMEADO
 * O Lucide renomeia icones entre versoes (HelpCircle virou CircleHelp,
 * MoreVertical virou EllipsisVertical, etc) e mantem o nome antigo como alias
 * por um tempo. Um `import { CircleHelp }` quebraria o build inteiro numa
 * versao que ainda nao tem esse nome — e o erro seria um "export not found"
 * sem pista de qual icone. Importando o namespace e escolhendo o primeiro
 * nome que existir, a troca de versao degrada para o alias antigo em vez de
 * derrubar o build.
 */
import React from "react";
import * as Lucide from "lucide-react";

// Tamanho e espessura do traco. 20/1.75 e o que aproxima o Lucide do peso
// visual que o SvgIcon do MUI tinha no menu; o padrao do Lucide (24/2) fica
// grande e pesado demais ao lado do texto em Inter 14px.
const TAMANHO = 20;
const ESPESSURA = 1.75;

const escolher = (...nomes) => {
  for (const nome of nomes) {
    if (Lucide[nome]) return Lucide[nome];
  }
  // Ultimo recurso: um circulo, para o menu nunca quebrar por causa de um
  // icone que sumiu do pacote.
  return Lucide.Circle;
};

const criar = (...nomes) => {
  const Icone = escolher(...nomes);
  const Componente = props => (
    <Icone
      size={TAMANHO}
      strokeWidth={ESPESSURA}
      absoluteStrokeWidth
      {...props}
    />
  );
  Componente.displayName = nomes[0];
  return Componente;
};

// ── Mapa: nome usado no menu -> icone(s) equivalentes no Lucide ─────────────
// Onde ha mais de um nome, o primeiro e o atual e os seguintes sao aliases de
// versoes anteriores do Lucide.

export const DashboardOutlinedIcon = criar("LayoutDashboard");
export const Dashboard = criar("LayoutDashboard");
export const Assessment = criar("ChartColumn", "BarChart3", "BarChart");
export const GridOn = criar("Grid3x3", "Grid3X3", "Grid");

// O Lucide nao tem icones de marca (removeu WhatsApp, Facebook etc. por
// licenciamento). MessageCircle e o substituto neutro para "conversa".
export const WhatsAppIcon = criar("MessageCircle");
export const ForumIcon = criar("MessagesSquare", "MessageSquare");

export const ViewKanban = criar("Columns3", "Columns", "Trello");
export const ContactPhoneOutlinedIcon = criar("Contact", "ContactRound");
export const PhoneIcon = criar("PhoneCall", "Phone");
export const Schedule = criar("Clock");
export const EventAvailableIcon = criar("CalendarCheck");
export const HelpOutlineIcon = criar("CircleHelp", "HelpCircle");
export const LocalOfferIcon = criar("Tag");
export const CakeIcon = criar("Cake");

export const FlashOnIcon = criar("Zap");
export const ShapeLine = criar("Spline");
export const AccountTreeOutlinedIcon = criar("Workflow", "Network");
export const DeviceHubOutlined = criar("Waypoints", "Share2");
export const AllInclusive = criar("Infinity");
export const Webhook = criar("Webhook");
export const CodeRoundedIcon = criar("Code");
export const AnnouncementIcon = criar("Megaphone");

export const PeopleAltOutlinedIcon = criar("UsersRound", "Users");
export const BusinessIcon = criar("Building2", "Building");
export const AccountBalanceWalletIcon = criar("Wallet");
export const LocalAtmIcon = criar("CircleDollarSign", "DollarSign");
export const SettingsOutlinedIcon = criar("Settings");
export const PhonelinkSetup = criar("Settings2", "SlidersHorizontal");

export const SyncAltIcon = criar("ArrowLeftRight", "ArrowRightLeft");
export const SwapHorizIcon = criar("ArrowLeftRight", "ArrowRightLeft");
export const AttachFile = criar("Paperclip");
export const Description = criar("FileText");

export const MonitorHeartIcon = criar("Activity", "HeartPulse");

export const ExpandLessIcon = criar("ChevronUp");
export const ExpandMoreIcon = criar("ChevronDown");
