import React, { memo } from "react";
import { Handle } from "react-flow-renderer";
import EventAvailableIcon from "@material-ui/icons/EventAvailable";
import ArrowForwardIos from "@mui/icons-material/ArrowForwardIos";
import ContentCopy from "@mui/icons-material/ContentCopy";
import Delete from "@mui/icons-material/Delete";
import LinkOff from "@mui/icons-material/LinkOff";
import { useNodeStorage } from "../../../stores/useNodeStorage";

const COLOR = "#0f9d58";

export default memo(({ isConnectable, id }) => {
  const storageItems = useNodeStorage();

  return (
    <div
      style={{
        backgroundColor: "#fff",
        padding: 8,
        borderRadius: 8,
        border: `1px solid ${COLOR}55`,
        minWidth: 240,
      }}
    >
      <Handle
        type="target"
        position="left"
        style={{ background: COLOR, width: 18, height: 18, left: -12 }}
        isConnectable={isConnectable}
      />
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
      <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#232323" }}>
        <EventAvailableIcon style={{ width: 18, height: 18, color: COLOR }} />
        <strong>Agendamento de serviços</strong>
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: "#5a5a5a", maxWidth: 220 }}>
        O cliente escolhe serviço, profissional e horário pelo WhatsApp.
      </div>
      <Handle
        type="source"
        position="right"
        id="a"
        style={{ background: COLOR, width: 18, height: 18, right: -11 }}
        isConnectable={isConnectable}
      >
        <ArrowForwardIos
          sx={{ color: "#fff", width: 10, height: 10, marginLeft: "2.9px", pointerEvents: "none" }}
        />
      </Handle>
    </div>
  );
});
