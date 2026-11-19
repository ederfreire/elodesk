import React, { useContext, useEffect, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Chip from "@material-ui/core/Chip";
import Menu from "@material-ui/core/Menu";
import MenuItem from "@material-ui/core/MenuItem";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import Typography from "@material-ui/core/Typography";
import Divider from "@material-ui/core/Divider";
import {
  Facebook,
  Instagram,
  MessageSquare,
  Chrome,
  Music2,
  Youtube,
  Globe,
  Users,
  CircleHelp,
  HelpCircle,
  Megaphone,
  Pencil,
} from "lucide-react";

import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";

/**
 * Seletor de "Origem do lead" do cabeçalho do atendimento.
 *
 * O que fica salvo no contato é o NOME da origem, não o id. Assim, se alguém
 * apagar uma origem em Configurações, o histórico dos contatos que vieram por
 * ela continua legível no relatório em vez de virar um id órfão.
 */

// Mapa chave -> ícone. A chave vem do banco (`LeadSources.icon`); guardar a
// chave e não o desenho deixa a troca de biblioteca de ícones ser um detalhe
// só do frontend.
const ICONES = {
  facebook: Facebook,
  instagram: Instagram,
  messenger: MessageSquare,
  google: Chrome,
  tiktok: Music2,
  youtube: Youtube,
  organic: Globe,
  referral: Users,
  other: CircleHelp || HelpCircle,
};

export const iconeDaOrigem = chave => ICONES[chave] || ICONES.other;

const useStyles = makeStyles(theme => ({
  chip: {
    height: 24,
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    maxWidth: 200,
  },
  chipVazio: {
    color: theme.palette.text.secondary,
    borderStyle: "dashed",
  },
  cabecalhoMenu: {
    padding: "10px 16px 6px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: theme.palette.text.secondary,
  },
  item: { fontSize: 14 },
  iconeItem: { minWidth: 34 },
}));

const LeadSourceSelector = ({ contact, onUpdated }) => {
  const classes = useStyles();
  const { user, socket } = useContext(AuthContext);

  const [origens, setOrigens] = useState([]);
  const [ancora, setAncora] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    try {
      const { data } = await api.get("/lead-sources");
      setOrigens(Array.isArray(data) ? data.filter(o => o.active) : []);
    } catch {
      // Lista indisponível não pode derrubar o cabeçalho do atendimento.
      setOrigens([]);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  // Origem cadastrada em Configurações aparece aqui sem recarregar a página.
  useEffect(() => {
    if (!socket || !user?.companyId) return undefined;

    const evento = `company-${user.companyId}-leadSource`;
    const aoMudar = () => carregar();

    socket.on(evento, aoMudar);
    return () => socket.off(evento, aoMudar);
  }, [socket, user?.companyId]);

  const escolher = async nome => {
    setAncora(null);
    if (salvando || !contact?.id) return;

    setSalvando(true);
    try {
      const { data } = await api.put(`/contacts/${contact.id}/lead-source`, {
        leadSource: nome,
      });
      toast.success(i18n.t("leadSource.saved"));
      if (onUpdated) onUpdated(data);
    } catch (err) {
      toastError(err);
    } finally {
      setSalvando(false);
    }
  };

  const atual = contact?.leadSource || "";
  const origemAtual = origens.find(o => o.name === atual);
  // Origem apagada da lista continua sendo exibida, com ícone e cor neutros.
  const Icone = origemAtual ? iconeDaOrigem(origemAtual.icon) : Megaphone;

  return (
    <>
      <Chip
        size="small"
        variant="outlined"
        className={`${classes.chip} ${!atual ? classes.chipVazio : ""}`}
        onClick={e => {
          e.stopPropagation();
          setAncora(e.currentTarget);
        }}
        icon={
          <Icone
            size={13}
            strokeWidth={2}
            style={{ marginLeft: 8, color: origemAtual?.color || undefined }}
          />
        }
        label={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            {atual || i18n.t("leadSource.chipEmpty")}
            <Pencil size={11} strokeWidth={2} />
          </span>
        }
      />

      {/*
        onClick com stopPropagation no MENU inteiro.

        O Menu do MUI e renderizado num portal, fora da arvore do DOM — mas o
        sistema de eventos do React propaga pela arvore de COMPONENTES, nao
        pela do DOM. Como este componente e filho do cabecalho do atendimento,
        que tem onClick para abrir o painel do contato, clicar numa opcao do
        menu subia ate la e abria o painel junto.

        Era o "quando escolho a origem, abre o card do contato". O
        stopPropagation no chip resolvia so o clique que ABRE o menu; faltava
        o dos itens dentro dele.
      */}
      <Menu
        onClick={e => e.stopPropagation()}
        anchorEl={ancora}
        open={Boolean(ancora)}
        onClose={(e, motivo) => {
          if (e?.stopPropagation) e.stopPropagation();
          setAncora(null);
        }}
        getContentAnchorEl={null}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Typography className={classes.cabecalhoMenu}>
          {i18n.t("leadSource.menuTitle")}
        </Typography>

        {origens.length === 0 && (
          <MenuItem disabled className={classes.item}>
            {i18n.t("leadSource.empty")}
          </MenuItem>
        )}

        {origens.map(origem => {
          const IconeItem = iconeDaOrigem(origem.icon);
          return (
            <MenuItem
              key={origem.id}
              selected={origem.name === atual}
              className={classes.item}
              onClick={() => escolher(origem.name)}
            >
              <ListItemIcon className={classes.iconeItem}>
                <IconeItem size={18} strokeWidth={2} color={origem.color} />
              </ListItemIcon>
              {origem.name}
            </MenuItem>
          );
        })}

        {atual && (
          <>
            <Divider />
            <MenuItem className={classes.item} onClick={() => escolher("")}>
              {i18n.t("leadSource.clear")}
            </MenuItem>
          </>
        )}
      </Menu>
    </>
  );
};

export default LeadSourceSelector;
