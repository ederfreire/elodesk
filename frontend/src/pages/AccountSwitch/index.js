import React, { useState, useEffect, useContext } from "react";
import {
  makeStyles,
  Paper,
  Typography,
  Avatar,
  IconButton,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  CircularProgress,
} from "@material-ui/core";
import DeleteIcon from "@material-ui/icons/Delete";
import AddIcon from "@material-ui/icons/Add";
import ArrowBackIcon from "@material-ui/icons/ArrowBack";
import VpnKeyIcon from "@material-ui/icons/VpnKey";
import EditIcon from "@material-ui/icons/Edit";

import { useHistory } from "react-router-dom";
import { AuthContext } from "../../context/Auth/AuthContext";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";
import api from "../../services/api";
import axios from "axios";
import { i18n } from "../../translate/i18n";

// Instância isolada para validar credenciais sem afetar a sessão ativa
const validateApi = axios.create({
  baseURL: process.env.REACT_APP_BACKEND_URL,
  withCredentials: false,
});

const useStyles = makeStyles((theme) => ({
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: theme.spacing(3),
    minHeight: "100%",
    background: theme.palette.type === "dark"
      ? "linear-gradient(180deg, #0d0f18 0%, #1a1c2e 100%)"
      : "#f5f5f5",
  },
  header: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    maxWidth: 480,
    marginBottom: theme.spacing(3),
  },
  title: {
    fontWeight: 700,
    fontSize: "1.5rem",
    flex: 1,
    textAlign: "center",
    color: theme.palette.type === "dark" ? "#fff" : "#1e293b",
  },
  subtitle: {
    color: theme.palette.type === "dark" ? "#94a3b8" : "#64748b",
    textAlign: "center",
    marginBottom: theme.spacing(3),
    maxWidth: 480,
  },
  accountCard: {
    display: "flex",
    alignItems: "center",
    padding: theme.spacing(2),
    marginBottom: theme.spacing(1.5),
    borderRadius: 16,
    cursor: "pointer",
    width: "100%",
    maxWidth: 480,
    background: theme.palette.type === "dark"
      ? "linear-gradient(135deg, #1e2035 0%, #252840 100%)"
      : "#fff",
    border: theme.palette.type === "dark"
      ? "1px solid rgba(255,255,255,0.06)"
      : "1px solid rgba(0,0,0,0.08)",
    transition: "all 0.2s ease",
    "&:hover": {
      transform: "translateX(4px)",
      borderColor: theme.palette.primary.main,
    },
  },
  activeCard: {
    borderColor: theme.palette.primary.main + " !important",
    borderWidth: 2,
  },
  avatar: {
    width: 48,
    height: 48,
    marginRight: theme.spacing(2),
    backgroundColor: theme.palette.primary.main,
    fontSize: "1.2rem",
    fontWeight: 700,
  },
  accountInfo: {
    flex: 1,
    overflow: "hidden",
  },
  accountName: {
    fontWeight: 600,
    color: theme.palette.type === "dark" ? "#fff" : "#1e293b",
    fontSize: "1rem",
  },
  accountEmail: {
    color: theme.palette.type === "dark" ? "#94a3b8" : "#64748b",
    fontSize: "0.85rem",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  accountApi: {
    color: theme.palette.type === "dark" ? "#64748b" : "#94a3b8",
    fontSize: "0.75rem",
    marginTop: 2,
  },
  addButton: {
    width: "100%",
    maxWidth: 480,
    marginTop: theme.spacing(2),
    borderRadius: 12,
    padding: theme.spacing(1.5),
    fontWeight: 700,
    fontSize: "1rem",
    textTransform: "none",
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    color: "#fff",
    "&:hover": {
      background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
    },
  },
  chipActive: {
    backgroundColor: "#22c55e",
    color: "#fff",
    fontWeight: 700,
    fontSize: "0.7rem",
    height: 22,
  },
}));

const ACCOUNTS_KEY = "savedAccounts";

// AES-GCM encryption using Web Crypto API
const CRYPTO_KEY_NAME = "eq_account_key";

const getCryptoKey = async () => {
  const stored = localStorage.getItem(CRYPTO_KEY_NAME);
  if (stored) {
    const rawKey = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
    return crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt", "decrypt"]);
  }
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const exported = await crypto.subtle.exportKey("raw", key);
  localStorage.setItem(CRYPTO_KEY_NAME, btoa(String.fromCharCode(...new Uint8Array(exported))));
  return key;
};

const encrypt = async (plaintext) => {
  try {
    const key = await getCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return btoa(String.fromCharCode(...combined));
  } catch {
    return "";
  }
};

const decrypt = async (encrypted) => {
  try {
    if (!encrypted) return "";
    const key = await getCryptoKey();
    const data = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
    const iv = data.slice(0, 12);
    const ciphertext = data.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch {
    return "";
  }
};

const getSavedAccounts = () => {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
  } catch {
    return [];
  }
};

const saveAccountsList = (accounts) => {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    return true;
  } catch (err) {
    console.error("Falha ao salvar contas no localStorage", err);
    return false;
  }
};


const AccountSwitch = () => {
  const classes = useStyles();
  const history = useHistory();
  const { user, handleLogin } = useContext(AuthContext);
  const [accounts, setAccounts] = useState([]);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [savePasswordOpen, setSavePasswordOpen] = useState(false);
  const [editLabelOpen, setEditLabelOpen] = useState(false);
  const [editLabelEmail, setEditLabelEmail] = useState(null);
  const [editLabelValue, setEditLabelValue] = useState("");
  // Nova senha guardada para a troca rápida (opcional no diálogo de edição).
  const [editPasswordValue, setEditPasswordValue] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [switchingEmail, setSwitchingEmail] = useState(null);


  useEffect(() => {
    const saved = getSavedAccounts();
    if (user?.email) {
      const idx = saved.findIndex((a) => a.email === user.email);
      if (idx === -1) {
        saved.push({
          name: user.name,
          email: user.email,
          profile: user.profile,
          companyId: user.companyId,
          _t: "",
        });
        saveAccountsList(saved);
      } else {
        saved[idx].name = user.name;
        saved[idx].profile = user.profile;
        saved[idx].companyId = user.companyId;
        saveAccountsList(saved);
      }
    }
    setAccounts(saved);
  }, [user]);

  const clearActiveSession = async () => {
    try {
      await api.delete("/auth/logout");
    } catch (_) {}

    localStorage.removeItem("token");
    localStorage.removeItem("cshow");
    api.defaults.headers.Authorization = undefined;
  };

  const handleSwitchAccount = async (account) => {
    if (account.email === user?.email) return;

    const pwd = await decrypt(account._t || "");
    if (!pwd) {
      toast.warn(i18n.t("accountSwitch.toasts.noCredentials"));
      return;
    }

    setSwitchingEmail(account.email);
    setLoading(true);
    try {
      await clearActiveSession();
      await handleLogin({ email: account.email, password: pwd });
      toast.success(i18n.t("accountSwitch.toasts.connectedAs", { name: account.name || account.email }));
    } catch (err) {
      toastError(err);
    }
    setLoading(false);
    setSwitchingEmail(null);
  };

  const handleAddAccount = async () => {
    if (!newEmail || !newPassword) return;
    setLoading(true);
    try {
      const { data } = await validateApi.post("/auth/login", { email: newEmail, password: newPassword });
      const validatedUser = data.user;

      const currentAccounts = getSavedAccounts();
      const existing = currentAccounts.findIndex((a) => a.email === newEmail);
      const encryptedPwd = await encrypt(newPassword);
      if (!encryptedPwd) {
        toast.error(i18n.t("accountSwitch.toasts.saveFailed"));
        setLoading(false);
        return;
      }
      const newAccount = {
        name: validatedUser.name || newEmail.split("@")[0],
        label: (newLabel || "").trim(),
        email: newEmail,
        profile: validatedUser.profile || "user",
        companyId: validatedUser.companyId,
        _t: encryptedPwd,
      };

      if (existing >= 0) {
        currentAccounts[existing] = { ...currentAccounts[existing], ...newAccount };
      } else {
        currentAccounts.push(newAccount);
      }
      const ok = saveAccountsList(currentAccounts);
      if (!ok) {
        toast.error(i18n.t("accountSwitch.toasts.saveFailed"));
        setLoading(false);
        return;
      }
      setAccounts(currentAccounts);
      toast.success(i18n.t("accountSwitch.toasts.accountAdded"));
      setAddAccountOpen(false);
      setNewEmail("");
      setNewPassword("");
      setNewLabel("");
    } catch (err) {
      toast.error(i18n.t("accountSwitch.toasts.invalidCredentials"));
    }
    setLoading(false);
  };

  const openEditLabel = (account, e) => {
    e.stopPropagation();
    setEditLabelEmail(account.email);
    setEditLabelValue(account.label || "");
    setEditPasswordValue("");
    setEditLabelOpen(true);
  };

  const handleSaveLabel = async () => {
    const updated = getSavedAccounts();
    const idx = updated.findIndex((a) => a.email === editLabelEmail);
    if (idx >= 0) {
      // Senha nova (opcional): valida no login antes de guardar, igual ao fluxo
      // de "salvar senha". Senha errada não é salva — senão a troca automática
      // passaria a falhar. Isto NÃO muda a senha de acesso ao sistema; só a
      // senha guardada (criptografada) neste navegador para a troca rápida.
      if (editPasswordValue) {
        setLoading(true);
        try {
          await validateApi.post("/auth/login", { email: editLabelEmail, password: editPasswordValue });
          updated[idx]._t = await encrypt(editPasswordValue);
          if (!updated[idx]._t) throw new Error("encrypt");
        } catch (err) {
          setLoading(false);
          toast.error(i18n.t("accountSwitch.toasts.invalidCredentials"));
          return;
        }
        setLoading(false);
      }
      updated[idx].label = (editLabelValue || "").trim();
      const ok = saveAccountsList(updated);
      if (!ok) {
        toast.error(i18n.t("accountSwitch.toasts.saveFailed"));
        return;
      }
      setAccounts(updated);
      toast.success(
        editPasswordValue
          ? i18n.t("accountSwitch.toasts.accountUpdated", "Conta atualizada. Senha salva validada.")
          : i18n.t("accountSwitch.toasts.labelUpdated")
      );
    }
    setEditLabelOpen(false);
    setEditLabelEmail(null);
    setEditLabelValue("");
    setEditPasswordValue("");
  };


  const handleSaveCurrentPassword = async () => {
    if (!currentPassword) return;
    setLoading(true);
    try {
      // Validate password before saving
      await validateApi.post("/auth/login", { email: user.email, password: currentPassword });

      const updated = getSavedAccounts();
      const idx = updated.findIndex((a) => a.email === user.email);
      if (idx >= 0) {
        updated[idx]._t = await encrypt(currentPassword);
        saveAccountsList(updated);
        setAccounts(updated);
        toast.success(i18n.t("accountSwitch.toasts.passwordSaved"));
        setSavePasswordOpen(false);
        setCurrentPassword("");
      }
    } catch (err) {
      toast.error(i18n.t("accountSwitch.toasts.invalidCredentials"));
    }
    setLoading(false);
  };

  const handleRemoveAccount = (email, e) => {
    e.stopPropagation();
    if (email === user?.email) {
      toast.warn(i18n.t("accountSwitch.toasts.cannotRemoveActive"));
      return;
    }
    const updated = accounts.filter((a) => a.email !== email);
    saveAccountsList(updated);
    setAccounts(updated);
    toast.success(i18n.t("accountSwitch.toasts.accountRemoved"));
  };

  const currentAccount = accounts.find((a) => a.email === user?.email);
  const hasCurrentPassword = currentAccount && currentAccount._t;

  return (
    <div className={classes.root}>
      <div className={classes.header}>
        <IconButton onClick={() => history.goBack()}>
          <ArrowBackIcon style={{ color: "#94a3b8" }} />
        </IconButton>
        <Typography className={classes.title}>
          {i18n.t("accountSwitch.title")}
        </Typography>
        <div style={{ width: 48 }} />
      </div>

      <Typography className={classes.subtitle}>
        {i18n.t("accountSwitch.subtitle")}
      </Typography>

      {accounts.map((account) => (
        <Paper
          key={account.email}
          className={`${classes.accountCard} ${
            account.email === user?.email ? classes.activeCard : ""
          }`}
          elevation={0}
          onClick={() => handleSwitchAccount(account)}
        >
          <Avatar className={classes.avatar}>
            {(account.name || account.email || "?")[0].toUpperCase()}
          </Avatar>
          <div className={classes.accountInfo}>
            <Typography className={classes.accountName}>
              {account.label ? account.label : (account.name || account.email)}
            </Typography>
            {account.label && (
              <Typography className={classes.accountEmail} style={{ fontSize: "0.78rem", opacity: 0.9 }}>
                {account.name}
              </Typography>
            )}
            <Typography className={classes.accountEmail}>
              {account.email}
            </Typography>
            <Typography className={classes.accountApi}>
              🏢 {account.profile === "admin" ? i18n.t("accountSwitch.admin") : i18n.t("accountSwitch.agent")}
              {account._t
                ? ` • 🔑 ${i18n.t("accountSwitch.saved")}`
                : ` • ⚠️ ${i18n.t("accountSwitch.noPassword")}`}
            </Typography>
          </div>
          {switchingEmail === account.email ? (
            <CircularProgress size={24} />
          ) : account.email === user?.email ? (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <IconButton
                size="small"
                onClick={(e) => openEditLabel(account, e)}
                title={i18n.t("accountSwitch.editLabel")}
              >
                <EditIcon style={{ color: "#6366f1", fontSize: 18 }} />
              </IconButton>
              {!hasCurrentPassword && (
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentPassword("");
                    setSavePasswordOpen(true);
                  }}
                  title={i18n.t("accountSwitch.savePassword")}
                >
                  <VpnKeyIcon style={{ color: "#f59e0b", fontSize: 20 }} />
                </IconButton>
              )}
              <Chip label={i18n.t("accountSwitch.active")} className={classes.chipActive} size="small" />
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <IconButton
                size="small"
                onClick={(e) => openEditLabel(account, e)}
                title={i18n.t("accountSwitch.editLabel")}
              >
                <EditIcon style={{ color: "#6366f1", fontSize: 18 }} />
              </IconButton>
              <IconButton
                size="small"
                onClick={(e) => handleRemoveAccount(account.email, e)}
              >
                <DeleteIcon style={{ color: "#ef4444", fontSize: 20 }} />
              </IconButton>
            </div>
          )}

        </Paper>
      ))}

      <Button
        className={classes.addButton}
        startIcon={<AddIcon />}
        onClick={() => {
          setNewEmail("");
          setNewPassword("");
          setNewLabel("");
          setAddAccountOpen(true);
        }}
        disabled={loading}
      >
        + {i18n.t("accountSwitch.addAccount")}
      </Button>

      {/* Dialog: Adicionar Conta — campos sempre vazios */}
      <Dialog
        open={addAccountOpen}
        onClose={() => setAddAccountOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ style: { borderRadius: 16 } }}
      >
        <DialogTitle>{i18n.t("accountSwitch.addAccount")}</DialogTitle>
        <DialogContent>
          <TextField
            margin="dense"
            label={i18n.t("accountSwitch.label")}
            type="text"
            fullWidth
            variant="outlined"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            helperText={i18n.t("accountSwitch.labelHelper")}
          />
          <TextField
            autoFocus
            margin="dense"
            label={i18n.t("accountSwitch.email")}
            type="email"
            fullWidth
            variant="outlined"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            style={{ marginTop: 12 }}
          />
          <TextField
            margin="dense"
            label={i18n.t("accountSwitch.password")}
            type="password"
            fullWidth
            variant="outlined"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={{ marginTop: 12 }}
            helperText={i18n.t("accountSwitch.passwordHelper")}
          />
        </DialogContent>
        <DialogActions style={{ padding: "8px 24px 16px" }}>
          <Button onClick={() => setAddAccountOpen(false)}>
            {i18n.t("accountSwitch.cancel")}
          </Button>
          <Button
            onClick={handleAddAccount}
            color="primary"
            variant="contained"
            disabled={loading || !newEmail || !newPassword}
            style={{ borderRadius: 8 }}
          >
            {loading ? <CircularProgress size={20} /> : i18n.t("accountSwitch.save")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Editar nome (label) da conta */}
      <Dialog
        open={editLabelOpen}
        onClose={() => setEditLabelOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ style: { borderRadius: 16 } }}
      >
        <DialogTitle>{i18n.t("accountSwitch.editAccount", "Editar conta")}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={i18n.t("accountSwitch.label")}
            type="text"
            fullWidth
            variant="outlined"
            value={editLabelValue}
            onChange={(e) => setEditLabelValue(e.target.value)}
            helperText={i18n.t("accountSwitch.labelHelper")}
          />
          <TextField
            margin="dense"
            label={i18n.t("accountSwitch.newSavedPassword", "Nova senha salva (opcional)")}
            type="password"
            autoComplete="new-password"
            fullWidth
            variant="outlined"
            value={editPasswordValue}
            onChange={(e) => setEditPasswordValue(e.target.value)}
            helperText={i18n.t(
              "accountSwitch.newSavedPasswordHelper",
              "Deixe em branco para manter a atual. Atualiza só a senha guardada neste navegador para a troca rápida — não altera a senha de acesso ao sistema."
            )}
            style={{ marginTop: 12 }}
          />
        </DialogContent>
        <DialogActions style={{ padding: "8px 24px 16px" }}>
          <Button onClick={() => setEditLabelOpen(false)}>
            {i18n.t("accountSwitch.cancel")}
          </Button>
          <Button
            onClick={handleSaveLabel}
            color="primary"
            variant="contained"
            disabled={loading}
            style={{ borderRadius: 8 }}
          >
            {i18n.t("accountSwitch.save")}
          </Button>
        </DialogActions>
      </Dialog>


      {/* Dialog: Salvar senha da conta atual — email fixo */}
      <Dialog
        open={savePasswordOpen}
        onClose={() => setSavePasswordOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ style: { borderRadius: 16 } }}
      >
        <DialogTitle>{i18n.t("accountSwitch.saveCurrentPassword")}</DialogTitle>
        <DialogContent>
          <TextField
            margin="dense"
            label={i18n.t("accountSwitch.email")}
            type="email"
            fullWidth
            variant="outlined"
            value={user?.email || ""}
            disabled
          />
          <TextField
            autoFocus
            margin="dense"
            label={i18n.t("accountSwitch.password")}
            type="password"
            fullWidth
            variant="outlined"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            style={{ marginTop: 12 }}
            helperText={i18n.t("accountSwitch.passwordHelper")}
          />
        </DialogContent>
        <DialogActions style={{ padding: "8px 24px 16px" }}>
          <Button onClick={() => setSavePasswordOpen(false)}>
            {i18n.t("accountSwitch.cancel")}
          </Button>
          <Button
            onClick={handleSaveCurrentPassword}
            color="primary"
            variant="contained"
            disabled={loading || !currentPassword}
            style={{ borderRadius: 8 }}
          >
            {loading ? <CircularProgress size={20} /> : i18n.t("accountSwitch.save")}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default AccountSwitch;
