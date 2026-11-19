import React, { memo } from "react";
import { Handle } from "react-flow-renderer";
import CompareArrows from "@mui/icons-material/CompareArrows";
import { i18n } from "../../../translate/i18n";

const operatorLabel = (op) => {
  const map = {
    equals:        "==",
    notEquals:     "≠",
    contains:      `∈ ${i18n.t("flowBuilderConditionCompareNode.contains")}`,
    notContains:   `∉ ${i18n.t("flowBuilderConditionCompareNode.notContains")}`,
    containsAny:   `∈… ${i18n.t("flowBuilderConditionCompareNode.containsAny")}`,
    greaterThan:   ">",
    lessThan:      "<",
    greaterOrEqual:"≥",
    lessOrEqual:   "≤",
    startsWith:    `⊰ ${i18n.t("flowBuilderConditionCompareNode.startsWith")}`,
    endsWith:      `⊱ ${i18n.t("flowBuilderConditionCompareNode.endsWith")}`,
    isEmpty:       `∅ ${i18n.t("flowBuilderConditionCompareNode.isEmpty")}`,
    isNotEmpty:    `¬∅ ${i18n.t("flowBuilderConditionCompareNode.isNotEmpty")}`,
    regex:         `.* ${i18n.t("flowBuilderConditionCompareNode.regex")}`,
  };
  return map[op] || op;
};

const ConditionLine = ({ condition }) => {
  const unary = condition.operator === "isEmpty" || condition.operator === "isNotEmpty";
  return (
    <div style={{ fontSize: 10, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      <span style={{ color: "#93c5fd" }}>{condition.leftValue || i18n.t("flowBuilderConditionCompareNode.field")}</span>
      {" "}
      <span style={{ color: "#fbbf24" }}>{operatorLabel(condition.operator)}</span>
      {!unary && (
        <>
          {" "}
          <span style={{ color: "#6ee7b7" }}>{condition.rightValue || i18n.t("flowBuilderConditionCompareNode.value")}</span>
        </>
      )}
    </div>
  );
};

export default memo(({ data, isConnectable }) => {
  // Suporte a múltiplas condições (novo) e condição única (legado)
  const conditions = data.conditions && data.conditions.length > 0
    ? data.conditions
    : [{ id: "0", leftValue: data.leftValue, operator: data.operator || "equals", rightValue: data.rightValue }];

  const logicOperator = data.logicOperator || "AND";
  const isMultiple = conditions.length > 1;

  return (
    <div
      style={{
        backgroundColor: "#2d2d2d",
        border: "2px solid #7c3aed",
        padding: "10px 14px",
        borderRadius: "10px",
        minWidth: 200,
        maxWidth: 260,
        fontFamily: "monospace",
      }}
    >
      {/* Entrada */}
      <Handle
        type="target"
        position="left"
        style={{ background: "#7c3aed", width: 10, height: 10 }}
        isConnectable={isConnectable}
      />

      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <CompareArrows sx={{ color: "#a78bfa", width: 16, height: 16 }} />
        <span style={{ color: "#a78bfa", fontWeight: "bold", fontSize: 13 }}>{i18n.t("flowBuilderConditionCompareNode.title")}</span>
        {isMultiple && (
          <span
            style={{
              marginLeft: "auto",
              background: logicOperator === "AND" ? "#4c1d95" : "#1e3a5f",
              color: logicOperator === "AND" ? "#c4b5fd" : "#93c5fd",
              fontSize: 9,
              fontWeight: "bold",
              borderRadius: 4,
              padding: "1px 5px",
              letterSpacing: 1,
            }}
          >
            {logicOperator}
          </span>
        )}
      </div>

      {/* Condições */}
      <div
        style={{
          background: "#1a1a2e",
          borderRadius: 6,
          padding: "6px 8px",
          marginBottom: 10,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {conditions.map((cond, i) => (
          <React.Fragment key={cond.id || i}>
            {i > 0 && (
              <div
                style={{
                  textAlign: "center",
                  fontSize: 9,
                  color: logicOperator === "AND" ? "#c4b5fd" : "#93c5fd",
                  fontWeight: "bold",
                  letterSpacing: 1,
                  borderTop: "1px dashed #333",
                  paddingTop: 3,
                  marginTop: 1,
                }}
              >
                {logicOperator === "AND" ? i18n.t("flowBuilderConditionCompareNode.and") : i18n.t("flowBuilderConditionCompareNode.or")}
              </div>
            )}
            <ConditionLine condition={cond} />
          </React.Fragment>
        ))}
      </div>

      {/* Saída VERDADEIRO */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: 4 }}>
        <span style={{ color: "#4ade80", fontSize: 10, marginRight: 8, fontWeight: "bold" }}>
          ✓ {i18n.t("flowBuilderConditionCompareNode.true")}
        </span>
        <Handle
          type="source"
          position="right"
          id="true"
          style={{
            background: "#4ade80",
            width: 10,
            height: 10,
            position: "relative",
            transform: "none",
            top: "auto",
            right: "auto",
          }}
          isConnectable={isConnectable}
        />
      </div>

      {/* Saída FALSO */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
        <span style={{ color: "#f87171", fontSize: 10, marginRight: 8, fontWeight: "bold" }}>
          ✗ {i18n.t("flowBuilderConditionCompareNode.false")}
        </span>
        <Handle
          type="source"
          position="right"
          id="false"
          style={{
            background: "#f87171",
            width: 10,
            height: 10,
            position: "relative",
            transform: "none",
            top: "auto",
            right: "auto",
          }}
          isConnectable={isConnectable}
        />
      </div>
    </div>
  );
});
