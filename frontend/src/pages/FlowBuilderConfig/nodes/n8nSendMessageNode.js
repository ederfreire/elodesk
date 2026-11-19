import ArrowForwardIos from "@mui/icons-material/ArrowForwardIos";
import ContentCopy from "@mui/icons-material/ContentCopy";
import Delete from "@mui/icons-material/Delete";
import LinkOff from "@mui/icons-material/LinkOff";
import React, { memo } from "react";
import { useNodeStorage } from "../../../stores/useNodeStorage";
import { Handle } from "react-flow-renderer";
import SendIcon from "@mui/icons-material/Send";
import { i18n } from "../../../translate/i18n";

const N8N_COLOR = "#EA4B71";

export default memo(({ data, isConnectable, id }) => {
  const storageItems = useNodeStorage();

  return (
    <div
      style={{
        backgroundColor: "#ffffff",
        padding: "8px",
        borderRadius: "8px",
        boxShadow: "rgba(0, 0, 0, 0.05) 0px 3px 5px",
        border: `1px solid ${N8N_COLOR}55`,
        minWidth: 220,
      }}
    >
      <Handle
        type="target"
        position="left"
        style={{
          background: N8N_COLOR,
          width: "18px",
          height: "18px",
          top: "20px",
          left: "-12px",
          cursor: "pointer",
        }}
        isConnectable={isConnectable}
      >
        <ArrowForwardIos
          sx={{
            color: "#fff",
            width: "10px",
            height: "10px",
            marginLeft: "2.9px",
            marginBottom: "1px",
            pointerEvents: "none",
          }}
        />
      </Handle>

      <div
        style={{
          display: "flex",
          position: "absolute",
          right: 5,
          top: 5,
          cursor: "pointer",
          gap: 6,
        }}
      >
        <ContentCopy
          onClick={() => {
            storageItems.setNodesStorage(id);
            storageItems.setAct("duplicate");
          }}
          sx={{ width: "12px", height: "12px", color: N8N_COLOR }}
        />
        <LinkOff
          onClick={() => {
            storageItems.setNodesStorage(id);
            storageItems.setAct("disconnect");
          }}
          sx={{ width: "12px", height: "12px", color: N8N_COLOR }}
        />
        <Delete
          onClick={() => {
            storageItems.setNodesStorage(id);
            storageItems.setAct("delete");
          }}
          sx={{ width: "12px", height: "12px", color: N8N_COLOR }}
        />
      </div>

      <div
        style={{
          color: "#ededed",
          fontSize: "16px",
          flexDirection: "row",
          display: "flex",
        }}
      >
        <SendIcon
          style={{
            width: "18px",
            height: "18px",
            marginRight: "4px",
            marginTop: "2px",
            color: N8N_COLOR,
          }}
        />
        <div style={{ color: "#232323", fontSize: "16px", fontWeight: "bold" }}>
          {i18n.t("n8nNodes.sendMessage")}
        </div>
      </div>

      <div style={{ color: "#232323", fontSize: "12px", width: 220, marginTop: 4 }}>
        <div
          style={{
            backgroundColor: "#FDE8ED",
            borderRadius: "5px",
            padding: "6px",
          }}
        >
          <div style={{ textAlign: "center", fontWeight: 500, fontSize: "11px" }}>
            {data?.webhookUrl
              ? i18n.t("n8nNodes.receiveAndSend")
              : i18n.t("n8nNodes.configureWebhook")}
          </div>
          {data?.waitForResponse && (
            <div
              style={{
                textAlign: "center",
                fontSize: "10px",
                color: N8N_COLOR,
                marginTop: 2,
              }}
            >
              ⏳ {i18n.t("n8nNodes.waitsN8nResponse")}
            </div>
          )}
          {data?.responseField && (
            <div
              style={{
                textAlign: "center",
                fontSize: "10px",
                color: N8N_COLOR,
                marginTop: 2,
              }}
            >
              📝 {i18n.t("n8nNodes.field")}: {data.responseField}
            </div>
          )}
          {data?.saveResponseVar && (
            <div
              style={{
                textAlign: "center",
                fontSize: "10px",
                color: N8N_COLOR,
                marginTop: 2,
              }}
            >
              💾 {i18n.t("n8nNodes.variable")}: {`{{${data.saveResponseVar}}}`}
            </div>
          )}
        </div>
        <div
          style={{
            fontSize: "10px",
            color: "#5a5a5a",
            fontStyle: "italic",
            lineHeight: 1.3,
            padding: "4px 2px 0",
          }}
        >
          {i18n.t("n8nNodes.sendMessageDesc")}
        </div>
      </div>

      <Handle
        type="source"
        position="right"
        id="a"
        style={{
          background: N8N_COLOR,
          width: "18px",
          height: "18px",
          top: "50%",
          right: "-11px",
          cursor: "pointer",
        }}
        isConnectable={isConnectable}
      >
        <ArrowForwardIos
          sx={{
            color: "#fff",
            width: "10px",
            height: "10px",
            marginLeft: "2.9px",
            marginBottom: "1px",
            pointerEvents: "none",
          }}
        />
      </Handle>

      {/* Handle para erro */}
      <Handle
        type="source"
        position="right"
        id="error"
        style={{
          background: "#FF6B6B",
          width: "14px",
          height: "14px",
          top: "85%",
          right: "-9px",
          cursor: "pointer",
        }}
        isConnectable={isConnectable}
      >
        <ArrowForwardIos
          sx={{
            color: "#fff",
            width: "8px",
            height: "8px",
            marginLeft: "2px",
            marginBottom: "1px",
            pointerEvents: "none",
          }}
        />
      </Handle>
      <div
        style={{
          position: "absolute",
          right: 12,
          bottom: -2,
          fontSize: "9px",
          color: "#FF6B6B",
        }}
      >
        {i18n.t("n8nNodes.error")}
      </div>
    </div>
  );
});
