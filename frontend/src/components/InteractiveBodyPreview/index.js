import React from "react";
import MarkdownWrapper from "../MarkdownWrapper";

/**
 * Detecta mensagens persistidas como "[BUTTON]\n\n*Título*\n\n*1* - opção"
 * ou "[LIST]\n\n*Descrição*\n\nOpção 1\nOpção 2" e renderiza como um
 * cartão estilo WhatsApp mobile, com os botões/itens visíveis e clicáveis
 * (visual apenas — o WhatsApp já trata o clique original).
 *
 * Retorna null se a string não for um body interativo (assim o caller
 * faz fallback para o MarkdownWrapper normal).
 */
const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e1e4e8",
  borderRadius: 8,
  padding: "10px 12px",
  margin: "2px 0",
  maxWidth: 360,
  boxShadow: "0 1px 1px rgba(0,0,0,0.04)",
};

const titleStyle = {
  fontWeight: 600,
  color: "#111b21",
  marginBottom: 6,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const buttonStyle = {
  display: "block",
  width: "100%",
  textAlign: "center",
  padding: "8px 10px",
  margin: "4px 0 0",
  background: "#ffffff",
  color: "#00a884",
  border: "1px solid #e1e4e8",
  borderRadius: 6,
  fontWeight: 500,
  fontSize: 14,
  cursor: "default",
};

const listItemStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 4px",
  borderTop: "1px solid #f0f2f5",
  color: "#111b21",
  fontSize: 14,
};

const listFooterStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  marginTop: 8,
  padding: "8px 10px",
  color: "#00a884",
  fontWeight: 500,
  borderTop: "1px solid #f0f2f5",
};

const stripBold = (s) => (s || "").replace(/^\*(.+)\*$/, "$1").trim();

const InteractiveBodyPreview = ({ body }) => {
  if (!body || typeof body !== "string") return null;
  const trimmed = body.trim();

  // ===== BUTTON =====
  // Formato: [BUTTON]\n\n*Título*\n\n*id* - texto\n*id* - texto
  if (trimmed.startsWith("[BUTTON]")) {
    const rest = trimmed.replace(/^\[BUTTON\]\s*/, "");
    const lines = rest.split("\n").map((l) => l.trim()).filter(Boolean);
    const title = stripBold(lines.shift() || "");
    const buttons = lines
      .map((l) => {
        const m = l.match(/^\*?([^*]+?)\*?\s*-\s*(.+)$/);
        return m ? { id: m[1].trim(), text: m[2].trim() } : { id: "", text: l };
      })
      .filter((b) => b.text);
    return (
      <div style={cardStyle}>
        {title && <div style={titleStyle}>{title}</div>}
        {buttons.map((b, i) => (
          <div key={i} style={buttonStyle}>{b.text}</div>
        ))}
      </div>
    );
  }

  // ===== LIST =====
  // Formato: [LIST]\n\n*Descrição*\n\nTítulo opção 1\nTítulo opção 2
  if (trimmed.startsWith("[LIST]")) {
    const rest = trimmed.replace(/^\[LIST\]\s*/, "");
    const lines = rest.split("\n").map((l) => l.trim()).filter(Boolean);
    const title = stripBold(lines.shift() || "");
    const items = lines;
    return (
      <div style={cardStyle}>
        {title && <div style={titleStyle}>{title}</div>}
        {items.map((it, i) => (
          <div key={i} style={listItemStyle}>
            <span>{stripBold(it)}</span>
          </div>
        ))}
        <div style={listFooterStyle}>
          <span>☰</span>
          <span>Ver opções</span>
        </div>
      </div>
    );
  }

  return null;
};

/** Detecta se o body é um placeholder interativo (BUTTON/LIST). */
export const isInteractiveBody = (body) =>
  typeof body === "string" &&
  (body.trim().startsWith("[BUTTON]") || body.trim().startsWith("[LIST]"));

/**
 * Helper: renderiza o body interativo se aplicável, senão devolve o
 * MarkdownWrapper padrão.
 */
export const renderInteractiveOrMarkdown = (body) =>
  isInteractiveBody(body)
    ? <InteractiveBodyPreview body={body} />
    : <MarkdownWrapper>{body}</MarkdownWrapper>;

export default InteractiveBodyPreview;