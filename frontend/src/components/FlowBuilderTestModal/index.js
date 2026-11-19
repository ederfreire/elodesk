import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Chip,
  IconButton,
  TextField,
  Divider,
  Paper,
} from "@material-ui/core";
import PlayIcon from "@material-ui/icons/PlayArrow";
import ReplayIcon from "@material-ui/icons/Replay";
import CloseIcon from "@material-ui/icons/Close";
import SendIcon from "@material-ui/icons/Send";
import CheckIcon from "@material-ui/icons/CheckCircle";
import WarningIcon from "@material-ui/icons/Warning";
import { i18n } from "../../translate/i18n";

const FlowBuilderTestModal = ({ open, onClose, nodes = [], edges = [] }) => {
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [inputText, setInputText] = useState("");
  const [isFollower, setIsFollower] = useState(true);
  const logsEndRef = useRef(null);

  const t = (key, vars) => i18n.t(`flowBuilderTestModal.${key}`, vars);
  const ts = (key, vars) => i18n.t(`flowBuilderTestModal.step.${key}`, vars);

  const isInstagramFlow = useMemo(
    () => nodes.some((n) => String(n.type || "").startsWith("instagram")),
    [nodes]
  );

  const startNode = useMemo(() => {
    return (
      nodes.find((n) => n.type === "start") ||
      nodes.find((n) => n.type === "instagramTrigger") ||
      nodes[0]
    );
  }, [nodes]);

  useEffect(() => {
    if (open) {
      setInputText(isInstagramFlow ? t("defaultComment") : t("defaultMessage"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isInstagramFlow]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const pushLog = (entry) => setLogs((prev) => [...prev, { ...entry, at: new Date() }]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const previewText = (val, max = 120) => {
    if (val === undefined || val === null) return "";
    const s = typeof val === "string" ? val : JSON.stringify(val);
    return s.length > max ? `${s.slice(0, max)}…` : s;
  };

  const describeNode = (node) => {
    const d = node.data || {};
    switch (node.type) {
      case "start":
        return { icon: "🚀", title: ts("startTitle"), detail: ts("startDetail") };
      case "instagramTrigger":
        return {
          icon: "📷",
          title: ts("igTriggerTitle"),
          detail: `${ts("igTriggerDetail")}${d.mediaId ? ` (${d.mediaId})` : ""}. ${ts("keyword")}: "${d.keyword || ts("anyKeyword")}"`,
        };
      case "instagramReplyComment":
        return { icon: "💬", title: ts("igReplyTitle"), detail: `${ts("igReplyDetail")}: "${previewText(d.message) || ts("noText")}"` };
      case "instagramLikeComment":
        return { icon: "❤️", title: ts("igLikeTitle"), detail: ts("igLikeDetail") };
      case "instagramIsFollower":
        return {
          icon: "👥",
          title: ts("igFollowerTitle"),
          detail: isFollower ? ts("igFollowerYes") : ts("igFollowerNo"),
        };
      case "instagramSendDm":
        return { icon: "📩", title: ts("igDmTitle"), detail: `${ts("igDmDetail")}: "${previewText(d.message) || ts("noText")}"` };
      case "instagramRewardPdf":
        return { icon: "🎁", title: ts("igRewardTitle"), detail: `${ts("igRewardDetail")}${d.fileName ? `: ${d.fileName}` : ""}.` };
      case "message":
      case "text":
      case "content":
        return { icon: "✉️", title: ts("messageTitle"), detail: previewText(d.label || d.message || d.text) || ts("emptyMsg") };
      case "img":
        return { icon: "🖼️", title: ts("imageTitle"), detail: previewText(d.url || d.name) || ts("imageEmpty") };
      case "audio":
        return { icon: "🎵", title: ts("audioTitle"), detail: previewText(d.url || d.name) || ts("audioEmpty") };
      case "video":
        return { icon: "🎬", title: ts("videoTitle"), detail: previewText(d.url || d.name) || ts("videoEmpty") };
      case "singleBlock":
        return { icon: "📦", title: ts("singleBlockTitle"), detail: previewText(d.label) || ts("singleBlockDetail") };
      case "menu":
        return { icon: "📋", title: ts("menuTitle"), detail: ts("menuDetail", { n: Array.isArray(d.arrayOption) ? d.arrayOption.length : 0 }) };
      case "interactiveMenu":
        return {
          icon: "🔘",
          title: ts("interactiveTitle"),
          detail: `${ts("interactiveDetail")}${d.title ? `: ${d.title}` : ""}${Array.isArray(d.buttons) ? ` (${d.buttons.length} ${ts("buttons")})` : ""}.`,
        };
      case "input":
        return { icon: "⌨️", title: ts("inputTitle"), detail: `${ts("inputDetail")}${d.variable ? ` → ${ts("variable")} "${d.variable}"` : ""}.` };
      case "interval":
        return { icon: "⏱️", title: ts("intervalTitle"), detail: ts("intervalDetail", { sec: d.sec || 0 }) };
      case "random":
      case "randomizer":
        return { icon: "🎲", title: ts("randomTitle"), detail: ts("randomDetail") };
      case "conditionCompare":
        return { icon: "🔀", title: ts("conditionTitle"), detail: `${ts("conditionDetail")} "${d.variable || "?"}" ${d.operator || "=="} "${d.value || "?"}".` };
      case "ticket":
        return { icon: "🎫", title: ts("ticketTitle"), detail: ts("ticketDetail") };
      case "tag":
        return { icon: "🏷️", title: ts("tagTitle"), detail: `${ts("tagDetail")}${d.tagName ? `: ${d.tagName}` : ""}.` };
      case "removeTag":
        return { icon: "❌", title: ts("removeTagTitle"), detail: `${ts("removeTagDetail")}${d.tagName ? `: ${d.tagName}` : ""}.` };
      case "switchFlow":
        return { icon: "🔁", title: ts("switchFlowTitle"), detail: `${ts("switchFlowDetail")}${d.flowName ? `: ${d.flowName}` : ""}.` };
      case "attendant":
        return { icon: "🧑‍💼", title: ts("attendantTitle"), detail: ts("attendantDetail") };
      case "httpRequest":
        return { icon: "🌐", title: ts("httpTitle"), detail: `${(d.method || "GET").toUpperCase()} ${previewText(d.url) || ts("noUrl")}` };
      case "variable":
        return { icon: "🧩", title: ts("variableTitle"), detail: `${ts("variableDetail")} ${d.name || ts("variable")} = ${previewText(d.value) || "?"}.` };
      case "aiAgent":
        return { icon: "🤖", title: ts("aiTitle"), detail: ts("aiDetail") };
      case "integration":
      case "typebotIntegration":
        return { icon: "🔗", title: ts("typebotTitle"), detail: ts("typebotDetail") };
      case "n8nIntegration":
        return { icon: "🔗", title: ts("n8nTitle"), detail: ts("n8nDetail") };
      case "asaasBoleto":
        return { icon: "💳", title: ts("asaasTitle"), detail: ts("asaasDetail") };
      default:
        return { icon: "🔹", title: node.type || ts("genericTitle"), detail: ts("genericDetail") };
    }
  };

  const getNextNodeId = (currentNode) => {
    if (currentNode.type === "instagramIsFollower") {
      const handleId = isFollower ? "true" : "false";
      const edge = edges.find((e) => e.source === currentNode.id && e.sourceHandle === handleId);
      if (edge) return edge.target;
    }
    const edge = edges.find((e) => e.source === currentNode.id);
    return edge ? edge.target : null;
  };

  const runSimulation = async () => {
    setLogs([]);
    setRunning(true);

    if (!startNode) {
      pushLog({ type: "error", text: t("noNodes") });
      setRunning(false);
      return;
    }

    pushLog({
      type: "info",
      text: isInstagramFlow ? t("commentSimulated", { text: inputText }) : t("messageSimulated", { text: inputText }),
    });
    await sleep(300);

    let current = startNode;
    const visited = new Set();
    let safety = 0;

    while (current && safety < 100) {
      if (visited.has(current.id)) {
        pushLog({ type: "warn", text: t("loopDetected") });
        break;
      }
      visited.add(current.id);
      safety += 1;

      const desc = describeNode(current);
      pushLog({ type: "step", ...desc });
      await sleep(400);

      const nextId = getNextNodeId(current);
      if (!nextId) {
        pushLog({ type: "success", text: t("end", { n: visited.size }) });
        break;
      }
      const next = nodes.find((n) => n.id === nextId);
      if (!next) {
        pushLog({ type: "error", text: t("nextNotFound", { id: nextId }) });
        break;
      }
      current = next;
    }

    if (safety >= 100) {
      pushLog({ type: "warn", text: t("maxSteps") });
    }

    setRunning(false);
  };

  const renderLog = (log, i) => {
    if (log.type === "step") {
      return (
        <Paper key={i} variant="outlined" style={{ padding: 10, marginBottom: 8, borderLeft: "3px solid #8B5CF6" }}>
          <Box display="flex" alignItems="center" style={{ gap: 8 }}>
            <span style={{ fontSize: 18 }}>{log.icon}</span>
            <Typography variant="subtitle2" style={{ fontWeight: 600 }}>{log.title}</Typography>
          </Box>
          <Typography variant="body2" style={{ color: "#555", marginTop: 4, whiteSpace: "pre-wrap" }}>{log.detail}</Typography>
        </Paper>
      );
    }
    const colorMap = { info: "#1976d2", success: "#2e7d32", warn: "#ed6c02", error: "#d32f2f" };
    const Icon = log.type === "success" ? CheckIcon : log.type === "warn" || log.type === "error" ? WarningIcon : SendIcon;
    return (
      <Box key={i} display="flex" alignItems="center" style={{ gap: 6, padding: "6px 10px", marginBottom: 6, background: "#F5F5F5", borderRadius: 4, color: colorMap[log.type] || "#333" }}>
        <Icon fontSize="small" />
        <Typography variant="body2">{log.text}</Typography>
      </Box>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <span>🧪 {t("title")}</span>
          <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Typography variant="body2" style={{ color: "#666", marginBottom: 12 }}>
          {t("hintIntro")}
          {isInstagramFlow ? ` ${t("igDetected")}` : ` ${t("genericDetected")}`}
        </Typography>

        <Box display="flex" style={{ gap: 12, marginBottom: 12 }}>
          <TextField
            label={isInstagramFlow ? t("commentLabel") : t("messageLabel")}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            size="small"
            fullWidth
            variant="outlined"
          />
        </Box>

        {isInstagramFlow && (
          <Box display="flex" alignItems="center" style={{ gap: 8, marginBottom: 16 }}>
            <Typography variant="body2">{t("simulatedUser")}</Typography>
            <Chip
              label={isFollower ? `✓ ${t("follows")}` : `✗ ${t("notFollows")}`}
              onClick={() => setIsFollower((v) => !v)}
              style={{ background: isFollower ? "#E8F5E9" : "#FFEBEE", color: isFollower ? "#2E7D32" : "#C62828", cursor: "pointer" }}
              size="small"
            />
            <Typography variant="caption" style={{ color: "#999" }}>({t("clickToToggle")})</Typography>
          </Box>
        )}

        <Divider style={{ marginBottom: 12 }} />

        <Box style={{ maxHeight: 320, overflowY: "auto" }}>
          {logs.length === 0 ? (
            <Typography variant="body2" style={{ color: "#999", textAlign: "center", padding: 24 }}>
              {t("clickStart")}
            </Typography>
          ) : (
            logs.map(renderLog)
          )}
          <div ref={logsEndRef} />
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{t("close")}</Button>
        <Button variant="outlined" onClick={() => setLogs([])} startIcon={<ReplayIcon />} disabled={running || logs.length === 0}>
          {t("clear")}
        </Button>
        <Button variant="contained" color="primary" startIcon={<PlayIcon />} onClick={runSimulation} disabled={running} style={{ background: "#8B5CF6", color: "#fff" }}>
          {running ? t("simulating") : t("start")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FlowBuilderTestModal;
