import React, { useState, useEffect } from "react";

import { makeStyles } from "@material-ui/core/styles";
import api from "../../services/api";

const packageVersion = require("../../../package.json").version;

const useStyles = makeStyles((theme) => ({
  banner: {
    position: "fixed",
    top: 64,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: theme.zIndex.drawer + 2,
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
    backgroundColor: theme.palette.info.main,
    color: "white",
    padding: theme.spacing(1.5, 3),
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    maxWidth: "600px",
    minWidth: "400px",
    width: "90%",
    [theme.breakpoints.down("sm")]: {
      width: "95%",
      minWidth: "300px",
      padding: theme.spacing(1, 2),
    },
  },
  pulseIcon: {
    animation: "$pulse 2s infinite",
    color: theme.palette.error.main,
  },
  updateButton: {
    backgroundColor: theme.palette.success.main,
    color: "white",
    fontWeight: "bold",
    "&:hover": {
      backgroundColor: theme.palette.success.dark,
    },
  },
  bannerButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    color: "white",
    border: "1px solid rgba(255, 255, 255, 0.3)",
    "&:hover": {
      backgroundColor: "rgba(255, 255, 255, 0.3)",
    },
  },
  iconContainer: {
    display: "flex",
    alignItems: "center",
    marginRight: theme.spacing(1),
  },
  "@keyframes pulse": {
    "0%": { transform: "scale(1)", opacity: 1 },
    "50%": { transform: "scale(1.1)", opacity: 0.8 },
    "100%": { transform: "scale(1)", opacity: 1 },
  },
}));

const VersionControl = () => {
  // Banner de atualização desabilitado
  return null;
};

export default VersionControl;