import React, { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, IconButton, MenuItem, TextField, CircularProgress, Chip
} from "@mui/material";
import HubIcon from "@mui/icons-material/Hub";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import WebhookIcon from "@mui/icons-material/Webhook";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import { Handle } from "react-flow-renderer";
import { useNodeStorage } from "../../../stores/useNodeStorage";
import api from "../../../services/api";
import { i18n } from "../../../translate/i18n";

const PRESETS = {
  typebot: {
    label: "Typebot",
    icon: SmartToyIcon,
    color: "#0042DA",
    emptyMsgKey: "integrationNode.emptyTypebot"
  },
  n8n: {
    label: "n8n",
    icon: WebhookIcon,
    color: "#EA4B71",
    emptyMsgKey: "integrationNode.emptyN8n"
  },
  default: {
    label: "Integração",
    icon: HubIcon,
    color: "#d32f2f",
    emptyMsgKey: "integrationNode.emptyGeneric"
  }
};

const IntegrationNode = React.memo(({ data, id }) => {
  const storageItems = useNodeStorage();
  const filterType = data?.filterType || null;
  const preset = PRESETS[filterType] || PRESETS.default;
  const HeaderIcon = preset.icon;
  const [integrations, setIntegrations] = useState([]);
  const [queueIntegrationId, setQueueIntegrationId] = useState(data.queueIntegrationId || "");
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const loadIntegrations = async () => {
    setLoading(true);
    setErrMsg("");
    try {
      // Busca todas as páginas para garantir que todas as integrações apareçam
      const all = [];
      let page = 1;
      let hasMore = true;
      while (hasMore && page < 20) {
        const { data: resp } = await api.get("/queueIntegration", {
          params: { pageNumber: page, searchParam: "" }
        });
        const items = Array.isArray(resp?.queueIntegrations) ? resp.queueIntegrations : [];
        all.push(...items);
        hasMore = !!resp?.hasMore && items.length > 0;
        page += 1;
      }
      const filtered = filterType
        ? all.filter(i => String(i.type || "").toLowerCase() === filterType)
        : all;
      setIntegrations(filtered);
      if (!filtered.length) {
        setErrMsg(i18n.t(preset.emptyMsgKey, {
          "integrationNode.emptyTypebot": "Nenhuma integração Typebot cadastrada.",
          "integrationNode.emptyN8n": "Nenhuma integração n8n cadastrada.",
          "integrationNode.emptyGeneric": "Nenhuma integração cadastrada. Crie em Integrações > Filas."
        }[preset.emptyMsgKey]));
      }
    } catch (e) {
      console.error("[IntegrationNode] Erro ao carregar integrações:", e);
      setErrMsg(e?.response?.data?.error || e?.message || "Falha ao carregar integrações");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIntegrations();
    const reload = () => loadIntegrations();
    window.addEventListener("queueIntegration:updated", reload);
    return () => window.removeEventListener("queueIntegration:updated", reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType]);

  useEffect(() => {
    data.queueIntegrationId = queueIntegrationId;
    const found = integrations.find(i => String(i.id) === String(queueIntegrationId));
    if (found) {
      data.integrationName = found.name;
      data.integrationType = found.type;
    }
  }, [queueIntegrationId, integrations, data]);

  return (
    <Box sx={{
      backgroundColor: "#fff",
      borderRadius: 2,
      boxShadow: 2,
      p: 2,
      width: 280,
      display: "flex",
      flexDirection: "column",
      gap: 1.2,
      position: "relative",
      border: `1px solid ${preset.color}55`
    }}
    >
      <Handle type="target" position="left" id="integration-in"
        style={{ left: -8, top: "50%", transform: "translateY(-50%)", background: "#555", width: 12, height: 12 }} />

      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <HeaderIcon fontSize="small" sx={{ color: preset.color }} />
          <Typography variant="subtitle2" fontWeight="bold">{preset.label}</Typography>
        </Box>
        <Box className="nodrag" sx={{ display: "flex", gap: 0.5 }}>
          <IconButton size="small" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); storageItems.setNodesStorage(id); storageItems.setAct("duplicate"); }}>
            <ContentCopyIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); storageItems.setNodesStorage(id); storageItems.setAct("disconnect"); }}>
            <LinkOffIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); storageItems.setNodesStorage(id); storageItems.setAct("delete"); }}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      <TextField
        className="nodrag nowheel"
        select
        size="small"
        label={preset.label}
        value={queueIntegrationId}
        onChange={(e) => setQueueIntegrationId(e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        fullWidth
        SelectProps={{
          onOpen: loadIntegrations,
          MenuProps: {
            disablePortal: false,
            container: typeof document !== "undefined" ? document.body : undefined,
            disableScrollLock: true,
            PaperProps: { sx: { zIndex: 99999 } },
            sx: { zIndex: 99999 }
          }
        }}
        helperText={
          loading
            ? i18n.t("integrationNode.loadingIntegrations", "Carregando integrações...")
            : errMsg
            ? errMsg
            : i18n.t("integrationNode.available", "{{count}} integração(ões) disponível(is)", { count: integrations.length })
        }
        error={!!errMsg && !loading}
      >
        <MenuItem value="">
          <em>{i18n.t("integrationNode.select", "Selecione...")}</em>
        </MenuItem>
        {loading && (
          <MenuItem disabled>
            <CircularProgress size={14} sx={{ mr: 1 }} /> {i18n.t("integrationNode.loading", "Carregando...")}
          </MenuItem>
        )}
        {!loading && integrations.length === 0 && (
          <MenuItem disabled>
            <em>{i18n.t("integrationNode.empty", "Nenhuma integração encontrada")}</em>
          </MenuItem>
        )}
        {integrations.map((i) => (
          <MenuItem key={i.id} value={String(i.id)}>
            {i.name} {i.type ? `(${i.type})` : ""}
          </MenuItem>
        ))}
      </TextField>

      {data?.nodeName ? (
        <Chip size="small" label={data.nodeName} sx={{ alignSelf: "flex-start" }} />
      ) : null}

      <Handle type="source" position="right" id="a"
        style={{ right: -8, top: "50%", transform: "translateY(-50%)", background: "#555", width: 12, height: 12 }} />
    </Box>
  );
});

export default IntegrationNode;