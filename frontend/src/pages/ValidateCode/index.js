import React, { useState, useRef, useEffect, useContext } from "react";
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
  const inputBorder = isLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.15)";
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
  emailHighlight: {
    color: theme.palette.primary.main,
    fontWeight: 600
  },
  label: {
    fontSize: "13px",
    fontWeight: 600,
    color: textPrimary,
    marginBottom: "10px",
    display: "block",
    textAlign: "left",
    width: "100%"
  },
  codeContainer: {
    display: "flex",
    gap: "10px",
    justifyContent: "center",
    marginBottom: "24px",
    width: "100%"
  },
  codeInput: {
    width: "48px",
    height: "56px",
    borderRadius: "10px",
    border: `1px solid ${inputBorder}`,
    backgroundColor: inputBg,
    color: textPrimary,
    fontSize: "24px",
    fontWeight: 700,
    textAlign: "center",
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
    caretColor: theme.palette.primary.main,
    "&:focus": {
      borderColor: theme.palette.primary.main,
      boxShadow: `0 0 0 3px ${theme.palette.primary.main}22`
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
  backLink: {
    marginTop: "20px",
    fontSize: "13px",
    color: textSecondary,
    cursor: "pointer",
    textDecoration: "none",
    transition: "color 0.2s",
    "&:hover": {
      color: theme.palette.primary.main
    }
  },
  resendLink: {
    marginTop: "16px",
    fontSize: "13px",
    color: theme.palette.primary.main,
    cursor: "pointer",
    textDecoration: "none",
    fontWeight: 600,
    "&:hover": {
      textDecoration: "underline"
    }
  },
  timer: {
    fontSize: "12px",
    color: textMuted,
    marginTop: "8px"
  }
  });
});

const ValidateCode = () => {
  const classes = useStyles();
  const history = useHistory();
  const location = useLocation();
  const { colorMode } = useContext(ColorModeContext);
  const { appLogoLight, appLogoDark, appName } = colorMode || {};

  const params = new URLSearchParams(location.search);
  const email = params.get("email") || "";

  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef([]);

  const logo = appLogoDark || appLogoLight;

  useEffect(() => {
    if (!email) {
      history.push("/forgot-password");
    }
  }, [email, history]);

  const handleChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(""));
      inputRefs.current[5]?.focus();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fullCode = code.join("");
    if (fullCode.length !== 6) {
      toast.error(i18n.t("validateCode.toasts.incomplete"));
      return;
    }

    setLoading(true);
    try {
      const { data } = await openApi.post("/auth/validate-code", {
        email,
        code: fullCode
      });
      toast.success(i18n.t("validateCode.toasts.success"));
      history.push(`/reset-password?token=${encodeURIComponent(data.resetToken)}`);
    } catch (err) {
      toast.error(i18n.t("validateCode.toasts.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    try {
      await openApi.post("/auth/forgot-password", { email, language: localStorage.getItem("language") || localStorage.getItem("i18nextLng") || "pt" });
      toast.success(i18n.t("validateCode.toasts.resent"));
    } catch {
      toast.error(i18n.t("validateCode.toasts.resentError"));
    }
  };

  return (
    <div className={classes.root}>
      <div className={classes.card}>
        <div className={classes.logoContainer}>
          {logo ? <img src={logo} alt={appName || "Logo"} className={classes.logoImage} /> : null}
        </div>

        <div className={classes.iconCircle}>✉️</div>

        <div className={classes.title}>{i18n.t("validateCode.title")}</div>
        <div className={classes.subtitle}>
          {i18n.t("validateCode.subtitle")}<br />
          <span className={classes.emailHighlight}>{email}</span>
        </div>

        <form onSubmit={handleSubmit} style={{ width: "100%" }}>
          <label className={classes.label}>{i18n.t("validateCode.label")}</label>
          <div className={classes.codeContainer}>
            {code.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                className={classes.codeInput}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={index === 0 ? handlePaste : undefined}
                autoFocus={index === 0}
              />
            ))}
          </div>

          <button className={classes.button} type="submit" disabled={loading}>
            {loading ? i18n.t("validateCode.submitting") : i18n.t("validateCode.submit")}
          </button>
        </form>

        <a className={classes.resendLink} onClick={handleResendCode}>
          {i18n.t("validateCode.resendPrompt")}
        </a>

        <a className={classes.backLink} onClick={() => history.push("/forgot-password")}>
          ← {i18n.t("validateCode.back")}
        </a>
      </div>
    </div>
  );
};

export default ValidateCode;
