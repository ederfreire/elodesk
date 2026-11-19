import React, { useState, useEffect, useContext } from "react";
import {
  makeStyles,
  Typography,
  IconButton,
  Button,
  CircularProgress,
} from "@material-ui/core";
import OpenInNew from "@material-ui/icons/OpenInNew";
import Refresh from "@material-ui/icons/Refresh";
import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";
import api from "../../services/api";

const useStyles = makeStyles((theme) => ({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "calc(100vh - 64px)",
    overflow: "hidden",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 16px",
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.mode === "light" ? "#fafafa" : "#1e1e1e",
    minHeight: 48,
  },
  titleSection: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontWeight: 600,
    fontSize: "1rem",
    whiteSpace: "nowrap",
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  iframeContainer: {
    flex: 1,
    position: "relative",
  },
  iframe: {
    width: "100%",
    height: "100%",
    border: "none",
  },
  fallback: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: 16,
    padding: 32,
    textAlign: "center",
  },
  loading: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
  },
}));

const N8NMonitor = () => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const [n8nUrl, setN8nUrl] = useState("");
  const [iframeError, setIframeError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    const fetchN8nUrl = async () => {
      try {
        const { data: configData } = await api.get("/n8n/config");
        if (configData?.configured && configData?.url) {
          setN8nUrl(configData.url);
          setLoading(false);
          return;
        }
      } catch (err) {}

      try {
        const { data } = await api.get("/queueIntegration/");
        const n8nIntegration = data?.queueIntegrations?.find(
          (i) => i.type === "n8n" || i.name === "n8n_url"
        );
        if (n8nIntegration?.urlN8N) {
          setN8nUrl(n8nIntegration.urlN8N);
          setLoading(false);
          return;
        }
      } catch (err) {}

      setN8nUrl(process.env.REACT_APP_N8N_URL || "http://localhost:5678");
      setLoading(false);
    };
    fetchN8nUrl();
  }, []);

  const handleIframeLoad = () => setLoading(false);
  const handleIframeError = () => { setIframeError(true); setLoading(false); };
  const handleOpenNewTab = () => window.open(n8nUrl, "_blank");
  const handleRefresh = () => { setIframeError(false); setLoading(true); setIframeKey((prev) => prev + 1); };

  return (
    <div className={classes.root}>
      <div className={classes.toolbar}>
        <div className={classes.titleSection}>
          <Typography className={classes.title}>N8N</Typography>
        </div>
        <div className={classes.actions}>
          <IconButton size="small" onClick={handleRefresh} title={i18n.t("hardcoded.refresh")}>
            <Refresh />
          </IconButton>
          <IconButton size="small" onClick={handleOpenNewTab} title={i18n.t("hardcoded.openNewTab")}>
            <OpenInNew />
          </IconButton>
        </div>
      </div>

      <div className={classes.iframeContainer}>
        {loading && (
          <div className={classes.loading}>
            <CircularProgress />
          </div>
        )}

        {iframeError ? (
          <div className={classes.fallback}>
            <Typography variant="h6">
              {i18n.t("n8nPanel.iframeBlocked")}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {i18n.t("n8nPanel.iframeBlockedHint")}
            </Typography>
            <Button
              variant="contained"
              color="primary"
              startIcon={<OpenInNew />}
              onClick={handleOpenNewTab}
            >
              {i18n.t("n8nPanel.openInNewTab")}
            </Button>
          </div>
        ) : (
          n8nUrl && (
            <iframe
              key={iframeKey}
              src={n8nUrl}
              className={classes.iframe}
              title="n8n"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
              allow="clipboard-read; clipboard-write"
            />
          )
        )}
      </div>
    </div>
  );
};

export default N8NMonitor;
