import React, { useState, useEffect, useContext } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import { toast } from "react-toastify";
import { openApi } from "../../services/api";
import ColorModeContext from "../../layout/themeContext";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles((theme) => {
  const isLight = theme.palette.type === "light";
  const textPrimary = isLight ? "#1a1f2e" : "#e6edf3";
  const textSecondary = isLight ? "#5b6472" : "#8b949e";
  const textMuted = isLight ? "#8a94a6" : "#555";
  const cardBg = isLight ? "#ffffff" : "rgba(18, 20, 28, 0.92)";
  const cardBorder = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.07)";
  const cardShadow = isLight
    ? "0 8px 40px rgba(15, 23, 42, 0.08), inset 0 0 0 1px rgba(0,0,0,0.04)"
    : "0 8px 40px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.07)";
  const rootBg = isLight
    ? "linear-gradient(135deg, #f5f7fb 0%, #eef2f8 50%, #e8edf5 100%)"
    : "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0d0d0d 100%)";
  const inputBg = isLight ? "#f7f9fc" : "rgba(255,255,255,0.05)";
  const inputBorder = isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)";
  return ({
  root: {
    width: "100vw",
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: isLight ? "#f5f7fb" : "#0a0a0a",
    background: rootBg
  },
  card: {
    width: "100%",
    maxWidth: "420px",
    backgroundColor: cardBg,
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    borderRadius: "20px",
    padding: "48px 36px",
    boxShadow: cardShadow,
    border: `1px solid ${cardBorder}`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    [theme.breakpoints.down("sm")]: {
      margin: "0 16px",
      padding: "36px 24px"
    }
  },
  logoContainer: {
    marginBottom: "28px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "14px"
  },
  logoImage: {
    maxWidth: "180px",
    maxHeight: "60px",
    objectFit: "contain"
  },
  brandName: {
    fontSize: "28px",
    fontWeight: 800,
    color: textPrimary,
    textAlign: "center",
    letterSpacing: "-0.02em"
  },
  iconCircle: {
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    background: `linear-gradient(135deg, ${theme.palette.primary.main}33, ${theme.palette.primary.main}11)`,
    border: `2px solid ${theme.palette.primary.main}44`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "20px",
    fontSize: "24px"
  },
  title: {
    fontSize: "22px",
    fontWeight: 700,
    color: textPrimary,
    marginBottom: "8px",
    textAlign: "center"
  },
  subtitle: {
    fontSize: "14px",
    color: textSecondary,
    marginBottom: "28px",
    textAlign: "center",
    lineHeight: 1.6
  },
  label: {
    fontSize: "13px",
    fontWeight: 600,
    color: textPrimary,
    marginBottom: "6px",
    display: "block",
    textAlign: "left",
    width: "100%"
  },
  input: {
    width: "100%",
    padding: "14px 16px",
    borderRadius: "10px",
    border: `1px solid ${inputBorder}`,
    backgroundColor: inputBg,
    color: textPrimary,
    fontSize: "15px",
    outline: "none",
    marginBottom: "16px",
    boxSizing: "border-box",
    transition: "border-color 0.2s, box-shadow 0.2s",
    "&:focus": {
      borderColor: theme.palette.primary.main,
      boxShadow: `0 0 0 3px ${theme.palette.primary.main}22`
    },
    "&::placeholder": {
      color: textMuted
    }
  },
  button: {
    width: "100%",
    padding: "14px 0",
    borderRadius: "10px",
    fontSize: "16px",
    fontWeight: 700,
    textTransform: "none",
    color: "#fff",
    background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark || "#5a2dcc"})`,
    boxShadow: `0 4px 20px ${theme.palette.primary.main}44`,
    border: "none",
    cursor: "pointer",
    marginTop: "8px",
    transition: "all 0.25s ease",
    "&:hover": {
      opacity: 0.92,
      transform: "translateY(-2px)",
      boxShadow: `0 6px 24px ${theme.palette.primary.main}66`
    },
    "&:disabled": {
      opacity: 0.6,
      cursor: "not-allowed",
      transform: "none"
    }
  },
  successContainer: {
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px"
  },
  successIcon: {
    width: "64px",
    height: "64px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #4caf5033, #4caf5011)",
    border: "2px solid #4caf5044",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "28px",
    marginBottom: "8px"
  },
  successMessage: {
    color: "#4caf50",
    fontSize: "16px",
    fontWeight: 600
  },
  successSub: {
    color: textSecondary,
    fontSize: "13px"
  },
  passwordHint: {
    fontSize: "11px",
    color: textMuted,
    marginTop: "-10px",
    marginBottom: "16px",
    textAlign: "left",
    width: "100%"
  }
  });
});

const ResetPassword = () => {
  const classes = useStyles();
  const history = useHistory();
  const location = useLocation();
  const { colorMode } = useContext(ColorModeContext);
  const { appLogoLight, appLogoDark, appName } = colorMode || {};

  const params = new URLSearchParams(location.search);
  const resetToken = params.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const logo = appLogoDark || appLogoLight;

  useEffect(() => {
    if (!resetToken) {
      history.push("/forgot-password");
    }
  }, [resetToken, history]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      toast.error(i18n.t("resetPassword.toasts.minLength"));
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(i18n.t("resetPassword.toasts.mismatch"));
      return;
    }

    setLoading(true);
    try {
      await openApi.post("/auth/reset-password", {
        resetToken,
        newPassword
      });
      setSuccess(true);
      toast.success(i18n.t("resetPassword.toasts.success"));
      setTimeout(() => history.push("/login"), 2500);
    } catch (err) {
      toast.error(i18n.t("resetPassword.toasts.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={classes.root}>
      <div className={classes.card}>
        <div className={classes.logoContainer}>
          {logo ? <img src={logo} alt={appName || "Logo"} className={classes.logoImage} /> : null}
        </div>

        {success ? (
          <div className={classes.successContainer}>
            <div className={classes.successIcon}>✅</div>
            <div className={classes.successMessage}>{i18n.t("resetPassword.successTitle")}</div>
            <div className={classes.successSub}>{i18n.t("resetPassword.successSubtitle")}</div>
          </div>
        ) : (
          <>
            <div className={classes.iconCircle}>🔐</div>

            <div className={classes.title}>{i18n.t("resetPassword.title")}</div>
            <div className={classes.subtitle}>
              {i18n.t("resetPassword.subtitleLine1")}<br />
              {i18n.t("resetPassword.subtitleLine2")}
            </div>

            <form onSubmit={handleSubmit} style={{ width: "100%" }}>
              <label className={classes.label}>{i18n.t("resetPassword.newPassword")}</label>
              <input
                className={classes.input}
                type="password"
                placeholder={i18n.t("resetPassword.passwordPlaceholder")}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoFocus
              />
              <div className={classes.passwordHint}>{i18n.t("resetPassword.minHint")}</div>

              <label className={classes.label}>{i18n.t("resetPassword.confirmPassword")}</label>
              <input
                className={classes.input}
                type="password"
                placeholder={i18n.t("resetPassword.confirmPlaceholder")}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />

              <button className={classes.button} type="submit" disabled={loading}>
                {loading ? i18n.t("resetPassword.submitting") : i18n.t("resetPassword.submit")}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
