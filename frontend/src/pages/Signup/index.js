import React, { useState, useEffect, useContext, useRef } from "react";
import qs from "query-string";
import * as Yup from "yup";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { Formik, Form, Field } from "formik";

import Button from "@material-ui/core/Button";
import CssBaseline from "@material-ui/core/CssBaseline";
import TextField from "@material-ui/core/TextField";
import Typography from "@material-ui/core/Typography";
import { makeStyles } from "@material-ui/core/styles";
import Grid from "@material-ui/core/Grid";
import CircularProgress from "@material-ui/core/CircularProgress";

import { Helmet } from "react-helmet";

import { openApi } from "../../services/api";
import { formatCurrency, setCompanyCurrency } from "../../helpers/currencyHelper";
import toastError from "../../errors/toastError";
import useSettings from "../../hooks/useSettings";
import usePlans from "../../hooks/usePlans";
import ColorModeContext from "../../layout/themeContext";
import { getBackendUrl } from "../../config";
import AuthBrandPanel from "../../components/AuthBrandPanel";
import AuthTabs from "../../components/AuthTabs";
import { i18n } from "../../translate/i18n";
import BRFlag from "../../assets/brazil.png";
import USFlag from "../../assets/unitedstates.png";
import ESFlag from "../../assets/esspain.png";

const languageOptions = [
    { value: "pt", label: "BR", icon: BRFlag },
    { value: "en", label: "EN", icon: USFlag },
    { value: "es", label: "ES", icon: ESFlag },
];

const useStyles = makeStyles((theme) => {
  const isLight = theme.palette.type === "light";
  const surface = isLight ? "rgba(255,255,255,0.85)" : "rgba(10, 12, 18, 0.55)";
  const border = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)";
  const textPrimary = isLight ? "#1a1a1a" : "#ffffff";
  const textMuted = isLight ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";
  const textSubtle = isLight ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.45)";
  const inputBg = isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.08)";
  const inputBorder = isLight ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.18)";
  const inputBorderHover = isLight ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.35)";
  const tabsBg = isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)";
  const tabsBorder = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.07)";
  const tabActiveBg = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.12)";
  return ({
    root: {
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "row",
        overflow: "hidden",
        position: "relative",
        backgroundColor: isLight ? "#fafafa" : "#0a0a0a",
    },

    bannerSide: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        overflow: "hidden",
        [theme.breakpoints.down("sm")]: {
            display: "block",
        },
    },

    bannerImage: {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: "center",
    },

    bannerFallback: {
        width: "100%",
        height: "100%",
        position: "relative",
        background:
          "radial-gradient(1200px 600px at -10% 110%, rgba(34,197,94,0.18), transparent 60%), linear-gradient(135deg, #061b4a 0%, #082466 45%, #0b2f86 100%)",
        color: "#fff",
        padding: "64px 72px",
        paddingRight: 540, // reserva o espaço do formulário (480 + margens)
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        overflow: "hidden",
        boxSizing: "border-box",
        [theme.breakpoints.down("md")]: { padding: "48px 40px", paddingRight: 520 },
        [theme.breakpoints.down("sm")]: { display: "none" },
    },
    fbBlob: {
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
    fbDots: {
        position: "absolute",
        top: 90,
        left: 80,
        width: 180,
        height: 120,
        backgroundImage:
          "radial-gradient(rgba(255,255,255,0.18) 1.5px, transparent 1.5px)",
        backgroundSize: "14px 14px",
        opacity: 0.7,
    },
    fbWave: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 200,
        background:
          "radial-gradient(800px 200px at 20% 100%, rgba(34,197,94,0.25), transparent 60%)",
        pointerEvents: "none",
    },
    fbBrand: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 30,
        fontWeight: 800,
        position: "relative",
        zIndex: 2,
    },
    fbBrandLogo: { maxHeight: 84, maxWidth: 340, objectFit: "contain" },
    fbHero: { position: "relative", zIndex: 2, marginTop: 40 },
    fbHeroTitle: {
        fontSize: 44,
        fontWeight: 800,
        lineHeight: 1.15,
        margin: 0,
        letterSpacing: "-0.02em",
    },
    fbAccent: { color: "#22c55e" },
    fbHeroDesc: {
        marginTop: 22,
        fontSize: 16,
        lineHeight: 1.7,
        color: "rgba(255,255,255,0.78)",
        maxWidth: 480,
    },
    fbFeatures: {
        position: "relative",
        zIndex: 2,
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 18,
        marginTop: 40,
        maxWidth: 520,
    },
    fbFeatureItem: { display: "flex", flexDirection: "column", gap: 8 },
    fbFeatureIcon: {
        width: 48,
        height: 48,
        borderRadius: 12,
        background: "rgba(59,130,246,0.18)",
        border: "1px solid rgba(59,130,246,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#22c55e",
        fontSize: 22,
    },
    fbFeatureTitle: { fontSize: 14, fontWeight: 700, color: "#fff" },
    fbFeatureDesc: {
        fontSize: 12,
        color: "rgba(255,255,255,0.65)",
        lineHeight: 1.4,
    },
    fbCta: {
        position: "relative",
        zIndex: 2,
        marginTop: 36,
        background: "rgba(8,30,90,0.55)",
        border: "1px solid rgba(99,140,255,0.35)",
        borderRadius: 14,
        padding: "18px 22px",
        maxWidth: 460,
        display: "flex",
        alignItems: "center",
        gap: 14,
    },
    fbCtaIcon: {
        width: 32,
        height: 32,
        borderRadius: 8,
        background: "rgba(34,197,94,0.25)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#22c55e",
        flexShrink: 0,
        fontSize: 18,
        fontWeight: 800,
    },
    fbCtaText: { fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 1.5 },
    fbCtaStrong: { color: "#fff", fontWeight: 700 },

    /*
     * Estrutura igual a do Login.
     *
     * Antes o `formSide` era ELE PROPRIO o cartao: um painel de 480px fixos,
     * `position: absolute`, colado na direita, ocupando a altura inteira e
     * com o canto arredondado so de um lado. Por isso as duas telas nunca
     * casavam — no Login o cartao flutua centralizado, aqui ele era uma
     * coluna grudada na borda.
     *
     * Agora `formSide` e so a coluna que centraliza (equivale ao `rightSide`
     * do Login) e o cartao de verdade e o `card` abaixo, com o mesmo
     * maxWidth 460, raio 20 e sombra do Login.
     */
    formSide: {
        flex: "1 1 45%",
        minWidth: 420,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 56px",
        position: "relative",
        boxSizing: "border-box",
        overflowY: "auto",
        [theme.breakpoints.down("sm")]: {
            minWidth: "unset",
            width: "100%",
            padding: "32px 20px",
        },
    },

    card: {
        width: "100%",
        maxWidth: 460,
        background: surface,
        borderRadius: 20,
        padding: "44px 40px",
        boxShadow: isLight
            ? "0 10px 40px rgba(15,23,42,0.08), inset 0 0 0 1px rgba(15,23,42,0.04)"
            : "0 10px 40px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.08)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        boxSizing: "border-box",
        [theme.breakpoints.down("sm")]: {
            padding: "32px 24px",
        },
    },

    langSelector: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        cursor: "pointer",
        background: "transparent",
        border: `1px solid ${border}`,
        borderRadius: "8px",
        padding: "6px 10px",
        fontSize: "13px",
        fontWeight: 600,
        color: textPrimary,
        "&:hover": {
            borderColor: inputBorderHover,
        },
    },

    langDropdown: {
        position: "absolute",
        top: "100%",
        right: 0,
        marginTop: "6px",
        background: isLight ? "#ffffff" : "#1e2130",
        boxShadow: isLight ? "0 8px 24px rgba(0,0,0,0.15)" : "0 8px 24px rgba(0,0,0,0.5)",
        borderRadius: "10px",
        border: `1px solid ${border}`,
        padding: "6px",
        zIndex: 100,
        minWidth: "130px",
    },

    langOption: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        width: "100%",
        padding: "7px 10px",
        border: "none",
        background: "none",
        borderRadius: "6px",
        fontSize: "13px",
        fontWeight: 500,
        color: textPrimary,
        cursor: "pointer",
        textAlign: "left",
        "&:hover": {
            background: tabsBg,
        },
    },

    flagIcon: {
        width: 18,
        height: 13,
        borderRadius: 2,
        objectFit: "cover",
    },

    logoImg: {
        maxWidth: "300px",
        maxHeight: "88px",
        display: "block",
        marginBottom: "20px",
        objectFit: "contain",
    },

    formEntra: {
        // Cadastre-se e a aba da direita: o cartao entra pela direita.
        animation: "$deslizarDireita 340ms cubic-bezier(0.22, 1, 0.36, 1)",
    },
    "@keyframes deslizarDireita": {
        from: { opacity: 0, transform: "translateX(28px)" },
        to: { opacity: 1, transform: "translateX(0)" },
    },
    stepEnter: {
        width: "100%",
        // O exemplo troca as etapas com AnimatePresence animando `x`. Sem
        // framer-motion aqui, o mesmo efeito sai de um keyframe com `key` na
        // etapa: cada troca remonta o bloco e a animacao roda de novo.
        animation: "$deslizarEtapa 300ms cubic-bezier(0.22, 1, 0.36, 1)",
    },
    "@keyframes deslizarEtapa": {
        from: { opacity: 0, transform: "translateX(24px)" },
        to: { opacity: 1, transform: "translateX(0)" },
    },
    backButton: {
        flex: 1,
        borderRadius: 8,
        textTransform: "none",
        fontSize: 14,
        fontWeight: 600,
        padding: "10px 16px",
        color: "#475569",
        backgroundColor: "#f1f5f9",
        border: "1px solid transparent",
        "&:hover": { backgroundColor: "#e2e8f0" },
    },
    /*
     * Só o espaçamento. O fundo, a borda e o padding saíram daqui.
     *
     * Este wrapper foi escrito quando ELE era a trilha das abas, com dois
     * <button> soltos dentro. Depois passou a envolver o <AuthTabs>, que traz
     * a própria trilha — ficou trilha dentro de trilha.
     *
     * E como o wrapper era `display: flex`, o AuthTabs virava um item flex e
     * encolhia para a largura do conteúdo, em vez de ocupar a linha toda. O
     * espaço sobrando à direita era o fundo cinza do wrapper aparecendo.
     */
    tabsWrapper: {
        width: "100%",
        marginBottom: "16px",
    },

    tab: {
        flex: 1,
        padding: "8px 0",
        border: "none",
        background: "transparent",
        borderRadius: "8px",
        fontSize: "14px",
        fontWeight: 500,
        cursor: "pointer",
        color: textMuted,
        transition: "all 0.2s ease",
    },

    tabActive: {
        background: tabActiveBg,
        color: textPrimary,
        fontWeight: 700,
        boxShadow: isLight ? "0 1px 4px rgba(0,0,0,0.08)" : "0 1px 4px rgba(0,0,0,0.3)",
    },

    // Centralizados, como no Login. O cartao inteiro e centrado (logo, abas,
    // botoes), e so o titulo e o subtitulo ficavam encostados a esquerda.
    sectionTitle: {
        fontSize: "18px",
        fontWeight: 700,
        color: textPrimary,
        marginBottom: "4px",
        textAlign: "center",
        width: "100%",
    },

    subtitle: {
        fontSize: "13px",
        color: textMuted,
        marginBottom: "16px",
        textAlign: "center",
        width: "100%",
        // A verificacao de e-mail quebra em duas linhas por causa do endereco;
        // sem isso a segunda linha fica colada na primeira.
        lineHeight: 1.5,
    },

    planCard: {
        border: `2px solid ${border}`,
        borderRadius: "12px",
        padding: "14px 16px",
        marginBottom: "16px",
        width: "100%",
        boxSizing: "border-box",
        cursor: "pointer",
        transition: "all 0.2s ease",
        "&:hover": {
            borderColor: theme.palette.primary.main,
        },
    },

    planCardSelected: {
        borderColor: theme.palette.primary.main,
        backgroundColor: `${theme.palette.primary.main}18`,
    },

    planName: {
        fontSize: "15px",
        fontWeight: 700,
        color: textPrimary,
    },

    planPrice: {
        fontSize: "15px",
        fontWeight: 700,
        color: textPrimary,
    },

    planBadge: {
        display: "inline-block",
        fontSize: "11px",
        fontWeight: 600,
        color: theme.palette.primary.main,
        marginBottom: "6px",
    },

    planChip: {
        display: "inline-block",
        background: tabActiveBg,
        borderRadius: "4px",
        padding: "2px 7px",
        fontSize: "11px",
        color: textPrimary,
        marginRight: "4px",
        marginBottom: "4px",
    },

    planMeta: {
        fontSize: "11px",
        color: textMuted,
        marginTop: "6px",
    },

    submitButton: {
        width: "100%",
        padding: "12px 0",
        borderRadius: "8px",
        fontSize: "15px",
        fontWeight: 700,
        textTransform: "none",
        color: "#fff !important",
        background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark || theme.palette.primary.main})`,
        boxShadow: `0 4px 14px ${theme.palette.primary.main}55`,
        border: "none",
        marginTop: "8px",
        cursor: "pointer",
        transition: "all 0.2s ease",
        "&:hover": {
            opacity: 0.92,
            transform: "translateY(-1px)",
        },
    },

    loginLink: {
        marginTop: "16px",
        fontSize: "13px",
        color: textMuted,
        textAlign: "center",
        "& a": {
            color: theme.palette.primary.main,
            fontWeight: 600,
            textDecoration: "none",
            "&:hover": {
                textDecoration: "underline",
            },
        },
    },

    footer: {
        marginTop: "20px",
        textAlign: "center",
        fontSize: "11px",
        color: textSubtle,
    },

    textField: {
        marginBottom: "10px",
        "& .MuiOutlinedInput-root": {
            borderRadius: "8px",
            fontSize: "13px",
            backgroundColor: inputBg,
            color: textPrimary,
            "& fieldset": { borderColor: inputBorder },
            "&:hover fieldset": { borderColor: inputBorderHover },
            "&.Mui-focused fieldset": {
                borderColor: theme.palette.primary.main,
                borderWidth: "1.5px",
            },
        },
        "& .MuiInputLabel-outlined": { fontSize: "13px", color: textMuted },
        "& .MuiInputLabel-outlined.Mui-focused": { color: theme.palette.primary.main },
        "& .MuiInputBase-input": { color: textPrimary },
        "& .MuiInputBase-input::placeholder": {
            color: textSubtle,
            opacity: 1,
        },
    },
  });
});

const UserSchema = Yup.object().shape({
    name: Yup.string()
        .min(2, i18n.t("signup.validation.nameMin"))
        .max(50, i18n.t("signup.validation.nameMax"))
        .required(i18n.t("signup.validation.required")),
    companyName: Yup.string()
        .min(2, i18n.t("signup.validation.companyMin"))
        .max(50, i18n.t("signup.validation.companyMax"))
        .required(i18n.t("signup.validation.required")),
    document: Yup.string().notRequired(),
    password: Yup.string()
        .min(5, i18n.t("signup.validation.passwordMin"))
        .max(50, i18n.t("signup.validation.passwordMax")),
    email: Yup.string()
        .email(i18n.t("signup.validation.invalidEmail"))
        .required(i18n.t("signup.validation.required")),
});

// Etapa 1: escolha de plano; Etapa 2: dados da empresa
const STEP_PLAN = "plan";
const STEP_FORM = "form";
const STEP_VERIFY = "verify";

const SignUp = () => {
    const classes = useStyles();
    const history = useHistory();
    const { colorMode } = useContext(ColorModeContext);
    const { appLogoFavicon, appName, appLogoDark, appLogoLight, mode } = colorMode;
    const { getPlanList } = usePlans();
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(false);
    const [validatingCnpj, setValidatingCnpj] = useState(false);
    const [lastValidatedDocument, setLastValidatedDocument] = useState("");
    const { getPublicSetting } = useSettings();
    const [bannerUrl, setBannerUrl] = useState("");
    const [googleLoginEnabled, setGoogleLoginEnabled] = useState(false);
    const [enabledLanguages, setEnabledLanguages] = useState(["pt", "en"]);
    const [langOpen, setLangOpen] = useState(false);
    // O primeiro cadastro NAO pede plano: a empresa entra em periodo de
    // teste e contrata depois, no Financeiro ou quando o teste vencer. O
    // backend resolve o plano de teste sozinho quando nenhum planId chega
    // (ver UserController.store). A etapa de plano continua no arquivo, mas
    // deixou de ser porta de entrada.
    const [step, setStep] = useState(STEP_FORM);
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [requireDocument, setRequireDocument] = useState(false);
    const [signupCurrency, setSignupCurrency] = useState("BRL");
    const langRef = useRef();

    let companyId = null;
    const params = qs.parse(window.location.search);
    if (params.companyId !== undefined) companyId = params.companyId;
    const googleSignupCode = params.googleCode || null;

    const initialState = {
        name: params.name || "",
        email: params.email || "",
        password: "",
        companyId, companyName: "", document: "", planId: "",
    };
    const [user] = useState(initialState);
    const [verificationCode, setVerificationCode] = useState(["", "", "", "", "", ""]);
    const [pendingValues, setPendingValues] = useState(null);
    const [sendingCode, setSendingCode] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [resendTimer, setResendTimer] = useState(0);

    // Fechar dropdown ao clicar fora
    useEffect(() => {
        const handler = (e) => {
            if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    useEffect(() => {
        getPublicSetting("userCreation")
            .then((data) => {
                if (data === "disabled") {
                    toast.error(i18n.t("signup.toasts.disabled"));
                    history.push("/login");
                }
            })
            .catch(() => {});

        getPublicSetting("requireDocument")
            .then((data) => setRequireDocument(data === "enabled"))
            .catch(() => {});

        getPublicSetting("googleLogin", companyId)
            .then((data) => setGoogleLoginEnabled(data === "enabled"))
            .catch(() => {});

        getPublicSetting("currency", companyId)
            .then((currency) => {
                const resolvedCurrency = currency || "BRL";
                setSignupCurrency(resolvedCurrency);
                setCompanyCurrency(resolvedCurrency);
            })
            .catch(() => {});

        getPublicSetting("enabledLanguages", companyId)
            .then((langs) => {
                let arr = ["pt", "en"];
                try { if (langs) arr = JSON.parse(langs).map(l => l === "pt-BR" ? "pt" : l); } catch {}
                setEnabledLanguages(arr);
            })
            .catch(() => {});

        const bgKey = mode === "light" ? "appLogoBackgroundLight" : "appLogoBackgroundDark";
        getPublicSetting(bgKey, companyId)
            .then((bg) => { if (bg) setBannerUrl(getBackendUrl() + "/public/" + bg); })
            .catch(() => {});
    }, [history, companyId]);

    useEffect(() => {
        setLoading(true);
        getPlanList({ listPublic: "false" })
            .then((list) => { setPlans(list); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    // Formatação de documento — se contém letras é documento estrangeiro, não formata
    const formatDocument = (value) => {
        if (/[a-zA-Z]/.test(value)) return value; // documento estrangeiro: aceita como digitado
        const n = value.replace(/\D/g, "");
        if (n.length <= 11) {
            if (n.length <= 3) return n;
            if (n.length <= 6) return `${n.slice(0, 3)}.${n.slice(3)}`;
            if (n.length <= 9) return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6)}`;
            return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9, 11)}`;
        }
        const m = n.slice(0, 14);
        if (m.length <= 2) return m;
        if (m.length <= 5) return `${m.slice(0, 2)}.${m.slice(2)}`;
        if (m.length <= 8) return `${m.slice(0, 2)}.${m.slice(2, 5)}.${m.slice(5)}`;
        if (m.length <= 12) return `${m.slice(0, 2)}.${m.slice(2, 5)}.${m.slice(5, 8)}/${m.slice(8)}`;
        return `${m.slice(0, 2)}.${m.slice(2, 5)}.${m.slice(5, 8)}/${m.slice(8, 12)}-${m.slice(12)}`;
    };

    const validateDocument = async (document, setFieldValue) => {
        // Campo opcional — se vazio, aceita sem validar
        if (!document || !document.trim()) return true;

        const clean = document.replace(/\D/g, "");

        // Documento estrangeiro (contém letras ou não tem 11/14 dígitos numéricos puros)
        const hasLetters = /[a-zA-Z]/.test(document.trim());
        const isForeign = hasLetters || (clean.length !== 11 && clean.length !== 14 && document.trim().length > 0);
        if (isForeign) {
            // Aceita qualquer documento estrangeiro sem validação adicional
            return true;
        }

        if (lastValidatedDocument === clean) return true;
        setLastValidatedDocument(clean);

        if (clean.length === 11) {
            toast.success(i18n.t("signup.document.cpfValid"));
            return true;
        }
        if (clean.length === 14) {
            setValidatingCnpj(true);
            try {
                const res = await openApi.post("/auth/validate-cnpj", { cnpj: clean });
                setValidatingCnpj(false);
                if (res.data.valid && res.data.data.nome) {
                    setFieldValue("companyName", res.data.data.nome);
                    toast.success(i18n.t("signup.document.cnpjValid"));
                    return true;
                }
                toast.error(i18n.t("signup.document.invalid"));
                return false;
            } catch {
                setValidatingCnpj(false);
                toast.error(i18n.t("signup.document.error"));
                return false;
            }
        }
        // Número com comprimento diferente de 11 ou 14 — aceita como documento estrangeiro
        return true;
    };

    const [signingUp, setSigningUp] = useState(false);

    const handleSignUp = async (values, actions) => {
        if (signingUp) return;

        // Fluxo Google: pular verificação por e-mail (já validada pelo Google)
        if (googleSignupCode) {
            setSigningUp(true);
            try {
                await openApi.post("/auth/signup", {
                    ...values,
                    googleSignupCode,
                    language: localStorage.getItem("language") || localStorage.getItem("i18nextLng") || "pt"
                });
                toast.success(i18n.t("signup.toasts.success"));
                history.push("/login");
            } catch (err) {
                toastError(err);
                setSigningUp(false);
            }
            if (actions) actions.setSubmitting(false);
            return;
        }

        setSendingCode(true);
        try {
            // Send verification code
            const { data } = await openApi.post("/auth/send-signup-code", { email: values.email, name: values.name, language: localStorage.getItem("language") || localStorage.getItem("i18nextLng") || "pt" });
            setPendingValues(values);
            setStep(STEP_VERIFY);
            setResendTimer(60);
            if (data?.smtpBypass && data?.code) {
                // SMTP não configurado: preenche o código automaticamente
                // e avisa o usuário para concluir o cadastro.
                const digits = String(data.code).padStart(6, "0").slice(0, 6).split("");
                setVerificationCode([digits[0] || "", digits[1] || "", digits[2] || "", digits[3] || "", digits[4] || "", digits[5] || ""]);
                toast.info(i18n.t("signup.toasts.smtpBypass") || "SMTP não configurado — código gerado automaticamente. Basta confirmar.");
            } else {
                toast.success(i18n.t("signup.toasts.codeSent") || "Código de verificação enviado para seu e-mail!");
            }
        } catch (err) {
            toastError(err);
        }
        setSendingCode(false);
        if (actions) actions.setSubmitting(false);
    };

    const handleVerifyAndSignUp = async () => {
        const code = verificationCode.join("");
        if (code.length !== 6) {
            toast.warning(i18n.t("signup.validation.codeLength"));
            return;
        }
        setVerifying(true);
        try {
            await openApi.post("/auth/validate-signup-code", { email: pendingValues.email, code });
            // Now proceed with actual signup
            setSigningUp(true);
            await openApi.post("/auth/signup", { ...pendingValues, language: localStorage.getItem("language") || localStorage.getItem("i18nextLng") || "pt" });
            toast.success(i18n.t("signup.toasts.success"));
            history.push("/login");
        } catch (err) {
            toastError(err);
            setVerifying(false);
        }
    };

    const handleCodeChange = (index, value) => {
        if (value.length > 1) {
            // Handle paste
            const chars = value.replace(/\D/g, "").split("").slice(0, 6);
            const newCode = [...verificationCode];
            chars.forEach((char, i) => {
                if (index + i < 6) newCode[index + i] = char;
            });
            setVerificationCode(newCode);
            const nextIndex = Math.min(index + chars.length, 5);
            document.getElementById(`signup-code-${nextIndex}`)?.focus();
            return;
        }
        const newCode = [...verificationCode];
        newCode[index] = value.replace(/\D/g, "");
        setVerificationCode(newCode);
        if (value && index < 5) {
            document.getElementById(`signup-code-${index + 1}`)?.focus();
        }
    };

    const handleCodeKeyDown = (index, e) => {
        if (e.key === "Backspace" && !verificationCode[index] && index > 0) {
            document.getElementById(`signup-code-${index - 1}`)?.focus();
        }
    };

    const handleResendCode = async () => {
        if (!pendingValues || resendTimer > 0) return;
        setSendingCode(true);
        try {
            const { data } = await openApi.post("/auth/send-signup-code", { email: pendingValues.email, name: pendingValues.name, language: localStorage.getItem("language") || localStorage.getItem("i18nextLng") || "pt" });
            setResendTimer(60);
            if (data?.smtpBypass && data?.code) {
                const digits = String(data.code).padStart(6, "0").slice(0, 6).split("");
                setVerificationCode([digits[0] || "", digits[1] || "", digits[2] || "", digits[3] || "", digits[4] || "", digits[5] || ""]);
                toast.info(i18n.t("signup.toasts.smtpBypass") || "SMTP não configurado — código gerado automaticamente. Basta confirmar.");
            } else {
                toast.success(i18n.t("signup.toasts.codeResent") || "Novo código enviado!");
            }
        } catch (err) {
            toastError(err);
        }
        setSendingCode(false);
    };

    // Countdown timer
    useEffect(() => {
        if (resendTimer <= 0) return;
        const interval = setInterval(() => {
            setResendTimer((prev) => prev - 1);
        }, 1000);
        return () => clearInterval(interval);
    }, [resendTimer]);

    const currentLang = languageOptions.find((o) => o.value === i18n.language) || languageOptions[0];

    const handleSelectLang = (opt) => {
        i18n.changeLanguage(opt.value);
        localStorage.setItem("language", opt.value);
        setLangOpen(false);
        window.location.reload();
    };

    const getPlanFeatures = (plan) => {
        const features = [];
        if (plan.useWhatsapp) features.push(i18n.t("signup.features.whatsapp"));
        if (plan.useFacebook) features.push(i18n.t("signup.features.facebook"));
        if (plan.useInstagram) features.push(i18n.t("signup.features.instagram"));
        if (plan.useCampaigns) features.push(i18n.t("signup.features.campaigns"));
        if (plan.useSchedules) features.push(i18n.t("signup.features.schedules"));
        if (plan.useInternalChat) features.push(i18n.t("signup.features.internalChat"));
        if (plan.useExternalApi) features.push(i18n.t("signup.features.externalApi"));
        if (plan.useIntegrations) features.push(i18n.t("signup.features.integrations"));
        if (plan.useOpenAi) features.push(i18n.t("signup.features.openAi"));
        if (plan.useKanban) features.push(i18n.t("signup.features.kanban"));
        if (plan.useN8n) features.push("n8n");
        return features;
    };

    return (
        <React.Fragment>
            <Helmet>
                <title>{`${appName || "Equipechat"} - ${i18n.t("signup.title")}`}</title>
                <link rel="icon" href={appLogoFavicon || "/default-favicon.ico"} />
            </Helmet>

            <div className={classes.root}>
                <CssBaseline />

                {/* BANNER — mesmo painel do Login. O conteudo (headline,
                    features, nota) muda pelo `mode`, que era exatamente a
                    diferenca entre as duas telas no layout de referencia. */}
                <AuthBrandPanel
                    mode="signup"
                    appName={appName}
                    logo={appLogoLight || appLogoDark}
                    background={bannerUrl}
                />

                {/* FORMULÁRIO */}
                <div className={`${classes.formSide} ${classes.formEntra}`}>

                    {/* Indicador de idioma (somente leitura) */}
                    <div style={{ position: "absolute", top: 20, right: 20, zIndex: 10 }}>
                        <div
                            className={classes.langSelector}
                            style={{ cursor: "default", pointerEvents: "none" }}
                        >
                            <img src={currentLang.icon} alt={currentLang.label} className={classes.flagIcon} />
                            {currentLang.label}
                        </div>
                    </div>

                    {/* Cartao: mesmo maxWidth, raio e sombra do Login. Fica
                        DENTRO da coluna, e nao no lugar dela — era essa a
                        diferenca estrutural entre as duas telas. */}
                    <div className={classes.card}>

                    {/* Logo - segue o tema (claro/escuro) */}
                    <img
                        className={classes.logoImg}
                        src={
                            mode === "light"
                                ? (appLogoLight || appLogoDark)
                                : (appLogoDark || appLogoLight)
                        }
                        alt={appName || "Logo"}
                    />

                    {/* Abas: mesmo componente do Login, para os dois lados
                        ficarem identicos. Antes eram dois <button> soltos aqui,
                        sem a pilula deslizante e com rotulos vindos de chaves
                        diferentes das do Login ("login.buttons.submit" era
                        "Login", nao "Entrar"). */}
                    <div className={classes.tabsWrapper}>
                        <AuthTabs mode="signup" />
                    </div>

                    {/* ETAPA 1 - Escolha de plano */}
                    {step === STEP_PLAN && (
                        <>
                            <Typography className={classes.sectionTitle}>{i18n.t("signup.plan.title") || "Escolha seu Plano"}</Typography>
                            <Typography className={classes.subtitle}>
                                {i18n.t("signup.plan.subtitle") || "Selecione o plano ideal para sua empresa"}
                            </Typography>

                            {loading ? (
                                <CircularProgress size={28} style={{ margin: "20px auto" }} />
                            ) : (
                                <div style={{ width: "100%", maxHeight: "340px", overflowY: "auto" }}>
                                    {plans.map((plan) => {
                                        const features = getPlanFeatures(plan);
                                        const isSelected = selectedPlan?.id === plan.id;
                                        return (
                                            <div
                                                key={plan.id}
                                                className={`${classes.planCard} ${isSelected ? classes.planCardSelected : ""}`}
                                                onClick={() => setSelectedPlan(plan)}
                                            >
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                                    <span className={classes.planName}>{plan.name}</span>
                                                    <span className={classes.planPrice}>
                                                        {formatCurrency(parseFloat(plan.amount || 0), signupCurrency)}/{i18n.t("signup.plan.period") || "mês"}
                                                    </span>
                                                </div>
                                                <div className={classes.planBadge}>{i18n.t("signup.plan.badge") || "Ideal para sua empresa"}</div>
                                                <div>
                                                    {features.map((f) => (
                                                        <span key={f} className={classes.planChip}>{f}</span>
                                                    ))}
                                                </div>
                                                <div className={classes.planMeta}>
                                                    {i18n.t("signup.plan.meta", { users: plan.users || "?", connections: plan.connections || "?" }) || `Até ${plan.users || "?"} usuários · Até ${plan.connections || "?"} conexões`}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            <Button
                                fullWidth
                                variant="contained"
                                color="primary"
                                className={classes.submitButton}
                                disabled={!selectedPlan}
                                onClick={() => setStep(STEP_FORM)}
                            >
                                {i18n.t("signup.actions.continue") || "Continuar"}
                            </Button>

                            <div className={classes.loginLink}>
                                {i18n.t("signup.actions.hasAccount") || "Já tem uma conta?"}{" "}
                                <a href="/login" onClick={(e) => { e.preventDefault(); history.push("/login"); }}>
                                    {i18n.t("signup.actions.enter") || "Entre!"}
                                </a>
                            </div>

                            {googleLoginEnabled && (
                              <>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 12px", width: "100%" }}>
                                  <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.12)" }} />
                                  <span style={{ fontSize: 12, color: "#8b949e", fontWeight: 600 }}>
                                    {i18n.t("login.or")}
                                  </span>
                                  <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.12)" }} />
                                </div>

                                <Button
                                  type="button"
                                  fullWidth
                                  onClick={() => {
                                    window.location.href = `${getBackendUrl()}/auth/google?mode=signup`;
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
                                  {i18n.t("signup.buttons.google")}
                                </Button>
                              </>
                            )}
                        </>
                    )}

                    {/* ETAPA 2 - Dados da empresa */}
                    {step === STEP_FORM && (
                        <div className={classes.stepEnter} key={STEP_FORM}>
                            <Typography className={classes.sectionTitle}>{i18n.t("signup.formStep.title") || "Criar sua conta"}</Typography>
                            <Typography className={classes.subtitle}>
                                {i18n.t("signup.formStep.subtitle") || "Preencha os dados da sua empresa"}
                            </Typography>

                            <Formik
                                initialValues={{ ...user, planId: selectedPlan?.id || "" }}
                                enableReinitialize
                                validationSchema={UserSchema}
                                onSubmit={async (values, actions) => {
                                    actions.setSubmitting(true);
                                    await handleSignUp(values, actions);
                                }}
                            >
                                {({ touched, errors, isSubmitting, setFieldValue, values }) => (
                                    <Form style={{ width: "100%" }}>
                                        <Grid container spacing={1}>
                                            <Grid item xs={12} sm={6}>
                                                <Field
                                                    as={TextField}
                                                    variant="outlined"
                                                    fullWidth
                                                    size="small"
                                                    label={i18n.t("signup.form.name") || "Nome"}
                                                    name="name"
                                                    className={classes.textField}
                                                    error={touched.name && Boolean(errors.name)}
                                                    helperText={touched.name && errors.name}
                                                />
                                            </Grid>
                                            <Grid item xs={12} sm={6}>
                                                <Field
                                                    as={TextField}
                                                    variant="outlined"
                                                    fullWidth
                                                    size="small"
                                                    label={i18n.t("signup.form.company") || "Empresa"}
                                                    name="companyName"
                                                    className={classes.textField}
                                                    error={touched.companyName && Boolean(errors.companyName)}
                                                    helperText={touched.companyName && errors.companyName}
                                                />
                                            </Grid>
                                            <Grid item xs={12} sm={6}>
                                                {requireDocument && (
                                                    <Field
                                                        as={TextField}
                                                        variant="outlined"
                                                        fullWidth
                                                        size="small"
                                                        label={i18n.t("signup.document.label")}
                                                        name="document"
                                                        className={classes.textField}
                                                        error={touched.document && Boolean(errors.document)}
                                                        helperText={touched.document && errors.document}
                                                        onChange={(e) => setFieldValue("document", formatDocument(e.target.value))}
                                                        onBlur={() => validateDocument(values.document, setFieldValue)}
                                                        InputProps={{
                                                            endAdornment: validatingCnpj && (
                                                                <CircularProgress size={16} />
                                                            ),
                                                        }}
                                                    />
                                                )}
                                            </Grid>
                                            <Grid item xs={12}>
                                                <Field
                                                    as={TextField}
                                                    variant="outlined"
                                                    fullWidth
                                                    size="small"
                                                    label={i18n.t("signup.form.email") || "E-mail"}
                                                    name="email"
                                                    className={classes.textField}
                                                    error={touched.email && Boolean(errors.email)}
                                                    helperText={touched.email && errors.email}
                                                />
                                            </Grid>
                                            <Grid item xs={12}>
                                                <Field
                                                    as={TextField}
                                                    variant="outlined"
                                                    fullWidth
                                                    size="small"
                                                    label={i18n.t("signup.form.password") || "Senha"}
                                                    type="password"
                                                    name="password"
                                                    className={classes.textField}
                                                    error={touched.password && Boolean(errors.password)}
                                                    helperText={touched.password && errors.password}
                                                />
                                            </Grid>
                                        </Grid>

                                        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                                            {/* Sem etapa de plano antes, "Voltar" leva ao login.
                                                As cores fixas de tema escuro que estavam aqui
                                                (#c9d1d9 sobre borda branca translucida) vinham de
                                                quando o cartao era escuro — em cartao claro o texto
                                                sumia. */}
                                            <Button
                                                variant="outlined"
                                                className={classes.backButton}
                                                onClick={() => history.push("/login")}
                                            >
                                                {i18n.t("signup.actions.back") || "Voltar"}
                                            </Button>
                                            <Button
                                                type="submit"
                                                variant="contained"
                                                color="primary"
                                                disabled={isSubmitting || signingUp}
                                                className={classes.submitButton}
                                                style={{ flex: 2 }}
                                            >
                                                {(isSubmitting || sendingCode) ? <CircularProgress size={20} color="inherit" /> : (i18n.t("signup.actions.continue") || "Continuar")}
                                            </Button>
                                        </div>
                                    </Form>
                                )}
                            </Formik>

                            {googleLoginEnabled && (
                              <>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 12px" }}>
                                  <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.12)" }} />
                                  <span style={{ fontSize: 12, color: "#8b949e", fontWeight: 600 }}>
                                    {i18n.t("login.or")}
                                  </span>
                                  <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.12)" }} />
                                </div>

                                <Button
                                  type="button"
                                  fullWidth
                                  onClick={() => {
                                    window.location.href = `${getBackendUrl()}/auth/google?mode=signup`;
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
                                  {i18n.t("signup.buttons.google")}
                                </Button>
                              </>
                            )}

                            <div className={classes.loginLink}>
                                {i18n.t("signup.actions.hasAccount") || "Já tem uma conta?"}{" "}
                                <a href="/login" onClick={(e) => { e.preventDefault(); history.push("/login"); }}>
                                    {i18n.t("signup.actions.enter") || "Entrar"}
                                </a>
                            </div>
                        </div>
                    )}

                    {/* ETAPA 3 - Verificação por código */}
                    {step === STEP_VERIFY && (
                        <div className={classes.stepEnter} key={STEP_VERIFY}>
                            <Typography className={classes.sectionTitle}>{i18n.t("signup.verify.title") || "Verificação de E-mail"}</Typography>
                            <Typography className={classes.subtitle}>
                                {i18n.t("signup.verify.subtitle") || "Digite o código de 6 dígitos enviado para"} <strong>{pendingValues?.email}</strong>
                            </Typography>

                            <div style={{ display: "flex", gap: 8, justifyContent: "center", margin: "24px 0" }}>
                                {verificationCode.map((digit, index) => (
                                    <input
                                        key={index}
                                        id={`signup-code-${index}`}
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={6}
                                        value={digit}
                                        onChange={(e) => handleCodeChange(index, e.target.value)}
                                        onKeyDown={(e) => handleCodeKeyDown(index, e)}
                                        style={{
                                            width: 48,
                                            height: 56,
                                            textAlign: "center",
                                            fontSize: 24,
                                            fontWeight: 700,
                                            borderRadius: 10,
                                            border: "1.5px solid rgba(0,0,0,0.2)",
                                            background: "#ffffff",
                                            color: "#0d1117",
                                            outline: "none",
                                            caretColor: "#0d1117",
                                        }}
                                        onFocus={(e) => { e.target.style.borderColor = "#3b82f6"; }}
                                        onBlur={(e) => { e.target.style.borderColor = "rgba(0,0,0,0.2)"; }}
                                    />
                                ))}
                            </div>

                            <Button
                                fullWidth
                                variant="contained"
                                color="primary"
                                className={classes.submitButton}
                                onClick={handleVerifyAndSignUp}
                                disabled={verifying || verificationCode.join("").length !== 6}
                            >
                                {verifying ? <CircularProgress size={20} color="inherit" /> : (i18n.t("signup.verify.confirm") || "Verificar e Criar Conta")}
                            </Button>

                            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "center" }}>
                                <Button
                                    variant="text"
                                    size="small"
                                    style={{ color: "#8b949e", textTransform: "none" }}
                                    onClick={handleResendCode}
                                    disabled={sendingCode || resendTimer > 0}
                                >
                                    {sendingCode ? (i18n.t("signup.verify.sending") || "Enviando...") : resendTimer > 0 ? `${i18n.t("signup.verify.resendIn") || "Reenviar em"} ${resendTimer}s` : (i18n.t("signup.verify.resend") || "Reenviar código")}
                                </Button>
                                <Button
                                    variant="text"
                                    size="small"
                                    style={{ color: "#8b949e", textTransform: "none" }}
                                    onClick={() => { setStep(STEP_FORM); setVerificationCode(["", "", "", "", "", ""]); }}
                                >
                                    {i18n.t("signup.actions.back") || "Voltar"}
                                </Button>
                            </div>
                        </div>
                    )}

                    </div>{/* fim do cartao */}

                    <div className={classes.footer}>
                        © {new Date().getFullYear()} {appName || "CRM"}. {i18n.t("login.footer")}
                    </div>
                </div>
            </div>
        </React.Fragment>
    );
};

export default SignUp;
