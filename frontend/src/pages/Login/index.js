import React, { useState, useContext, useEffect, useRef } from "react";
import { useHistory } from "react-router-dom";
import Button from "@material-ui/core/Button";
import CssBaseline from "@material-ui/core/CssBaseline";
import TextField from "@material-ui/core/TextField";
import { makeStyles } from "@material-ui/core/styles";
import IconButton from "@material-ui/core/IconButton";
import Visibility from "@material-ui/icons/Visibility";
import VisibilityOff from "@material-ui/icons/VisibilityOff";
import InputAdornment from "@material-ui/core/InputAdornment";
import EmailOutlinedIcon from "@material-ui/icons/EmailOutlined";
import LockOutlinedIcon from "@material-ui/icons/LockOutlined";
import { Helmet } from "react-helmet";
import BRFlag from "../../assets/brazil.png";
import USFlag from "../../assets/unitedstates.png";
import ESFlag from "../../assets/esspain.png";

import AuthBrandPanel from "../../components/AuthBrandPanel";
import AuthTabs from "../../components/AuthTabs";
import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";
import ColorModeContext from "../../layout/themeContext";
import useSettings from "../../hooks/useSettings";
import { getBackendUrl } from "../../config";

const languageOptions = [
  { value: "pt", label: "BR", icon: BRFlag },
  { value: "en", label: "EN", icon: USFlag },
  { value: "es", label: "ES", icon: ESFlag },
];

const useStyles = makeStyles((theme) => ({
  root: {
    width: "100vw",
    minHeight: "100vh",
    display: "flex",
    overflow: "hidden",
    backgroundColor: "#eef2fb",
    [theme.breakpoints.down("sm")]: {
      flexDirection: "column",
    },
  },

  // ===== LEFT - DARK PANEL =====
  leftSide: {
    flex: "1 1 55%",
    position: "relative",
    background:
      "radial-gradient(1200px 600px at -10% 110%, rgba(34,197,94,0.18), transparent 60%), linear-gradient(135deg, #061b4a 0%, #082466 45%, #0b2f86 100%)",
    color: "#fff",
    padding: "64px 72px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    overflow: "hidden",
    [theme.breakpoints.down("md")]: { padding: "48px 40px" },
    [theme.breakpoints.down("sm")]: { display: "none" },
  },
  // Decorative blobs
  blobTop: {
    position: "absolute",
    top: -120,
    left: -120,
    width: 360,
    height: 360,
    borderRadius: "50%",
    background:
      "radial-gradient(closest-side, rgba(59,130,246,0.35), transparent 70%)",
    filter: "blur(10px)",
  },
  dotsGrid: {
    position: "absolute",
    top: 90,
    right: 80,
    width: 180,
    height: 120,
    backgroundImage:
      "radial-gradient(rgba(255,255,255,0.18) 1.5px, transparent 1.5px)",
    backgroundSize: "14px 14px",
    opacity: 0.7,
  },
  wave: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    background:
      "radial-gradient(800px 200px at 20% 100%, rgba(34,197,94,0.25), transparent 60%)",
    pointerEvents: "none",
  },

  brandRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 30,
    fontWeight: 800,
    position: "relative",
    zIndex: 2,
  },
  brandLogo: {
    maxHeight: 44,
    maxWidth: 220,
    objectFit: "contain",
  },

  heroBlock: { position: "relative", zIndex: 2, marginTop: 40 },
  heroTitle: {
    fontSize: 44,
    fontWeight: 800,
    lineHeight: 1.15,
    margin: 0,
    letterSpacing: "-0.02em",
  },
  accentGreen: { color: "#22c55e" },
  heroDesc: {
    marginTop: 22,
    fontSize: 16,
    lineHeight: 1.7,
    color: "rgba(255,255,255,0.78)",
    maxWidth: 480,
  },

  featuresRow: {
    position: "relative",
    zIndex: 2,
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 18,
    marginTop: 40,
    maxWidth: 560,
  },
  featureItem: { display: "flex", flexDirection: "column", gap: 8 },
  featureIconBox: {
    width: 58,
    height: 58,
    borderRadius: 12,
    background: "rgba(59,130,246,0.18)",
    border: "1px solid rgba(59,130,246,0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#22c55e",
  },
  featureTitle: { fontSize: 14, fontWeight: 700, color: "#fff" },
  featureDesc: {
    fontSize: 12,
    color: "rgba(255,255,255,0.65)",
    lineHeight: 1.4,
  },

  ctaCard: {
    position: "relative",
    zIndex: 2,
    marginTop: 36,
    background: "rgba(8,30,90,0.55)",
    border: "1px solid rgba(99,140,255,0.35)",
    borderRadius: 14,
    padding: "18px 22px",
    maxWidth: 420,
    display: "flex",
    alignItems: "center",
    gap: 14,
  },
  ctaIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: "rgba(59,130,246,0.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#60a5fa",
    flexShrink: 0,
  },
  ctaText: { fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 1.5 },
  ctaStrong: { color: "#fff", fontWeight: 700 },

  // ===== RIGHT - FORM =====
  rightSide: {
    flex: "1 1 45%",
    minWidth: 420,
    background: "linear-gradient(135deg, #f3f6fc 0%, #e9eefb 100%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px 56px",
    position: "relative",
    [theme.breakpoints.down("sm")]: {
      minWidth: "unset",
      width: "100%",
      padding: "40px 24px",
    },
  },
  langSelector: {
    position: "absolute",
    top: 28,
    right: 32,
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    background: "#fff",
    border: "1px solid rgba(15,23,42,0.08)",
    borderRadius: 10,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 600,
    color: "#1a1f2e",
    boxShadow: "0 2px 6px rgba(15,23,42,0.05)",
    zIndex: 10,
  },
  langDropdown: {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: 0,
    background: "#fff",
    boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
    borderRadius: 10,
    border: "1px solid rgba(15,23,42,0.08)",
    padding: 6,
    minWidth: 140,
    zIndex: 100,
  },
  langOption: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "8px 10px",
    border: "none",
    background: "none",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    color: "#1a1f2e",
    cursor: "pointer",
    textAlign: "left",
    "&:hover": { background: "rgba(15,23,42,0.05)" },
  },
  flagIcon: { width: 20, height: 14, borderRadius: 2, objectFit: "cover" },

  formEntra: {
    // Direcao da entrada segue a posicao da aba: Entrar fica a esquerda,
    // entao o cartao chega pela esquerda. E o mesmo efeito do
    // AnimatePresence do layout de referencia, que anima por `x` com sinal
    // dependente do modo — aqui em keyframe, porque nao ha framer-motion.
    animation: "$deslizarEsquerda 340ms cubic-bezier(0.22, 1, 0.36, 1)",
  },
  "@keyframes deslizarEsquerda": {
    from: { opacity: 0, transform: "translateX(-28px)" },
    to: { opacity: 1, transform: "translateX(0)" },
  },
  tabsWrapper: {
    width: "100%",
    marginBottom: 22,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    background: "#fff",
    borderRadius: 20,
    padding: "44px 40px",
    boxShadow:
      "0 10px 40px rgba(15,23,42,0.08), inset 0 0 0 1px rgba(15,23,42,0.04)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  cardLogo: {
    maxHeight: 88,
    maxWidth: 300,
    marginBottom: 20,
    objectFit: "contain",
  },
  welcome: {
    fontSize: 22,
    fontWeight: 800,
    color: "#0f172a",
    margin: 0,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 6,
    marginBottom: 22,
    textAlign: "center",
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: "#0f172a",
    marginBottom: 6,
    display: "block",
    textAlign: "left",
    width: "100%",
  },
  textField: {
    marginBottom: 14,
    "& .MuiOutlinedInput-root": {
      borderRadius: 10,
      fontSize: 14,
      backgroundColor: "#f8fafc",
      "& fieldset": { borderColor: "rgba(15,23,42,0.10)" },
      "&:hover fieldset": { borderColor: "rgba(15,23,42,0.25)" },
      "&.Mui-focused fieldset": {
        borderColor: theme.palette.primary.main,
        borderWidth: 1.5,
      },
    },
    "& .MuiInputBase-input": { color: "#0f172a" },
    "& .MuiInputBase-input::placeholder": { color: "#94a3b8", opacity: 1 },
  },
  inputAdornmentIcon: { color: "#94a3b8" },
  forgotRow: {
    width: "100%",
    display: "flex",
    justifyContent: "center",
    marginBottom: 14,
  },
  forgotLink: {
    fontSize: 13,
    color: "#2563eb",
    cursor: "pointer",
    fontWeight: 600,
    "&:hover": { textDecoration: "underline" },
  },
  submitButton: {
    width: "100%",
    padding: "13px 0",
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 700,
    textTransform: "none",
    color: "#fff",
    background: "linear-gradient(135deg, #2f4cff 0%, #1e3ae0 100%)",
    boxShadow: "0 8px 24px rgba(47,76,255,0.35)",
    border: "none",
    cursor: "pointer",
    transition: "all 0.2s ease",
    "&:hover": {
      background: "linear-gradient(135deg, #3a57ff 0%, #2545ee 100%)",
      transform: "translateY(-1px)",
      boxShadow: "0 10px 28px rgba(47,76,255,0.45)",
    },
  },
  signupTab: {
    marginTop: 16,
    fontSize: 13,
    color: "#64748b",
  },
  signupLink: {
    color: "#2563eb",
    fontWeight: 700,
    cursor: "pointer",
    marginLeft: 4,
    "&:hover": { textDecoration: "underline" },
  },
  secureNote: {
    marginTop: 18,
    fontSize: 12,
    color: "#94a3b8",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    gap: 6,
  },
  copyright: {
    marginTop: 24,
    fontSize: 12,
    color: "#94a3b8",
    textAlign: "center",
  },
}));

const Login = () => {
  const classes = useStyles();
  const history = useHistory();
  const { colorMode } = useContext(ColorModeContext);
  const { appLogoFavicon, appName, appLogoDark, appLogoLight } = colorMode;
  const [user, setUser] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [allowSignup, setAllowSignup] = useState(false);
  const [googleLoginEnabled, setGoogleLoginEnabled] = useState(false);
  const [loginBackground, setLoginBackground] = useState(
    localStorage.getItem("wl_loginBg") || ""
  );
  const { getPublicSetting } = useSettings();
  const { handleLogin, handleGoogleSession } = useContext(AuthContext);

  // Google OAuth handoff: one-time code passed in URL by backend callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleCode = params.get("googleCode");
    const googleError = params.get("googleError");
    if (googleError) {
      // eslint-disable-next-line no-undef
      import("react-toastify").then(({ toast }) =>
        toast.error("Google: " + decodeURIComponent(googleError))
      );
      window.history.replaceState({}, "", "/login");
      return;
    }
    if (!googleCode) return;
    (async () => {
      try {
        const api = (await import("../../services/api")).default;
        const { data } = await api.post("/auth/google/exchange", {
          code: googleCode,
        });
        window.history.replaceState({}, "", "/login");
        if (data.action === "login") {
          await handleGoogleSession({ token: data.token, user: data.user });
        } else if (data.action === "needs_signup") {
          history.push(
            `/signup?email=${encodeURIComponent(data.email)}&name=${encodeURIComponent(
              data.name || ""
            )}`
          );
        }
      } catch (err) {
        const { toast } = await import("react-toastify");
        toast.error("Falha ao concluir login com Google.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [langOpen, setLangOpen] = useState(false);
  const [enabledLanguages, setEnabledLanguages] = useState(["pt", "en"]);
  const langRef = useRef();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (langRef.current && !langRef.current.contains(e.target)) {
        setLangOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getCompanyIdFromUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const companyId = urlParams.get("companyId");
    return companyId ? parseInt(companyId) : null;
  };

  useEffect(() => {
    const companyId = getCompanyIdFromUrl();
    getPublicSetting("userCreation", companyId)
      .then((data) => setAllowSignup(data === "enabled"))
      .catch(() => {});
    getPublicSetting("googleLogin", companyId)
      .then((data) => setGoogleLoginEnabled(data === "enabled"))
      .catch(() => {});
    getPublicSetting("enabledLanguages", companyId)
      .then((langs) => {
        let arr = ["pt", "en"];
        try {
          if (langs) arr = JSON.parse(langs).map((l) => (l === "pt-BR" ? "pt" : l));
        } catch {}
        setEnabledLanguages(arr);
      })
      .catch(() => setEnabledLanguages(["pt", "en"]));
    const bgKey =
      (localStorage.getItem("preferredTheme") || "light") === "dark"
        ? "appLogoBackgroundDark"
        : "appLogoBackgroundLight";
    getPublicSetting(bgKey, companyId)
      .then((data) => {
        if (data) {
          const url = getBackendUrl() + "/public/" + data;
          setLoginBackground(url);
          try { localStorage.setItem("wl_loginBg", url); } catch {}
        } else {
          // fallback para a outra variante caso só uma esteja configurada
          const altKey =
            bgKey === "appLogoBackgroundLight"
              ? "appLogoBackgroundDark"
              : "appLogoBackgroundLight";
          getPublicSetting(altKey, companyId)
            .then((alt) => {
              if (alt) {
                const url = getBackendUrl() + "/public/" + alt;
                setLoginBackground(url);
                try { localStorage.setItem("wl_loginBg", url); } catch {}
              } else {
                setLoginBackground("");
                try { localStorage.removeItem("wl_loginBg"); } catch {}
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  const handleChangeInput = (e) =>
    setUser({ ...user, [e.target.name]: e.target.value });

  const handlSubmit = (e) => {
    e.preventDefault();
    handleLogin(user);
  };

  const currentLang =
    languageOptions.find((o) => o.value === i18n.language) || languageOptions[0];
  const availableLanguages = languageOptions.filter((l) =>
    enabledLanguages.includes(l.value)
  );

  const handleSelectLang = (opt) => {
    i18n.changeLanguage(opt.value);
    localStorage.setItem("language", opt.value);
    setLangOpen(false);
    window.location.reload();
  };

  const displayLogo = appLogoLight || appLogoDark;

  return (
    <>
      <Helmet>
        <title>{`${appName || "Equipechat"} - ${i18n.t("login.title")}`}</title>
        <link rel="icon" href={appLogoFavicon || "/default-favicon.ico"} />
      </Helmet>

      {/* Layout unificado: o tema do login NÃO muda quando o fundo whitelabel
          é habilitado/removido. O fundo (se houver) fica apenas como camada
          decorativa atrás do painel esquerdo, sem alterar cores/gradientes. */}
      <div className={classes.root}>
        <CssBaseline />

        {/* LEFT — painel de marca compartilhado com o Signup. Antes esta
            arte inteira (blobs, grade de pontos, onda, headline, features,
            cartao) estava duplicada nas duas telas. */}
        <AuthBrandPanel
          mode="login"
          appName={appName}
          logo={displayLogo}
          background={loginBackground}
        />

        {/* RIGHT */}
        <div className={classes.rightSide}>

          <div ref={langRef} style={{ position: "absolute", top: 28, right: 32, zIndex: 10 }}>
            <div className={classes.langSelector} onClick={() => setLangOpen((o) => !o)}>
              <img src={currentLang.icon} alt={currentLang.label} className={classes.flagIcon} />
              {currentLang.label}
              <span style={{ fontSize: 10, marginLeft: 2 }}>▼</span>
            </div>
            {langOpen && (
              <div className={classes.langDropdown}>
                {availableLanguages.map((opt) => (
                  <button
                    key={opt.value}
                    className={classes.langOption}
                    onClick={() => handleSelectLang(opt)}
                  >
                    <img src={opt.icon} alt={opt.label} className={classes.flagIcon} />
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={`${classes.card} ${classes.formEntra}`}>
            {displayLogo && (
              <img src={displayLogo} alt={appName || "Logo"} className={classes.cardLogo} />
            )}

            {/* Abas Entrar / Cadastre-se, iguais as do layout de referencia.
                Ficam entre o logo e o titulo, e so aparecem quando o cadastro
                esta liberado — com userCreation desativado nao ha para onde a
                segunda aba levar. */}
            {allowSignup && (
              <div className={classes.tabsWrapper}>
                <AuthTabs mode="login" allowSignup={allowSignup} />
              </div>
            )}

            <h2 className={classes.welcome}>
              {i18n.t("login.welcome") || "Bem-vindo de volta!"} 👋
            </h2>
            <div className={classes.subtitle}>
              {i18n.t("login.loginInstruction") ||
                "Entre com seus dados para acessar sua conta"}
            </div>

            <form noValidate onSubmit={handlSubmit} style={{ width: "100%" }}>
              <label className={classes.inputLabel}>
                {i18n.t("login.form.email") || "E-mail"}
              </label>
              <TextField
                variant="outlined"
                required
                fullWidth
                id="email"
                placeholder={i18n.t("login.form.emailPlaceholder") || "Digite seu e-mail"}
                name="email"
                value={user.email}
                onChange={handleChangeInput}
                autoComplete="email"
                autoFocus
                size="small"
                className={classes.textField}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EmailOutlinedIcon className={classes.inputAdornmentIcon} fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />

              <label className={classes.inputLabel}>
                {i18n.t("login.form.password") || "Senha"}
              </label>
              <TextField
                variant="outlined"
                required
                fullWidth
                name="password"
                placeholder={i18n.t("login.form.passwordPlaceholder") || "Digite sua senha"}
                type={showPassword ? "text" : "password"}
                id="password"
                value={user.password}
                onChange={handleChangeInput}
                autoComplete="current-password"
                size="small"
                className={classes.textField}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockOutlinedIcon className={classes.inputAdornmentIcon} fontSize="small" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword((s) => !s)}
                        edge="end"
                        size="small"
                        style={{ color: "#94a3b8" }}
                      >
                        {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <div className={classes.forgotRow}>
                <span
                  className={classes.forgotLink}
                  onClick={() => history.push("/forgot-password")}
                >
                  {i18n.t("login.forgotPassword") || "Esqueceu sua senha?"}
                </span>
              </div>

              <Button type="submit" fullWidth className={classes.submitButton}>
                {i18n.t("login.buttons.submit") || "Entrar"}
              </Button>

              {googleLoginEnabled && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 14px" }}>
                    <div style={{ flex: 1, height: 1, background: "rgba(15,23,42,0.10)" }} />
                    <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>
                      {i18n.t("login.or")}
                    </span>
                    <div style={{ flex: 1, height: 1, background: "rgba(15,23,42,0.10)" }} />
                  </div>

                  <Button
                    type="button"
                    fullWidth
                    onClick={() => {
                      window.location.href = `${getBackendUrl()}/auth/google`;
                    }}
                    style={{
                      padding: "12px 0",
                      borderRadius: 10,
                      fontSize: 14,
                      fontWeight: 600,
                      textTransform: "none",
                      color: "#0f172a",
                      background: "#fff",
                      border: "1px solid rgba(15,23,42,0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
                      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.2c-2 1.4-4.5 2.4-7.3 2.4-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.6 39.7 16.2 44 24 44z"/>
                      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.6l6.2 5.2C41 35.9 44 30.4 44 24c0-1.3-.1-2.3-.4-3.5z"/>
                    </svg>
                    {i18n.t("login.buttons.google")}
                  </Button>
                </>
              )}
            </form>


            {allowSignup && (
              <div className={classes.signupTab}>
                {i18n.t("login.noAccount") || "Não tem uma conta?"}
                {/* Usa `authTabs.signup` (so "Cadastre-se") e nao
                    `login.buttons.register`, que ja contem a frase inteira
                    "Nao tem uma conta? Cadastre-se!" — somada ao
                    `login.noAccount` acima, saia duplicada na tela. */}
                <span className={classes.signupLink} onClick={() => history.push("/signup")}>
                  {i18n.t("authTabs.signup")}
                </span>
              </div>
            )}

            <div className={classes.secureNote}>
              🔒 {i18n.t("login.secureNote") || "Seus dados estão protegidos com criptografia de ponta a ponta."}
            </div>
          </div>

          <div className={classes.copyright}>
            © {new Date().getFullYear()} {appName || "EquipeChat"}. {i18n.t("login.footer") || "Todos os direitos reservados."}
          </div>
        </div>
      </div>
    </>
  );
};

export default Login;
