import ContentCopy from "@mui/icons-material/ContentCopy";
import Delete from "@mui/icons-material/Delete";
import LinkOff from "@mui/icons-material/LinkOff";
import HowToReg from "@mui/icons-material/HowToReg";
import ArrowForwardIos from "@mui/icons-material/ArrowForwardIos";
import React, { memo } from "react";
import { Handle } from "react-flow-renderer";
import { useNodeStorage } from "../../../stores/useNodeStorage";
import { i18n } from "../../../translate/i18n";

const helpStyle = {
  marginTop: 8, padding: "6px 8px", background: "#FDF2F8", borderRadius: 6,
  fontSize: 10, color: "#831843", lineHeight: 1.35, borderLeft: "2px solid #E1306C"
};

export default memo(({ isConnectable, id }) => {
  const storageItems = useNodeStorage();
  return (
    <div style={{ backgroundColor: "#fff", padding: 8, borderRadius: 8, boxShadow: "rgba(0,0,0,0.05) 0px 3px 5px", border: "1px solid #E1306C", minWidth: 240, maxWidth: 270 }}>
      <Handle type="target" position="left" style={{ background: "#E1306C", width: 18, height: 18, top: 28, left: -12 }} isConnectable={isConnectable}>
        <ArrowForwardIos sx={{ color: "#fff", width: 10, height: 10, marginLeft: "2.9px", pointerEvents: "none" }} />
      </Handle>
      <div style={{ position: "absolute", right: 5, top: 5, display: "flex", gap: 6, cursor: "pointer" }}>
        <ContentCopy onClick={() => { storageItems.setNodesStorage(id); storageItems.setAct("duplicate"); }} sx={{ width: 12, height: 12, color: "#E1306C" }} />
        <LinkOff onClick={() => { storageItems.setNodesStorage(id); storageItems.setAct("disconnect"); }} sx={{ width: 12, height: 12, color: "#E1306C" }} />
        <Delete onClick={() => { storageItems.setNodesStorage(id); storageItems.setAct("delete"); }} sx={{ width: 12, height: 12, color: "#E1306C" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center" }}>
        <HowToReg sx={{ width: 18, height: 18, color: "#E1306C", marginRight: 6 }} />
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {i18n.t("instagramIsFollowerNode.title", { defaultValue: "É seguidor?" })}
        </div>
      </div>
      <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 11, color: "#555", fontWeight: 600 }}>
        <span style={{ color: "#2ecc71" }}>✓ {i18n.t("instagramIsFollowerNode.follows", { defaultValue: "Segue" })}</span>
        <span style={{ color: "#e74c3c" }}>✗ {i18n.t("instagramIsFollowerNode.notFollows", { defaultValue: "Não segue" })}</span>
      </div>
      <div
        style={helpStyle}
        dangerouslySetInnerHTML={{
          __html: i18n.t("instagramIsFollowerNode.help", {
            defaultValue:
              '👤 Checa se quem comentou <b>segue sua conta</b>. Tem 2 saídas:<br />🟢 <b>Verde (segue)</b> → recebe a recompensa.<br />🔴 <b>Vermelho (não segue)</b> → recebe DM tipo "siga a conta primeiro".'
          })
        }}
      />
      <Handle type="source" position="right" id="segue" style={{ background: "#2ecc71", width: 16, height: 16, top: "70%", right: -10 }} isConnectable={isConnectable} />
      <Handle type="source" position="right" id="nao-segue" style={{ background: "#e74c3c", width: 16, height: 16, top: "92%", right: -10 }} isConnectable={isConnectable} />
    </div>
  );
});
