import React, { useState, useEffect, useMemo } from "react";
import {
  Box, TextField, Typography, IconButton, Button,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Tabs, Tab, FormControlLabel, Checkbox, MenuItem, Divider
} from "@mui/material";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import SettingsIcon from "@mui/icons-material/Settings";
import { Handle } from "react-flow-renderer";
import { useNodeStorage } from "../../../stores/useNodeStorage";
import { i18n } from "../../../translate/i18n";

const DEFAULTS = {
  asaasToken: "",
  asaasEnvironment: "production",
  askMessage: "Para enviar a segunda via, digite seu CPF ou CNPJ (apenas números):",
  invalidMessage: "CPF/CNPJ inválido. Verifique e digite novamente:",
  maxAttempts: 3,
  giveUpMessage: "Não consegui validar seu CPF/CNPJ. Encaminhando para um atendente.",
  notFoundMessage: "Não localizei boletos pendentes para este CPF/CNPJ.",
  errorMessage: "Não consegui consultar agora. Tente novamente em instantes.",
  headerMessage: "*Segunda via dos seus boletos:*",
  boletoTemplate:
    "*{{indice}}.* {{descricao}}\nValor: {{valor}}\nVencimento: {{vencimento}}\nStatus: {{status}}\nLink: {{linkBoleto}}",
  statuses: ["PENDING", "OVERDUE"],
  sendMode: "single",
  sendPixQrCode: false, // legado
  pixDelivery: "none", // none | copypaste | qrimage | both
  pixMessageTemplate: "*PIX Copia e Cola:*\n```{{pixCopiaCola}}```",
  pixQrCaption: "QR Code PIX para pagamento",
  finalMessage: "Posso ajudar em algo mais?",
  countVariable: "",
  sortBy: "dueDate",
  sortOrder: "asc",
  inputTimeoutSeconds: 0,
  timeoutMessage: "Você ainda está aí? Por favor, digite seu CPF ou CNPJ (apenas números):"
};

const AsaasBoletoNode = React.memo(({ data, id }) => {
  const storageItems = useNodeStorage();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(0);

  const [cfg, setCfg] = useState(() => ({ ...DEFAULTS, ...(data || {}) }));

  useEffect(() => {
    Object.assign(data, cfg);
  }, [cfg, data]);

  const set = (k) => (e) => {
    const v = e?.target?.type === "checkbox" ? e.target.checked : e?.target?.value;
    setCfg((c) => ({ ...c, [k]: v }));
  };

  const toggleStatus = (status) => {
    setCfg((c) => {
      const has = c.statuses.includes(status);
      return { ...c, statuses: has ? c.statuses.filter((s) => s !== status) : [...c.statuses, status] };
    });
  };

  const summary = useMemo(() => {
    const st = cfg.statuses?.join(", ") || "—";
    const sortLabel =
      cfg.sortBy === "none"
        ? i18n.t("asaasBoletoNode.summary.noSort")
        : `${cfg.sortBy === "value" ? i18n.t("asaasBoletoNode.fields.sortValue") : i18n.t("asaasBoletoNode.fields.sortDueDate")} ${cfg.sortOrder === "desc" ? "↓" : "↑"}`;
    return i18n.t("asaasBoletoNode.summary.template", {
      statuses: st,
      attempts: cfg.maxAttempts,
      mode: cfg.sendMode === "separate" ? i18n.t("asaasBoletoNode.summary.modeSeparate") : i18n.t("asaasBoletoNode.summary.modeSingle"),
      sort: sortLabel
    });
  }, [cfg]);

  return (
    <Box sx={{
      backgroundColor: "#fff",
      borderRadius: 2,
      boxShadow: 2,
      p: 2,
      width: 300,
      display: "flex",
      flexDirection: "column",
      gap: 1,
      position: "relative"
    }}>
      <Handle type="target" position="left" id="asaas-in"
        style={{ left: -8, top: "50%", transform: "translateY(-50%)", background: "#555", width: 12, height: 12 }} />

      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ReceiptLongIcon fontSize="small" sx={{ color: "#0a8a3b" }} />
          <Typography variant="subtitle2" fontWeight="bold">{i18n.t("asaasBoletoNode.title")}</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <IconButton size="small" onClick={() => { storageItems.setNodesStorage(id); storageItems.setAct("duplicate"); }}>
            <ContentCopyIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={() => { storageItems.setNodesStorage(id); storageItems.setAct("disconnect"); }}>
            <LinkOffIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={() => { storageItems.setNodesStorage(id); storageItems.setAct("delete"); }}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      <Typography variant="caption" sx={{ color: "#666", lineHeight: 1.3 }}>
        {i18n.t("asaasBoletoNode.description", "Pergunta o CPF/CNPJ, valida, consulta Asaas e envia os boletos automaticamente.")}
      </Typography>

      <Box sx={{ backgroundColor: "#f5f7fa", p: 1, borderRadius: 1 }}>
        <Typography variant="caption" sx={{ color: "#444", fontSize: 11 }}>
          {summary}
        </Typography>
      </Box>

      <Button
        size="small"
        variant="outlined"
        startIcon={<SettingsIcon fontSize="small" />}
        onClick={() => setOpen(true)}
      >
        {i18n.t("asaasBoletoNode.configure", "Configurar nó")}
      </Button>

      <Handle type="source" position="right" id="a"
        style={{ right: -8, top: "50%", transform: "translateY(-50%)", background: "#555", width: 12, height: 12 }} />

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ReceiptLongIcon sx={{ color: "#0a8a3b" }} />
          {i18n.t("asaasBoletoNode.dialogTitle")}
        </DialogTitle>
        <DialogContent dividers>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
            <Tab label={i18n.t("asaasBoletoNode.tabs.messages")} />
            <Tab label={i18n.t("asaasBoletoNode.tabs.boletos")} />
            <Tab label={i18n.t("asaasBoletoNode.tabs.advanced")} />
          </Tabs>

          {tab === 0 && (
            <Box display="flex" flexDirection="column" gap={2}>
              <TextField
                label={i18n.t("asaasBoletoNode.fields.askMessage")}
                value={cfg.askMessage} onChange={set("askMessage")}
                multiline minRows={2} fullWidth size="small"
                helperText={i18n.t("asaasBoletoNode.fields.askMessageHelper")}
              />
              <TextField
                label={i18n.t("asaasBoletoNode.fields.invalidMessage")}
                value={cfg.invalidMessage} onChange={set("invalidMessage")}
                multiline minRows={2} fullWidth size="small"
              />
              <TextField
                label={i18n.t("asaasBoletoNode.fields.notFoundMessage")}
                value={cfg.notFoundMessage} onChange={set("notFoundMessage")}
                multiline minRows={2} fullWidth size="small"
              />
              <TextField
                label={i18n.t("asaasBoletoNode.fields.errorMessage")}
                value={cfg.errorMessage} onChange={set("errorMessage")}
                multiline minRows={2} fullWidth size="small"
              />
              <TextField
                label={i18n.t("asaasBoletoNode.fields.giveUpMessage")}
                value={cfg.giveUpMessage} onChange={set("giveUpMessage")}
                multiline minRows={2} fullWidth size="small"
              />
              <TextField
                label={i18n.t("asaasBoletoNode.fields.finalMessage")}
                value={cfg.finalMessage} onChange={set("finalMessage")}
                multiline minRows={2} fullWidth size="small"
                helperText={i18n.t("asaasBoletoNode.fields.finalMessageHelper")}
              />
            </Box>
          )}

          {tab === 1 && (
            <Box display="flex" flexDirection="column" gap={2}>
              <Box>
                <Typography variant="body2" sx={{ mb: 1, fontWeight: 500 }}>
                  {i18n.t("asaasBoletoNode.fields.statusesLabel")}
                </Typography>
                <Box display="flex" flexWrap="wrap" gap={1}>
                  {[
                    { v: "PENDING", l: i18n.t("asaasBoletoNode.statuses.pending") },
                    { v: "OVERDUE", l: i18n.t("asaasBoletoNode.statuses.overdue") },
                    { v: "RECEIVED", l: i18n.t("asaasBoletoNode.statuses.received") },
                    { v: "CONFIRMED", l: i18n.t("asaasBoletoNode.statuses.confirmed") }
                  ].map((s) => (
                    <FormControlLabel
                      key={s.v}
                      control={
                        <Checkbox
                          size="small"
                          checked={cfg.statuses.includes(s.v)}
                          onChange={() => toggleStatus(s.v)}
                        />
                      }
                      label={s.l}
                    />
                  ))}
                </Box>
              </Box>

              <TextField
                label={i18n.t("asaasBoletoNode.fields.headerMessage")}
                value={cfg.headerMessage} onChange={set("headerMessage")}
                fullWidth size="small"
              />

              <TextField
                label={i18n.t("asaasBoletoNode.fields.boletoTemplate")}
                value={cfg.boletoTemplate} onChange={set("boletoTemplate")}
                multiline minRows={6} fullWidth size="small"
                helperText={i18n.t("asaasBoletoNode.fields.boletoTemplateHelper")}
              />

              <TextField
                select label={i18n.t("asaasBoletoNode.fields.sendMode")}
                value={cfg.sendMode} onChange={set("sendMode")}
                fullWidth size="small"
              >
                <MenuItem value="single">{i18n.t("asaasBoletoNode.fields.sendModeSingle")}</MenuItem>
                <MenuItem value="separate">{i18n.t("asaasBoletoNode.fields.sendModeSeparate")}</MenuItem>
              </TextField>

              <Box display="flex" gap={2}>
                <TextField
                  select label={i18n.t("asaasBoletoNode.fields.sortBy")}
                  value={cfg.sortBy} onChange={set("sortBy")}
                  fullWidth size="small"
                >
                  <MenuItem value="dueDate">{i18n.t("asaasBoletoNode.fields.sortDueDate")}</MenuItem>
                  <MenuItem value="value">{i18n.t("asaasBoletoNode.fields.sortValue")}</MenuItem>
                  <MenuItem value="none">{i18n.t("asaasBoletoNode.fields.sortNone")}</MenuItem>
                </TextField>
                <TextField
                  select label={i18n.t("asaasBoletoNode.fields.sortOrder")}
                  value={cfg.sortOrder} onChange={set("sortOrder")}
                  fullWidth size="small"
                  disabled={cfg.sortBy === "none"}
                  helperText={cfg.sortBy === "dueDate" ? i18n.t("asaasBoletoNode.fields.sortOrderHelper") : " "}
                >
                  <MenuItem value="asc">{i18n.t("asaasBoletoNode.fields.sortAsc")}</MenuItem>
                  <MenuItem value="desc">{i18n.t("asaasBoletoNode.fields.sortDesc")}</MenuItem>
                </TextField>
              </Box>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={cfg.sendPixQrCode}
                    onChange={set("sendPixQrCode")}
                    size="small"
                  />
                }
                label={i18n.t("asaasBoletoNode.fields.sendPixQrCode")}
              />

              <Divider sx={{ my: 1 }}>{i18n.t("asaasBoletoNode.fields.pixDivider")}</Divider>

              <TextField
                select label={i18n.t("asaasBoletoNode.fields.pixDelivery")}
                value={cfg.pixDelivery} onChange={set("pixDelivery")}
                fullWidth size="small"
                helperText={i18n.t("asaasBoletoNode.fields.pixDeliveryHelper")}
              >
                <MenuItem value="none">{i18n.t("asaasBoletoNode.fields.pixNone")}</MenuItem>
                <MenuItem value="copypaste">{i18n.t("asaasBoletoNode.fields.pixCopyPaste")}</MenuItem>
                <MenuItem value="qrimage">{i18n.t("asaasBoletoNode.fields.pixQrImage")}</MenuItem>
                <MenuItem value="both">{i18n.t("asaasBoletoNode.fields.pixBoth")}</MenuItem>
              </TextField>

              {(cfg.pixDelivery === "copypaste" || cfg.pixDelivery === "both") && (
                <TextField
                  label={i18n.t("asaasBoletoNode.fields.pixMessageTemplate")}
                  value={cfg.pixMessageTemplate} onChange={set("pixMessageTemplate")}
                  multiline minRows={2} fullWidth size="small"
                  helperText={i18n.t("asaasBoletoNode.fields.pixMessageTemplateHelper")}
                />
              )}

              {(cfg.pixDelivery === "qrimage" || cfg.pixDelivery === "both") && (
                <TextField
                  label={i18n.t("asaasBoletoNode.fields.pixQrCaption")}
                  value={cfg.pixQrCaption} onChange={set("pixQrCaption")}
                  fullWidth size="small"
                />
              )}
            </Box>
          )}

          {tab === 2 && (
            <Box display="flex" flexDirection="column" gap={2}>
              <TextField
                label={i18n.t("asaasBoletoNode.fields.asaasToken")}
                value={cfg.asaasToken} onChange={set("asaasToken")}
                fullWidth size="small"
                type="password"
                autoComplete="off"
                placeholder={i18n.t("asaasBoletoNode.fields.asaasTokenPlaceholder")}
                helperText={i18n.t("asaasBoletoNode.fields.asaasTokenHelper")}
              />
              <TextField
                select
                label="Ambiente Asaas"
                value={cfg.asaasEnvironment || "production"}
                onChange={set("asaasEnvironment")}
                fullWidth size="small"
                helperText="Produção: api.asaas.com  •  Sandbox: api-sandbox.asaas.com. O token deve ser gerado no painel correspondente."
              >
                <MenuItem value="production">Produção (api.asaas.com)</MenuItem>
                <MenuItem value="sandbox">Sandbox (api-sandbox.asaas.com)</MenuItem>
              </TextField>
              <Divider />
              <TextField
                label={i18n.t("asaasBoletoNode.fields.maxAttempts")}
                type="number" inputProps={{ min: 1, max: 10 }}
                value={cfg.maxAttempts} onChange={set("maxAttempts")}
                fullWidth size="small"
                helperText={i18n.t("asaasBoletoNode.fields.maxAttemptsHelper")}
              />
              <Divider>{i18n.t("asaasBoletoNode.fields.timeoutDivider")}</Divider>
              <TextField
                label={i18n.t("asaasBoletoNode.fields.inputTimeoutSeconds")}
                type="number" inputProps={{ min: 0, max: 3600 }}
                value={cfg.inputTimeoutSeconds} onChange={set("inputTimeoutSeconds")}
                fullWidth size="small"
                helperText={i18n.t("asaasBoletoNode.fields.inputTimeoutSecondsHelper")}
              />
              <TextField
                label={i18n.t("asaasBoletoNode.fields.timeoutMessage")}
                value={cfg.timeoutMessage} onChange={set("timeoutMessage")}
                multiline minRows={2} fullWidth size="small"
              />
              <TextField
                label={i18n.t("asaasBoletoNode.fields.countVariable")}
                value={cfg.countVariable} onChange={set("countVariable")}
                fullWidth size="small"
                placeholder={i18n.t("asaasBoletoNode.fields.countVariablePlaceholder")}
                helperText={i18n.t("asaasBoletoNode.fields.countVariableHelper")}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{i18n.t("asaasBoletoNode.buttons.close")}</Button>
          <Button variant="contained" onClick={() => setOpen(false)}>{i18n.t("asaasBoletoNode.buttons.save")}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
});

export default AsaasBoletoNode;