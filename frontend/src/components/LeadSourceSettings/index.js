import React, { useEffect, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Button from "@material-ui/core/Button";
import IconButton from "@material-ui/core/IconButton";
import TextField from "@material-ui/core/TextField";
import MenuItem from "@material-ui/core/MenuItem";
import Switch from "@material-ui/core/Switch";
import Tooltip from "@material-ui/core/Tooltip";
import Typography from "@material-ui/core/Typography";
import CircularProgress from "@material-ui/core/CircularProgress";
import { Plus, Trash2, Check } from "lucide-react";

import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";
import { iconeDaOrigem } from "../LeadSourceSelector";

/**
 * Configuração das origens de lead.
 *
 * As origens são por empresa e editáveis aqui, e não uma lista fixa no
 * código: cada operação anuncia em canais diferentes, e travar a lista
 * obrigaria a mexer no sistema toda vez que uma campanha nova entrasse no ar.
 *
 * A semeadura das origens padrão acontece na primeira leitura da API (ver
 * LeadSourceController.index), não numa migration — uma migration rodaria uma
 * vez só, e empresas criadas depois nasceriam sem origem nenhuma.
 */

const ICONES_DISPONIVEIS = [
  "facebook",
  "instagram",
  "messenger",
  "google",
  "tiktok",
  "youtube",
  "organic",
  "referral",
  "other",
];

const useStyles = makeStyles(theme => ({
  raiz: { width: "100%" },
  descricao: {
    fontSize: 13,
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(2),
    lineHeight: 1.6,
  },
  linha: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.5),
    padding: theme.spacing(1.2),
    marginBottom: theme.spacing(1),
    borderRadius: 10,
    border: `1px solid ${theme.palette.divider}`,
  },
  previa: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: 38,
    height: 38,
    borderRadius: 10,
    background:
      theme.palette.type === "dark"
        ? "rgba(255,255,255,0.05)"
        : "rgba(15,23,42,0.04)",
  },
  campoNome: { flex: 2, minWidth: 140 },
  campoIcone: { flex: 1, minWidth: 130 },
  campoCor: { width: 62 },
  novaLinha: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.5),
    padding: theme.spacing(1.2),
    borderRadius: 10,
    border: `1px dashed ${theme.palette.divider}`,
  },
}));

const LeadSourceSettings = () => {
  const classes = useStyles();

  const [origens, setOrigens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [nova, setNova] = useState({ name: "", icon: "other", color: "#64748b" });

  const carregar = async () => {
    try {
      const { data } = await api.get("/lead-sources");
      setOrigens(Array.isArray(data) ? data : []);
    } catch (err) {
      toastError(err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  // Edita só no estado local; a gravação acontece no blur, para não disparar
  // um PUT por tecla digitada.
  const alterarLocal = (id, campo, valor) => {
    setOrigens(lista =>
      lista.map(o => (o.id === id ? { ...o, [campo]: valor } : o))
    );
  };

  const salvar = async origem => {
    try {
      await api.put(`/lead-sources/${origem.id}`, {
        name: origem.name,
        icon: origem.icon,
        color: origem.color,
        active: origem.active,
      });
    } catch (err) {
      toastError(err);
      carregar();
    }
  };

  const adicionar = async () => {
    if (!nova.name.trim()) {
      toast.warning(i18n.t("leadSourceSettings.nameRequired"));
      return;
    }
    try {
      await api.post("/lead-sources", {
        ...nova,
        name: nova.name.trim(),
        order: origens.length + 1,
      });
      setNova({ name: "", icon: "other", color: "#64748b" });
      toast.success(i18n.t("leadSourceSettings.added"));
      carregar();
    } catch (err) {
      toastError(err);
    }
  };

  const remover = async origem => {
    try {
      await api.delete(`/lead-sources/${origem.id}`);
      toast.success(i18n.t("leadSourceSettings.removed"));
      carregar();
    } catch (err) {
      toastError(err);
    }
  };

  if (carregando) {
    return <CircularProgress size={24} />;
  }

  const renderPrevia = (icone, cor) => {
    const Icone = iconeDaOrigem(icone);
    return (
      <span className={classes.previa}>
        <Icone size={20} strokeWidth={2} color={cor} />
      </span>
    );
  };

  return (
    <div className={classes.raiz}>
      <Typography className={classes.descricao}>
        {i18n.t("leadSourceSettings.description")}
      </Typography>

      {origens.map(origem => (
        <div key={origem.id} className={classes.linha}>
          {renderPrevia(origem.icon, origem.color)}

          <TextField
            size="small"
            variant="outlined"
            className={classes.campoNome}
            label={i18n.t("leadSourceSettings.name")}
            value={origem.name}
            onChange={e => alterarLocal(origem.id, "name", e.target.value)}
            onBlur={() => salvar(origem)}
          />

          <TextField
            select
            size="small"
            variant="outlined"
            className={classes.campoIcone}
            label={i18n.t("leadSourceSettings.icon")}
            value={origem.icon || "other"}
            onChange={e => {
              alterarLocal(origem.id, "icon", e.target.value);
              salvar({ ...origem, icon: e.target.value });
            }}
          >
            {ICONES_DISPONIVEIS.map(chave => (
              <MenuItem key={chave} value={chave}>
                {i18n.t(`leadSourceSettings.icons.${chave}`)}
              </MenuItem>
            ))}
          </TextField>

          <input
            type="color"
            className={classes.campoCor}
            value={origem.color || "#64748b"}
            onChange={e => alterarLocal(origem.id, "color", e.target.value)}
            onBlur={() => salvar(origem)}
            title={i18n.t("leadSourceSettings.color")}
          />

          <Tooltip
            title={
              origem.active
                ? i18n.t("leadSourceSettings.activeOn")
                : i18n.t("leadSourceSettings.activeOff")
            }
          >
            <Switch
              size="small"
              color="primary"
              checked={!!origem.active}
              onChange={e => {
                alterarLocal(origem.id, "active", e.target.checked);
                salvar({ ...origem, active: e.target.checked });
              }}
            />
          </Tooltip>

          <Tooltip title={i18n.t("leadSourceSettings.remove")}>
            <IconButton size="small" onClick={() => remover(origem)}>
              <Trash2 size={16} strokeWidth={2} color="#ef4444" />
            </IconButton>
          </Tooltip>
        </div>
      ))}

      <div className={classes.novaLinha}>
        {renderPrevia(nova.icon, nova.color)}

        <TextField
          size="small"
          variant="outlined"
          className={classes.campoNome}
          placeholder={i18n.t("leadSourceSettings.newPlaceholder")}
          value={nova.name}
          onChange={e => setNova({ ...nova, name: e.target.value })}
        />

        <TextField
          select
          size="small"
          variant="outlined"
          className={classes.campoIcone}
          value={nova.icon}
          onChange={e => setNova({ ...nova, icon: e.target.value })}
        >
          {ICONES_DISPONIVEIS.map(chave => (
            <MenuItem key={chave} value={chave}>
              {i18n.t(`leadSourceSettings.icons.${chave}`)}
            </MenuItem>
          ))}
        </TextField>

        <input
          type="color"
          className={classes.campoCor}
          value={nova.color}
          onChange={e => setNova({ ...nova, color: e.target.value })}
        />

        <Button
          size="small"
          variant="contained"
          color="primary"
          startIcon={<Plus size={16} strokeWidth={2.2} />}
          onClick={adicionar}
        >
          {i18n.t("leadSourceSettings.add")}
        </Button>
      </div>
    </div>
  );
};

export default LeadSourceSettings;
