import React, { useState, useContext, useEffect } from "react";
import {
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  Box,
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import { toast } from "react-toastify";
import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";
import api from "../../services/api";
import AccessTimeIcon from "@material-ui/icons/AccessTime";

const useStyles = makeStyles((theme) => ({
  root: {
    padding: theme.spacing(2),
  },
  title: {
    fontWeight: 600,
    marginBottom: theme.spacing(2),
  },
  paper: {
    padding: theme.spacing(3),
    borderRadius: 12,
    marginBottom: theme.spacing(2),
  },
  slaPreview: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px",
    borderRadius: 8,
    marginTop: theme.spacing(1),
    fontSize: "0.85rem",
    fontWeight: 600,
  },
  colorRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: theme.spacing(1),
  },
  colorInput: {
    width: 48,
    height: 40,
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: 2,
    background: "#fff",
    cursor: "pointer",
  },
  saveBtn: {
    borderRadius: 10,
    marginTop: theme.spacing(2),
  },
}));

const hexWithAlpha = (hex, alpha) => {
  if (!hex) return `rgba(0,0,0,${alpha})`;
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const KanbanSlaSettings = ({ settings, onSettingsChange }) => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);

  const [slaGreen, setSlaGreen] = useState(settings?.slaGreenMinutes ?? 30);
  const [slaYellow, setSlaYellow] = useState(settings?.slaYellowMinutes ?? 60);
  const [slaRed, setSlaRed] = useState(settings?.slaRedMinutes ?? 120);
  const [slaGreenColor, setSlaGreenColor] = useState(settings?.slaGreenColor || "#22c55e");
  const [slaYellowColor, setSlaYellowColor] = useState(settings?.slaYellowColor || "#eab308");
  const [slaRedColor, setSlaRedColor] = useState(settings?.slaRedColor || "#ef4444");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSlaGreen(settings?.slaGreenMinutes ?? 30);
    setSlaYellow(settings?.slaYellowMinutes ?? 60);
    setSlaRed(settings?.slaRedMinutes ?? 120);
    setSlaGreenColor(settings?.slaGreenColor || "#22c55e");
    setSlaYellowColor(settings?.slaYellowColor || "#eab308");
    setSlaRedColor(settings?.slaRedColor || "#ef4444");
  }, [settings]);

  const handleSave = async () => {
    const green = parseInt(slaGreen, 10);
    const yellow = parseInt(slaYellow, 10);
    const red = parseInt(slaRed, 10);

    if (isNaN(green) || isNaN(yellow) || isNaN(red)) {
      toast.error(i18n.t("hardcoded.fillAllFields"));
      return;
    }

    if (green >= yellow || yellow >= red) {
      toast.error(i18n.t("hardcoded.slaLimitsOrder"));
      return;
    }

    setSaving(true);
    try {
      await api.put("/companySettings", { column: "slaGreenMinutes", data: green.toString() });
      await api.put("/companySettings", { column: "slaYellowMinutes", data: yellow.toString() });
      await api.put("/companySettings", { column: "slaRedMinutes", data: red.toString() });
      await api.put("/companySettings", { column: "slaGreenColor", data: slaGreenColor });
      await api.put("/companySettings", { column: "slaYellowColor", data: slaYellowColor });
      await api.put("/companySettings", { column: "slaRedColor", data: slaRedColor });

      if (onSettingsChange) {
        onSettingsChange({
          ...settings,
          slaGreenMinutes: green,
          slaYellowMinutes: yellow,
          slaRedMinutes: red,
          slaGreenColor,
          slaYellowColor,
          slaRedColor,
        });
      }

      toast.success(i18n.t("hardcoded.slaUpdated"));
    } catch (err) {
      toast.error(i18n.t("hardcoded.slaError"));
    }
    setSaving(false);
  };

  const renderLevel = (label, helper, value, setValue, color, setColor, previewLabel) => (
    <Grid item xs={12} sm={4}>
      <TextField
        label={label}
        type="number"
        variant="outlined"
        fullWidth
        value={value}
        onChange={(e) => setValue(e.target.value)}
        helperText={helper}
        inputProps={{ min: 1 }}
        InputProps={{ style: { borderRadius: 10 } }}
      />
      <div className={classes.colorRow}>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className={classes.colorInput}
          title={i18n.t("hardcoded.slaSelectColor")}
        />
        <Typography variant="body2" style={{ color: "#64748b" }}>
          {color.toUpperCase()}
        </Typography>
      </div>
      <div
        className={classes.slaPreview}
        style={{
          background: hexWithAlpha(color, 0.12),
          color,
        }}
      >
        <AccessTimeIcon style={{ fontSize: 16 }} />
        {previewLabel}
      </div>
    </Grid>
  );

  return (
    <div className={classes.root}>
      <Typography variant="h5" className={classes.title}>
        {i18n.t("hardcoded.slaTitle")}
      </Typography>

      <Paper className={classes.paper} elevation={1}>
        <Typography variant="h6" gutterBottom>
          {i18n.t("hardcoded.slaTimeLimitsAndColors")}
        </Typography>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          {i18n.t("hardcoded.slaDescription")}
        </Typography>

        <Grid container spacing={3} style={{ marginTop: 8 }}>
          {renderLevel(
            i18n.t("hardcoded.slaOnTimeLabel"),
            i18n.t("hardcoded.slaOnTimeHelper"),
            slaGreen,
            setSlaGreen,
            slaGreenColor,
            setSlaGreenColor,
            i18n.t("hardcoded.slaOnTimePreview", { m: slaGreen })
          )}
          {renderLevel(
            i18n.t("hardcoded.slaWarningLabel"),
            i18n.t("hardcoded.slaWarningHelper"),
            slaYellow,
            setSlaYellow,
            slaYellowColor,
            setSlaYellowColor,
            i18n.t("hardcoded.slaWarningPreview", { m: slaYellow })
          )}
          {renderLevel(
            i18n.t("hardcoded.slaLateLabel"),
            i18n.t("hardcoded.slaLateHelper"),
            slaRed,
            setSlaRed,
            slaRedColor,
            setSlaRedColor,
            i18n.t("hardcoded.slaLatePreview", { m: slaRed })
          )}
        </Grid>

        <Box display="flex" justifyContent="flex-end">
          <Button
            variant="contained"
            color="primary"
            className={classes.saveBtn}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? i18n.t("hardcoded.slaSaving") : i18n.t("hardcoded.slaSaveBtn")}
          </Button>
        </Box>
      </Paper>
    </div>
  );
};

export default KanbanSlaSettings;
