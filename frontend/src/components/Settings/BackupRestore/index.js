import React, { useState } from "react";
import { makeStyles, Paper, Typography, Button, Grid, CircularProgress, Box } from "@material-ui/core";
import BackupIcon from "@material-ui/icons/Backup";
import RestoreIcon from "@material-ui/icons/Restore";
import DownloadIcon from "@material-ui/icons/GetApp";
import UploadIcon from "@material-ui/icons/CloudUpload";
import { toast } from "react-toastify";
import api from "../../../services/api";
import { i18n } from "../../../translate/i18n";

const useStyles = makeStyles((theme) => ({
  root: {
    padding: theme.spacing(3),
  },
  section: {
    padding: theme.spacing(3),
    marginBottom: theme.spacing(3),
  },
  sectionTitle: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    marginBottom: theme.spacing(2),
  },
  description: {
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(2),
  },
  buttonGroup: {
    display: "flex",
    gap: theme.spacing(2),
    flexWrap: "wrap",
  },
  dangerZone: {
    borderColor: theme.palette.error.main,
    border: "1px solid",
  },
  dangerTitle: {
    color: theme.palette.error.main,
  },
  hiddenInput: {
    display: "none",
  },
}));

const BackupRestore = () => {
  const classes = useStyles();
  const [loadingSQL, setLoadingSQL] = useState(false);
  const [loadingJSON, setLoadingJSON] = useState(false);
  const [loadingRestore, setLoadingRestore] = useState(false);

  const handleBackupSQL = async () => {
    setLoadingSQL(true);
    try {
      const response = await api.get("/backup/sql", {
        responseType: "blob",
      });

      const contentDisposition = response.headers["content-disposition"];
      const filename = contentDisposition
        ? contentDisposition.split("filename=")[1]?.replace(/"/g, "")
        : `backup_${new Date().toISOString().replace(/[:.]/g, "-")}.sql`;

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success(i18n.t("backupRestore.toasts.sqlSuccess"));
    } catch (err) {
      toast.error(i18n.t("backupRestore.toasts.sqlError"));
    }
    setLoadingSQL(false);
  };

  const handleBackupJSON = async () => {
    setLoadingJSON(true);
    try {
      const response = await api.get("/backup/json", {
        responseType: "blob",
      });

      const contentDisposition = response.headers["content-disposition"];
      const filename = contentDisposition
        ? contentDisposition.split("filename=")[1]?.replace(/"/g, "")
        : `backup_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success(i18n.t("backupRestore.toasts.jsonSuccess"));
    } catch (err) {
      toast.error(i18n.t("backupRestore.toasts.jsonError"));
    }
    setLoadingJSON(false);
  };

  const handleRestore = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith(".sql")) {
      toast.error(i18n.t("backupRestore.toasts.sqlOnly"));
      return;
    }

    const confirmRestore = window.confirm(
      i18n.t("backupRestore.confirmRestore")
    );

    if (!confirmRestore) {
      e.target.value = "";
      return;
    }

    setLoadingRestore(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      await api.post("/backup/restore", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 300000, // 5 min para restaurações grandes
      });

      toast.success(i18n.t("backupRestore.toasts.restoreSuccess"));
    } catch (err) {
      toast.error(i18n.t("backupRestore.toasts.restoreError"));
    }
    setLoadingRestore(false);
    e.target.value = "";
  };

  return (
    <div className={classes.root}>
      {/* Seção de Backup */}
      <Paper className={classes.section} elevation={1}>
        <div className={classes.sectionTitle}>
          <BackupIcon color="primary" />
          <Typography variant="h6">{i18n.t("backupRestore.backupTitle")}</Typography>
        </div>
        <Typography className={classes.description}>
          Faça o download de uma cópia completa do banco de dados. Escolha o
          formato desejado:
        </Typography>

        <Grid container spacing={2}>
          <Grid item>
            <Button
              variant="contained"
              color="primary"
              startIcon={
                loadingSQL ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  <DownloadIcon />
                )
              }
              onClick={handleBackupSQL}
              disabled={loadingSQL || loadingJSON}
            >
              {loadingSQL ? i18n.t("backupRestore.generating") : i18n.t("backupRestore.backupSQL")}
            </Button>
          </Grid>
          <Grid item>
            <Button
              variant="outlined"
              color="primary"
              startIcon={
                loadingJSON ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  <DownloadIcon />
                )
              }
              onClick={handleBackupJSON}
              disabled={loadingSQL || loadingJSON}
            >
              {loadingJSON ? i18n.t("backupRestore.generating") : i18n.t("backupRestore.backupJSON")}
            </Button>
          </Grid>
        </Grid>

        <Box mt={2}>
          <Typography variant="caption" color="textSecondary">
            💡 O backup SQL é ideal para restauração completa. O backup JSON é
            útil para análise e migração de dados.
          </Typography>
        </Box>
      </Paper>

      {/* Seção de Restauração */}
      <Paper
        className={`${classes.section} ${classes.dangerZone}`}
        elevation={1}
      >
        <div className={classes.sectionTitle}>
          <RestoreIcon color="error" />
          <Typography variant="h6" className={classes.dangerTitle}>
            {i18n.t("backupRestore.restoreTitle")}
          </Typography>
        </div>
        <Typography className={classes.description}>
          ⚠️ <strong>Zona de perigo:</strong> A restauração irá sobrescrever
          todos os dados atuais do banco. Certifique-se de ter um backup
          atualizado antes de prosseguir.
        </Typography>

        <input
          accept=".sql"
          className={classes.hiddenInput}
          id="restore-file-input"
          type="file"
          onChange={handleRestore}
          disabled={loadingRestore}
        />
        <label htmlFor="restore-file-input">
          <Button
            variant="contained"
            color="secondary"
            component="span"
            startIcon={
              loadingRestore ? (
                <CircularProgress size={20} color="inherit" />
              ) : (
                <UploadIcon />
              )
            }
            disabled={loadingRestore}
          >
            {loadingRestore ? i18n.t("backupRestore.restoring") : i18n.t("backupRestore.uploadRestore")}
          </Button>
        </label>

        <Box mt={2} p={2} style={{ backgroundColor: "rgba(33,150,243,0.08)", borderRadius: 8, border: "1px solid rgba(33,150,243,0.3)" }}>
          <Typography variant="body2" style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ fontSize: 18 }}>ℹ️</span>
            <span>
              <strong>{i18n.t("backupRestore.important")}:</strong> {i18n.t("backupRestore.importantText")}
            </span>
          </Typography>
        </Box>
      </Paper>
    </div>
  );
};

export default BackupRestore;
