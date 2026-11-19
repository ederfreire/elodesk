import React, { useState, useEffect, useCallback } from "react";

import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  Select,
  MenuItem,
  Typography,
  CircularProgress,
  IconButton,
  Tooltip,
  Switch,
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import ErrorOutlineIcon from "@material-ui/icons/ErrorOutline";
import AddIcon from "@material-ui/icons/Add";
import CheckIcon from "@material-ui/icons/Check";
import CloseIcon from "@material-ui/icons/Close";
import StarBorderIcon from "@material-ui/icons/StarBorder";
import ChatBubbleOutlineIcon from "@material-ui/icons/ChatBubbleOutline";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";
import useCompanySettings from "../../hooks/useSettings/companySettings";

const useStyles = makeStyles((theme) => ({
  paper: {
    borderRadius: 16,
    padding: theme.spacing(1, 0),
    width: "100%",
    maxWidth: 440,
  },
  content: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    padding: theme.spacing(3, 4, 1, 4),
  },
  iconWrapper: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245, 166, 35, 0.12)",
    color: "#f5a623",
    marginBottom: theme.spacing(2),
    "& svg": {
      fontSize: 38,
    },
  },
  title: {
    textAlign: "center",
    fontWeight: 700,
    fontSize: "1.25rem",
    color: theme.palette.text.primary,
  },
  subtitle: {
    textAlign: "center",
    color: theme.palette.text.secondary,
    fontSize: "0.95rem",
    marginTop: theme.spacing(0.5),
    marginBottom: theme.spacing(2.5),
  },
  fieldLabel: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: theme.palette.text.primary,
    marginBottom: theme.spacing(0.75),
  },
  field: {
    marginBottom: theme.spacing(2),
  },
  select: {
    borderRadius: 10,
  },
  subjectRow: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
  },
  addSubjectButton: {
    flexShrink: 0,
    border: `1px solid ${theme.palette.primary.main}`,
    borderRadius: 10,
    color: theme.palette.primary.main,
    padding: theme.spacing(1),
  },
  newSubjectRow: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
  },
  ratingRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing(1),
    padding: theme.spacing(1.25, 1.5),
    marginBottom: theme.spacing(1),
    borderRadius: 12,
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor:
      theme.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
  },
  ratingInfo: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    cursor: "pointer",
    flex: 1,
    minWidth: 0,
  },
  ratingIcon: {
    color: "#f5a623",
  },
  ratingTexts: {
    display: "flex",
    flexDirection: "column",
  },
  ratingTitle: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: theme.palette.text.primary,
  },
  ratingSubtitle: {
    fontSize: "0.75rem",
    color: theme.palette.text.secondary,
  },
  // ── Toggle (switch) mais claro: verde quando ativo, cinza quando inativo ──
  switchRoot: {
    width: 50,
    height: 28,
    padding: 0,
    margin: theme.spacing(0, 0.5),
    flexShrink: 0,
  },
  switchBase: {
    padding: 3,
    color: "#fff",
    "&$switchChecked": {
      transform: "translateX(22px)",
      color: "#fff",
      "& + $switchTrack": {
        backgroundColor: "#2e9e5b",
        opacity: 1,
        border: "none",
      },
    },
  },
  switchChecked: {},
  switchThumb: {
    width: 22,
    height: 22,
    boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
  },
  switchTrack: {
    borderRadius: 14,
    backgroundColor:
      theme.mode === "dark" ? "rgba(255,255,255,0.3)" : "#c2c6cf",
    opacity: 1,
  },

  actions: {
    padding: theme.spacing(2, 4, 3, 4),
    gap: theme.spacing(1.5),
    "& > *": {
      flex: 1,
    },
  },
  cancelButton: {
    borderRadius: 24,
    textTransform: "none",
    fontWeight: 600,
    padding: theme.spacing(1, 2),
    backgroundColor:
      theme.mode === "dark" ? "rgba(255,255,255,0.08)" : "#e8eaf0",
    color: theme.palette.text.primary,
    "&:hover": {
      backgroundColor:
        theme.mode === "dark" ? "rgba(255,255,255,0.14)" : "#dcdfe8",
    },
  },
  confirmButton: {
    borderRadius: 24,
    textTransform: "none",
    fontWeight: 600,
    padding: theme.spacing(1, 2),
    backgroundColor: theme.palette.primary.main,
    color: "#fff",
    "&:hover": {
      backgroundColor: theme.palette.primary.dark,
    },
  },
}));

const CloseTicketModal = ({ open, onClose, onConfirm, loading, compact = false }) => {
  const classes = useStyles();
  const { get: getSetting } = useCompanySettings();

  const [subject, setSubject] = useState("");
  const [summary, setSummary] = useState("");
  const [reasons, setReasons] = useState([]);
  const [addingNew, setAddingNew] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [savingSubject, setSavingSubject] = useState(false);
  const [ratingEnabled, setRatingEnabled] = useState(false);
  const [withRating, setWithRating] = useState(true);
  const [withFarewell, setWithFarewell] = useState(true);

  const fetchReasons = useCallback(async () => {
    try {
      const { data } = await api.get("/ticketFinalizationReasons");
      setReasons(Array.isArray(data) ? data : []);
    } catch (err) {
      toastError(err);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSubject("");
    setSummary("");
    setAddingNew(false);
    setNewSubjectName("");
    setWithRating(true);
    setWithFarewell(true);
    fetchReasons();
    const loadRatingSetting = async () => {
      try {
        const setting = await getSetting({ column: "userRating" });
        const value = setting?.userRating;
        setRatingEnabled(value === "enabled" || value === true || value === "true");
      } catch (err) {
        setRatingEnabled(false);
      }
    };
    loadRatingSetting();
    // Roda apenas ao abrir o modal. Se depender de getSetting, alguns hooks recriam
    // a função a cada render e o formulário era limpo a cada clique/digitação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSaveNewSubject = async () => {
    const name = newSubjectName.trim();
    if (!name || savingSubject) return;
    setSavingSubject(true);
    try {
      const { data } = await api.post("/ticketFinalizationReasons", { name });
      await fetchReasons();
      setSubject(data?.name || name);
      setNewSubjectName("");
      setAddingNew(false);
      toast.success(i18n.t("closeTicketModal.subjectAdded"));
    } catch (err) {
      toastError(err);
    } finally {
      setSavingSubject(false);
    }
  };

  const handleConfirm = () => {
    if (loading) return;
    onConfirm({
      closingSubject: compact ? null : (subject || null),
      closingSummary: compact ? null : (summary?.trim() || null),
      sendRatingMessage: ratingEnabled ? withRating : undefined,
      sendFarewellMessage: withFarewell,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      classes={{ paper: classes.paper }}
      maxWidth="xs"
      fullWidth
    >
      <DialogContent className={classes.content}>
        <div className={classes.iconWrapper}>
          <ErrorOutlineIcon />
        </div>

        <Typography className={classes.title}>
          {i18n.t("closeTicketModal.title")}
        </Typography>
        <Typography className={classes.subtitle}>
          {i18n.t("closeTicketModal.subtitle")}
        </Typography>

        {!compact && (
        <>
        <div className={classes.field}>
          <Typography className={classes.fieldLabel}>
            {i18n.t("closeTicketModal.subject")}
          </Typography>
          <div className={classes.subjectRow}>
            <FormControl fullWidth variant="outlined" size="small">
              <Select
                value={subject}
                displayEmpty
                onChange={(e) => setSubject(e.target.value)}
                className={classes.select}
              >
                <MenuItem value="">
                  <em>{i18n.t("closeTicketModal.selectPlaceholder")}</em>
                </MenuItem>
                {reasons.map((reason) => (
                  <MenuItem key={reason.id} value={reason.name}>
                    {reason.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Tooltip title={i18n.t("closeTicketModal.addSubject")}>
              <IconButton
                size="small"
                className={classes.addSubjectButton}
                onClick={() => setAddingNew((prev) => !prev)}
              >
                {addingNew ? (
                  <CloseIcon fontSize="small" />
                ) : (
                  <AddIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
          </div>

          {addingNew && (
            <div className={classes.newSubjectRow}>
              <TextField
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                placeholder={i18n.t("closeTicketModal.newSubjectPlaceholder")}
                variant="outlined"
                size="small"
                fullWidth
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSaveNewSubject();
                  }
                }}
              />
              <Tooltip title={i18n.t("closeTicketModal.save")}>
                <span>
                  <IconButton
                    size="small"
                    color="primary"
                    onClick={handleSaveNewSubject}
                    disabled={savingSubject || !newSubjectName.trim()}
                  >
                    {savingSubject ? (
                      <CircularProgress size={18} color="inherit" />
                    ) : (
                      <CheckIcon fontSize="small" />
                    )}
                  </IconButton>
                </span>
              </Tooltip>
            </div>
          )}
        </div>

        <div className={classes.field}>
          <Typography className={classes.fieldLabel}>
            {i18n.t("closeTicketModal.summary")}
          </Typography>
          <TextField
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder={i18n.t("closeTicketModal.summaryPlaceholder")}
            variant="outlined"
            size="small"
            fullWidth
            multiline
            minRows={3}
            maxRows={6}
          />
        </div>
        </>
        )}

        <div className={classes.ratingRow}>
          <div
            className={classes.ratingInfo}
            onClick={() => {
              if (!loading) setWithFarewell((prev) => !prev);
            }}
          >
            <ChatBubbleOutlineIcon className={classes.ratingIcon} />
            <div className={classes.ratingTexts}>
              <span className={classes.ratingTitle}>
                {i18n.t("closeTicketModal.sendFarewell")}
              </span>
              <span className={classes.ratingSubtitle}>
                {withFarewell
                  ? i18n.t("closeTicketModal.farewellOn")
                  : i18n.t("closeTicketModal.farewellOff")}
              </span>
            </div>
          </div>
          <Switch
            disableRipple
            checked={withFarewell}
            onChange={(e) => setWithFarewell(e.target.checked)}
            disabled={loading}
            classes={{
              root: classes.switchRoot,
              switchBase: classes.switchBase,
              checked: classes.switchChecked,
              thumb: classes.switchThumb,
              track: classes.switchTrack,
            }}
          />
        </div>

        {ratingEnabled && (
          <div className={classes.ratingRow}>
            <div
              className={classes.ratingInfo}
              onClick={() => {
                if (!loading) setWithRating((prev) => !prev);
              }}
            >
              <StarBorderIcon className={classes.ratingIcon} />
              <div className={classes.ratingTexts}>
                <span className={classes.ratingTitle}>
                  {i18n.t("closeTicketModal.requestRating")}
                </span>
                <span className={classes.ratingSubtitle}>
                  {withRating
                    ? i18n.t("closeTicketModal.ratingOn")
                    : i18n.t("closeTicketModal.ratingOff")}
                </span>
              </div>
            </div>
            <Switch
              disableRipple
              checked={withRating}
              onChange={(e) => setWithRating(e.target.checked)}
              disabled={loading}
              classes={{
                root: classes.switchRoot,
                switchBase: classes.switchBase,
                checked: classes.switchChecked,
                thumb: classes.switchThumb,
                track: classes.switchTrack,
              }}
            />
          </div>
        )}

      </DialogContent>

      <DialogActions className={classes.actions}>
        <Button
          onClick={onClose}
          className={classes.cancelButton}
          disabled={loading}
        >
          {i18n.t("closeTicketModal.cancel")}
        </Button>
        <Button
          onClick={handleConfirm}
          className={classes.confirmButton}
          disabled={loading}
          startIcon={
            loading ? <CircularProgress size={16} color="inherit" /> : null
          }
        >
          {ratingEnabled && !withRating
            ? i18n.t("closeTicketModal.confirmWithoutRating")
            : i18n.t("closeTicketModal.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CloseTicketModal;
