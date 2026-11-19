import React, { memo } from "react";
import { Handle } from "react-flow-renderer";
import ArrowForwardIos from "@mui/icons-material/ArrowForwardIos";
import ContentCopy from "@mui/icons-material/ContentCopy";
import Delete from "@mui/icons-material/Delete";
import LinkOff from "@mui/icons-material/LinkOff";
import EventIcon from "@mui/icons-material/Event";
import { useNodeStorage } from "../../../stores/useNodeStorage";
import { i18n } from "../../../translate/i18n";

const COLOR = "#4285F4";

export default memo(({ data, isConnectable, id }) => {
  const storageItems = useNodeStorage();
  const summary = data?.summary || "Agendamento";
  const dateVar = data?.dateVar || "data";
  const timeVar = data?.timeVar || "hora";

  return (
    <div
      style={{
        backgroundColor: "#ffffff",
        padding: 8,
        borderRadius: 8,
        boxShadow: "rgba(0,0,0,0.05) 0px 3px 5px",
        border: `1px solid ${COLOR}55`,
        minWidth: 240,
      }}
    >
      <Handle
        type="target"
        position="left"
        style={{
          background: COLOR,
          width: 18,
          height: 18,
          top: 20,
          left: -12,
          cursor: "pointer",
        }}
        isConnectable={isConnectable}
      >
        <ArrowForwardIos
          sx={{ color: "#fff", width: 10, height: 10, marginLeft: "2.9px", pointerEvents: "none" }}
        />
      </Handle>

      <div style={{ display: "flex", position: "absolute", right: 5, top: 5, gap: 6 }}>
        <ContentCopy
          onClick={() => { storageItems.setNodesStorage(id); storageItems.setAct("duplicate"); }}
          sx={{ width: 12, height: 12, color: COLOR, cursor: "pointer" }}
        />
        <LinkOff
          onClick={() => { storageItems.setNodesStorage(id); storageItems.setAct("disconnect"); }}
          sx={{ width: 12, height: 12, color: COLOR, cursor: "pointer" }}
        />
        <Delete
          onClick={() => { storageItems.setNodesStorage(id); storageItems.setAct("delete"); }}
          sx={{ width: 12, height: 12, color: COLOR, cursor: "pointer" }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center" }}>
        <EventIcon style={{ width: 18, height: 18, marginRight: 4, color: COLOR }} />
        <div style={{ fontSize: 16, fontWeight: "bold", color: "#232323" }}>{i18n.t("flowBuilderGoogleCalendarModal.nodeTitle", "Google Agenda")}</div>
      </div>

      <div style={{ marginTop: 4, fontSize: 12, width: 230 }}>
        <div style={{ backgroundColor: "#E8F0FE", borderRadius: 5, padding: 6 }}>
          <div style={{ fontWeight: 500, fontSize: 11, wordBreak: "break-word" }}>
            📅 {summary}
          </div>
          <div style={{ fontSize: 10, color: COLOR, marginTop: 3 }}>
            {i18n.t("flowBuilderGoogleCalendarModal.nodeDateLabel", "data")}: {`{{${dateVar}}}`} · {i18n.t("flowBuilderGoogleCalendarModal.nodeTimeLabel", "hora")}: {`{{${timeVar}}}`}
          </div>
        </div>
        <div style={{ fontSize: 10, color: "#5a5a5a", fontStyle: "italic", marginTop: 4 }}>
          {i18n.t("flowBuilderGoogleCalendarModal.nodeDescription", "Cria evento no Google Agenda da empresa.")}
        </div>
      </div>

      <Handle
        type="source"
        position="right"
        id="a"
        style={{
          background: COLOR,
          width: 18,
          height: 18,
          top: "70%",
          right: -11,
          cursor: "pointer",
        }}
        isConnectable={isConnectable}
      >
        <ArrowForwardIos
          sx={{ color: "#fff", width: 10, height: 10, marginLeft: "2.9px", pointerEvents: "none" }}
        />
      </Handle>
    </div>
  );
});
