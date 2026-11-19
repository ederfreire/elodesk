import ArrowForwardIos from "@mui/icons-material/ArrowForwardIos";
import ContentCopy from "@mui/icons-material/ContentCopy";
import Delete from "@mui/icons-material/Delete";
import LinkOff from "@mui/icons-material/LinkOff";
import React, { memo } from "react";
import { useNodeStorage } from "../../../stores/useNodeStorage";
import { Handle } from "react-flow-renderer";
import SmartToy from "@mui/icons-material/SmartToy";
import { i18n } from "../../../translate/i18n";

export default memo(({ data, isConnectable, id }) => {
  const storageItems = useNodeStorage();

  return (
    <div
      style={{
        backgroundColor: "#ffffff",
        padding: "8px",
        borderRadius: "8px",
        boxShadow: "rgba(0, 0, 0, 0.05) 0px 3px 5px",
        border: "1px solid rgba(139, 92, 246, 0.35)",
        minWidth: 200,
      }}
    >
      <Handle
        type="target"
        position="left"
        style={{
          background: "#8B5CF6",
          width: "18px",
          height: "18px",
          top: "20px",
          left: "-12px",
          cursor: "pointer",
        }}
        onConnect={(params) => console.log("handle onConnect", params)}
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
          sx={{ width: "12px", height: "12px", color: "#8B5CF6" }}
        />
        <LinkOff
          onClick={() => {
            storageItems.setNodesStorage(id);
            storageItems.setAct("disconnect");
          }}
          sx={{ width: "12px", height: "12px", color: "#8B5CF6" }}
        />
        <Delete
          onClick={() => {
            storageItems.setNodesStorage(id);
            storageItems.setAct("delete");
          }}
          sx={{ width: "12px", height: "12px", color: "#8B5CF6" }}
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
        <SmartToy
          style={{
            width: "18px",
            height: "18px",
            marginRight: "4px",
            marginTop: "2px",
            color: "#8B5CF6",
          }}
        />
        <div style={{ color: "#232323", fontSize: "16px", fontWeight: "bold" }}>
          {i18n.t("flowBuilderAiAgent.title")}
        </div>
      </div>

      <div style={{ color: "#232323", fontSize: "12px", width: 200, marginTop: 4 }}>
        <div
          style={{
            backgroundColor: "#F3E8FF",
            borderRadius: "5px",
            padding: "6px",
          }}
        >
          <div style={{ textAlign: "center", fontWeight: 500 }}>
            {data?.agentName || i18n.t("flowBuilderAiAgent.selectAgent")}
          </div>
          {data?.modelOverride && (
            <div
              style={{
                textAlign: "center",
                fontSize: "10px",
                color: "#7C3AED",
                marginTop: 2,
              }}
            >
              {data.modelOverride}
            </div>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position="right"
        id="a"
        style={{
          background: "#8B5CF6",
          width: "18px",
          height: "18px",
          top: "70%",
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
    </div>
  );
});
