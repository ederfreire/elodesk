
const getWhitelabelColor = () => {
  const preferredTheme = window.localStorage.getItem("preferredTheme") || "light";
  if (preferredTheme === "dark") {
    return localStorage.getItem("primaryColorDark") || localStorage.getItem("primaryColorLight") || "#065183";
  }
  return localStorage.getItem("primaryColorLight") || "#065183";
};

export const colorBack = () => {
  return getWhitelabelColor();
};

export const colorPrimary = () => {
  return getWhitelabelColor();
};

export const colorIconesMenu = () => {
  return getWhitelabelColor();
};

export const colorTitleTable = () => {
  return "#e5e5e5";
};

export const colorTopTable = () => {
  return "#ededed";
};

export const colorBackgroundTable = () => {
  return "#2a273b";
};

export const colorLineTable = () => {
  return getWhitelabelColor();
};

export const colorLineTableHover = () => {
  return getWhitelabelColor();
};

export const colorTopbar = () => {
  return "#141414";
};

export const shadowSmall = () => {
  return "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)";
};

export const shadowMedium = () => {
  return "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)";
};

export const shadowLarge = () => {
  return "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)";
};
