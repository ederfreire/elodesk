import ArrowForwardIos from "@mui/icons-material/ArrowForwardIos";
import ContentCopy from "@mui/icons-material/ContentCopy";
import Delete from "@mui/icons-material/Delete";
import LinkOff from "@mui/icons-material/LinkOff";
import Instagram from "@mui/icons-material/Instagram";
import React, { memo } from "react";
import { Handle } from "react-flow-renderer";
import { useNodeStorage } from "../../../stores/useNodeStorage";
import { i18n } from "../../../translate/i18n";

const helpStyle = {
  marginTop: 8,
  padding: "6px 8px",
  background: "#FDF2F8",
  borderRadius: 6,
  fontSize: 10,
  color: "#831843",
  lineHeight: 1.35,
  borderLeft: "2px solid #E1306C"
};

export default memo(({ data, isConnectable, id }) => {
  const storageItems = useNodeStorage();
  return (
    <div style={{
      backgroundColor: "#ffffff",
      padding: 8,
      borderRadius: 8,
      boxShadow: "rgba(0,0,0,0.05) 0px 3px 5px",
      border: "1px solid #E1306C",
      minWidth: 230,
      maxWidth: 260
    }}>
      <div style={{ position: "absolute", right: 5, top: 5, display: "flex", gap: 6, cursor: "pointer" }}>
        <ContentCopy onClick={() => { storageItems.setNodesStorage(id); storageItems.setAct("duplicate"); }} sx={{ width: 12, height: 12, color: "#E1306C" }} />
        <LinkOff onClick={() => { storageItems.setNodesStorage(id); storageItems.setAct("disconnect"); }} sx={{ width: 12, height: 12, color: "#E1306C" }} />
        <Delete onClick={() => { storageItems.setNodesStorage(id); storageItems.setAct("delete"); }} sx={{ width: 12, height: 12, color: "#E1306C" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center" }}>
        <Instagram sx={{ width: 18, height: 18, color: "#E1306C", marginRight: "6px" }} />
        <div style={{ color: "#232323", fontSize: 14, fontWeight: 600 }}>{i18n.t("instagramTriggerNode.title", { defaultValue: "Gatilho: Comentário IG" })}</div>
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: "#555" }}>
        <b>{i18n.t("instagramTriggerNode.post", { defaultValue: "Post:" })}</b> {data?.mediaId ? (data.mediaId.length > 22 ? data.mediaId.slice(0, 22) + "…" : data.mediaId) : i18n.t("instagramTriggerNode.anyPost", { defaultValue: "qualquer post" })}<br />
        <b>{i18n.t("instagramTriggerNode.keywords", { defaultValue: "Palavras:" })}</b> {(data?.keywords || []).join(", ") || i18n.t("instagramTriggerNode.anyComment", { defaultValue: "qualquer comentário" })}
      </div>
      <div style={{ ...helpStyle }}>
        🚀 <span dangerouslySetInnerHTML={{ __html: i18n.t("instagramTriggerNode.help", { defaultValue: "<b>Início do fluxo.</b> Liga este bloco aos próximos para responder, curtir ou mandar DM automático quando alguém comentar." }) }} />
      </div>
      <Handle type="target" position="left" id="in" style={{ background: "#E1306C", width: 14, height: 14, top: 28, left: -8 }} isConnectable={isConnectable} />
      <Handle type="source" position="right" id="a" style={{ background: "#E1306C", width: 18, height: 18, top: 28, right: -11 }} isConnectable={isConnectable}>
        <ArrowForwardIos sx={{ color: "#fff", width: 10, height: 10, marginLeft: "2.9px", pointerEvents: "none" }} />
      </Handle>
    </div>
  );
});
