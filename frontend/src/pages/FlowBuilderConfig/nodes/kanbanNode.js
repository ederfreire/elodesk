import ArrowForwardIos from "@mui/icons-material/ArrowForwardIos";
import ContentCopy from "@mui/icons-material/ContentCopy";
import Delete from "@mui/icons-material/Delete";
import Edit from "@mui/icons-material/Edit";
import LinkOff from "@mui/icons-material/LinkOff";
import ViewKanban from "@mui/icons-material/ViewKanbanOutlined";
import React, { memo } from "react";
import { i18n } from "../../../translate/i18n";

import { Handle } from "react-flow-renderer";
import { useNodeStorage } from "../../../stores/useNodeStorage";

export default memo(({ data, isConnectable, id }) => {
  const storageItems = useNodeStorage();

  const laneName = data?.tagName;

  return (
    <div
      style={{
        backgroundColor: "#ffffff",
        padding: "8px",
        borderRadius: "8px",
        width: "200px",
        boxShadow: "rgba(0, 0, 0, 0.05) 0px 3px 5px",
        border: "1px solid rgba(14, 165, 233, 0.25)"
      }}
    >
      <Handle
        type="target"
        position="left"
        style={{
          background: "#0EA5E9",
          width: "18px",
          height: "18px",
          top: "20px",
          left: "-12px",
          cursor: "pointer"
        }}
        isConnectable={isConnectable}
      >
        <ArrowForwardIos
          sx={{
            color: "#ffff",
            width: "10px",
            height: "10px",
            marginLeft: "3.5px",
            marginBottom: "1px",
            pointerEvents: "none"
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
          gap: 6
        }}
      >
        <Edit
          onClick={() => {
            storageItems.setNodesStorage(id);
            storageItems.setAct("edit");
          }}
          sx={{ width: "12px", height: "12px", color: "#0EA5E9" }}
        />
        <ContentCopy
          onClick={() => {
            storageItems.setNodesStorage(id);
            storageItems.setAct("duplicate");
          }}
          sx={{ width: "12px", height: "12px", color: "#0EA5E9" }}
        />
        <LinkOff
          onClick={() => {
            storageItems.setNodesStorage(id);
            storageItems.setAct("disconnect");
          }}
          sx={{ width: "12px", height: "12px", color: "#0EA5E9" }}
        />
        <Delete
          onClick={() => {
            storageItems.setNodesStorage(id);
            storageItems.setAct("delete");
          }}
          sx={{ width: "12px", height: "12px", color: "#0EA5E9" }}
        />
      </div>
      <div
        style={{
          color: "#ededed",
          fontSize: "16px",
          flexDirection: "row",
          display: "flex",
          marginBottom: "4px"
        }}
      >
        <ViewKanban
          sx={{
            width: "16px",
            height: "16px",
            marginRight: "4px",
            marginTop: "4px",
            color: "#0EA5E9"
          }}
        />
        <div style={{ color: "#232323", fontSize: "16px" }}>
          {i18n.t("flowBuilderKanbanNode.title")}
        </div>
      </div>
      <div style={{ color: "#666", fontSize: "12px" }}>
        {laneName
          ? i18n.t("flowBuilderKanbanNode.moveTo", { lane: laneName })
          : i18n.t("flowBuilderKanbanNode.noLane")}
      </div>
      <Handle
        type="source"
        position="right"
        style={{
          background: "#0EA5E9",
          width: "18px",
          height: "18px",
          right: "-11px",
          cursor: "pointer"
        }}
        isConnectable={isConnectable}
      >
        <ArrowForwardIos
          sx={{
            color: "#ffff",
            width: "10px",
            height: "10px",
            marginLeft: "2.9px",
            marginBottom: "1px",
            pointerEvents: "none"
          }}
        />
      </Handle>
    </div>
  );
});
