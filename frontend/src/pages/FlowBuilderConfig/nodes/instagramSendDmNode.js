import ArrowForwardIos from "@mui/icons-material/ArrowForwardIos";
import ContentCopy from "@mui/icons-material/ContentCopy";
import Delete from "@mui/icons-material/Delete";
import LinkOff from "@mui/icons-material/LinkOff";
import Send from "@mui/icons-material/Send";
import React, { memo } from "react";
import { Handle } from "react-flow-renderer";
import { i18n } from "../../../translate/i18n";
import { useNodeStorage } from "../../../stores/useNodeStorage";

const helpStyle = {
  marginTop: 8, padding: "6px 8px", background: "#FDF2F8", borderRadius: 6,
  fontSize: 10, color: "#831843", lineHeight: 1.35, borderLeft: "2px solid #E1306C"
};

export default memo(({ data, isConnectable, id }) => {
  const storageItems = useNodeStorage();
  const msg = data?.message || "";
  return (
    <div style={{ backgroundColor: "#fff", padding: 8, borderRadius: 8, boxShadow: "rgba(0,0,0,0.05) 0px 3px 5px", border: "1px solid #E1306C", minWidth: 230, maxWidth: 260 }}>
      <Handle type="target" position="left" style={{ background: "#E1306C", width: 18, height: 18, top: 28, left: -12 }} isConnectable={isConnectable}>
        <ArrowForwardIos sx={{ color: "#fff", width: 10, height: 10, marginLeft: "2.9px", pointerEvents: "none" }} />
      </Handle>
      <div style={{ position: "absolute", right: 5, top: 5, display: "flex", gap: 6, cursor: "pointer" }}>
        <ContentCopy onClick={() => { storageItems.setNodesStorage(id); storageItems.setAct("duplicate"); }} sx={{ width: 12, height: 12, color: "#E1306C" }} />
        <LinkOff onClick={() => { storageItems.setNodesStorage(id); storageItems.setAct("disconnect"); }} sx={{ width: 12, height: 12, color: "#E1306C" }} />
        <Delete onClick={() => { storageItems.setNodesStorage(id); storageItems.setAct("delete"); }} sx={{ width: 12, height: 12, color: "#E1306C" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center" }}>
        <Send sx={{ width: 18, height: 18, color: "#E1306C", marginRight: 6 }} />
        <div style={{ fontSize: 14, fontWeight: 600 }}>{i18n.t("flowBuilderConfigPage.igSendDm", "Enviar DM")}</div>
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {msg ? `"${msg}"` : i18n.t("flowBuilderConfigPage.igSendDmEmpty", "(sin mensaje)")}
      </div>
      <div style={helpStyle}>
        💌 <span dangerouslySetInnerHTML={{ __html: i18n.t("flowBuilderConfigPage.igSendDmHelp", "Envia uma <b>mensagem privada</b> (direct) para a pessoa que comentou. Use <code>${'{nome}'}</code> para chamar pelo nome dela.") }} />
      </div>
      <Handle type="source" position="right" id="a" style={{ background: "#E1306C", width: 18, height: 18, top: 28, right: -11 }} isConnectable={isConnectable}>
        <ArrowForwardIos sx={{ color: "#fff", width: 10, height: 10, marginLeft: "2.9px", pointerEvents: "none" }} />
      </Handle>
    </div>
  );
});
