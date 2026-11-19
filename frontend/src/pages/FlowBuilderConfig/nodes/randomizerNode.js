import ArrowForwardIos from "@mui/icons-material/ArrowForwardIos";
import CallSplit from "@mui/icons-material/CallSplit";
import ContentCopy from "@mui/icons-material/ContentCopy";
import Delete from "@mui/icons-material/Delete";
import Edit from "@mui/icons-material/Edit";
import LinkOff from "@mui/icons-material/LinkOff";
import React, { memo } from "react";
import { i18n } from "../../../translate/i18n";

import { Handle } from "react-flow-renderer";
import { useNodeStorage } from "../../../stores/useNodeStorage";

export default memo(({ data, isConnectable, id }) => {
  const storageItems = useNodeStorage();

  return (
    <div
      style={{
        backgroundColor: "#F8FCFD",
        padding: "8px",
        borderRadius: "8px",
        width: "185px",
        border: "1px solid rgba(31, 186, 220, 0.25)"
      }}
    >
      <Handle
        type="target"
        position="left"
        style={{
          background: "#9a00ed",
          width: "18px",
          height: "18px",
          top: "20px",
          left: "-12px",
          cursor: 'pointer'
        }}
        onConnect={params => console.log("handle onConnect", params)}
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
        {/* Ícone de editar — antes esse nó só tinha duplicar/desconectar/
            excluir, sem nenhuma forma visível de abrir a configuração (só
            funcionava com duplo clique no corpo do nó, algo pouco óbvio).
            Dispara a mesma ação "edit" tratada no useEffect de
            storageItems.action em FlowBuilderConfig/index.js, que reusa o
            dispatcher por tipo de nó já usado no duplo clique. */}
        <Edit
          onClick={() => {
            storageItems.setNodesStorage(id);
            storageItems.setAct("edit");
          }}
          sx={{ width: "12px", height: "12px", color: "#1FBADC" }}
        />

        <ContentCopy
          onClick={() => {
            storageItems.setNodesStorage(id);
            storageItems.setAct("duplicate");
          }}
          sx={{ width: "12px", height: "12px", color: "#1FBADC" }}
        />

        <LinkOff
          onClick={() => {
            storageItems.setNodesStorage(id);
            storageItems.setAct("disconnect");
          }}
          sx={{ width: "12px", height: "12px", color: "#1FBADC" }}
        />

        <Delete
          onClick={() => {
            storageItems.setNodesStorage(id);
            storageItems.setAct("delete");
          }}
          sx={{ width: "12px", height: "12px", color: "#1FBADC" }}
        />
      </div>
      <div
        style={{
          color: "#ededed",
          fontSize: "16px",
          flexDirection: "row",
          display: "flex"
        }}
      >
        <CallSplit
          sx={{
            width: "16px",
            height: "16px",
            marginRight: "4px",
            marginTop: "4px",
            color: "#1FBADC"
          }}
        />
        <div style={{ color: "#232323", fontSize: "16px" }}>{i18n.t("flowBuilderRandomizerNode.title")}</div>
      </div>
      <div
        style={{
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontSize: "16px",
          justifyContent: "end",
          position: "relative",
          display: "flex",
          color: "#232323"
        }}
      >
        {`${data.percent}%`}
      </div>
      <Handle
        type="source"
        position="right"
        id="a"
        style={{
          background: "#9a00ed",
          width: "18px",
          height: "18px",
          right: "-11px",
          marginTop: "-5px",
          cursor: 'pointer'
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
      <div
        style={{
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontSize: "16px",
          justifyContent: "end",
          position: "relative",
          display: "flex",
          marginTop: "8px",
          color: "#232323"
        }}
      >
        {`${100 - data.percent}%`}
      </div>
      <Handle
        type="source"
        position="right"
        id="b"
        style={{
          background: "#9a00ed",
          width: "18px",
          height: "18px",
          right: "-11px",
          top: 73,
          cursor: 'pointer'
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
