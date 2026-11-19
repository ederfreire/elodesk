import React, { useState, useEffect, useContext, useCallback } from "react";
import { toast } from "react-toastify";
import { makeStyles, TextField, List, ListItem, ListItemAvatar, ListItemText, Avatar, Typography, IconButton, Button, Divider, CircularProgress, InputAdornment, FormControl, InputLabel, Select, MenuItem, Switch, FormControlLabel, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, Chip, Box } from "@material-ui/core";
import SearchIcon from "@material-ui/icons/Search";
import EditIcon from "@material-ui/icons/Edit";
import LinkIcon from "@material-ui/icons/Link";
import PersonAddIcon from "@material-ui/icons/PersonAdd";
import SendIcon from "@material-ui/icons/Send";
import RefreshIcon from "@material-ui/icons/Refresh";
import GroupIcon from "@material-ui/icons/Group";
import DeleteIcon from "@material-ui/icons/Delete";
import FileCopyIcon from "@material-ui/icons/FileCopy";
import StarIcon from "@material-ui/icons/Star";
import CloseIcon from "@material-ui/icons/Close";
import DescriptionIcon from "@material-ui/icons/Description";
import PromoteIcon from "@material-ui/icons/ArrowUpward";
import DemoteIcon from "@material-ui/icons/ArrowDownward";
import GreetingIcon from "@material-ui/icons/EmojiPeople";
import green from "@material-ui/core/colors/green";
import red from "@material-ui/core/colors/red";
import orange from "@material-ui/core/colors/orange";
import grey from "@material-ui/core/colors/grey";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import { AuthContext } from "../../context/Auth/AuthContext";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles((theme) => ({
  root: {
    display: "flex",
    height: "calc(100vh - 64px)",
    overflow: "hidden",
  },
  leftPanel: {
    width: 360,
    minWidth: 360,
    borderRight: `1px solid ${theme.palette.divider}`,
    display: "flex",
    flexDirection: "column",
    backgroundColor: theme.palette.background.paper,
  },
  leftPanelHeader: {
    padding: theme.spacing(2),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  filterRow: {
    display: "flex",
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
  },
  groupList: {
    flex: 1,
    overflowY: "auto",
    padding: 0,
  },
  groupListItem: {
    borderBottom: `1px solid ${theme.palette.divider}`,
    "&:hover": {
      backgroundColor: theme.palette.action.hover,
    },
    cursor: "pointer",
  },
  selectedGroup: {
    backgroundColor: `${theme.palette.primary.main}15 !important`,
    borderLeft: `3px solid ${theme.palette.primary.main}`,
  },
  rightPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  groupHeader: {
    background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
    color: "#fff",
    padding: theme.spacing(2, 3),
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(2),
  },
  groupHeaderAvatar: {
    width: 56,
    height: 56,
    border: "2px solid rgba(255,255,255,0.3)",
  },
  groupContent: {
    flex: 1,
    overflowY: "auto",
    padding: theme.spacing(3),
  },
  section: {
    marginBottom: theme.spacing(3),
  },
  sectionTitle: {
    fontWeight: 600,
    marginBottom: theme.spacing(1.5),
    color: theme.palette.text.secondary,
    fontSize: "0.85rem",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  actionCard: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(2),
    padding: theme.spacing(1.5, 2),
    borderRadius: 8,
    cursor: "pointer",
    transition: "background-color 0.2s",
    "&:hover": {
      backgroundColor: theme.palette.action.hover,
    },
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
  },
  settingsRow: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(3),
    flexWrap: "wrap",
  },
  participantItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing(1, 0),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  participantInfo: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.5),
  },
  adminBadge: {
    backgroundColor: green[100],
    color: green[800],
    fontSize: "0.7rem",
    height: 20,
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: theme.palette.text.secondary,
  },
  connectionChip: {
    fontSize: "0.7rem",
    height: 20,
    maxWidth: 150,
  },
  headerCount: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
}));

const GroupManager = () => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);

  const [groups, setGroups] = useState(() => {
    try {
      const cached = localStorage.getItem("gm_groups");
      if (cached) return JSON.parse(cached).groups || [];
    } catch (e) {}
    return [];
  });
  const [loading, setLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupMetadata, setGroupMetadata] = useState(null);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [whatsappFilter, setWhatsappFilter] = useState(() => {
    try {
      const cached = localStorage.getItem("gm_groups");
      if (cached) return JSON.parse(cached).whatsappId || "";
    } catch (e) {}
    return "";
  });
  const [whatsapps, setWhatsapps] = useState([]);
  const [synced, setSynced] = useState(() => {
    try {
      const cached = localStorage.getItem("gm_groups");
      return cached ? (JSON.parse(cached).groups?.length > 0) : false;
    } catch (e) {}
    return false;
  });

  // Dialog states
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [editDescOpen, setEditDescOpen] = useState(false);
  const [inviteLinkOpen, setInviteLinkOpen] = useState(false);
  const [addParticipantOpen, setAddParticipantOpen] = useState(false);
  const [sendMessageOpen, setSendMessageOpen] = useState(false);

  // Form values
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [newParticipant, setNewParticipant] = useState("");
  const [messageText, setMessageText] = useState("");
  const [mentionAll, setMentionAll] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Saudação de boas-vindas para novos membros (por grupo)
  const [greetingOpen, setGreetingOpen] = useState(false);
  const [greetingLoading, setGreetingLoading] = useState(false);
  const [greetingEnabled, setGreetingEnabled] = useState(false);
  const [greetingInGroup, setGreetingInGroup] = useState(true);
  const [greetingInPrivate, setGreetingInPrivate] = useState(false);
  const [greetingMessage, setGreetingMessage] = useState("");
  const [greetingVars, setGreetingVars] = useState([]);
  const [greetingPreview, setGreetingPreview] = useState("");

  // Load whatsapp connections
  useEffect(() => {
    const fetchWhatsapps = async () => {
      try {
        const { data } = await api.get("/whatsapp/");
        setWhatsapps(data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchWhatsapps();
  }, []);

  // Load groups - only when manually triggered
  const fetchGroups = useCallback(async () => {
    if (!whatsappFilter) {
      toast.warn(i18n.t("groupManager.toasts.selectConnectionFirst"));
      return;
    }
    setLoading(true);
    setSynced(false);
    try {
      const params = { whatsappId: whatsappFilter };
      const { data } = await api.get("/group-manager/groups", { params });
      setGroups(data);
      setSynced(true);
      try {
        localStorage.setItem("gm_groups", JSON.stringify({ groups: data, whatsappId: whatsappFilter }));
      } catch (e) {}
      toast.success(i18n.t("groupManager.toasts.syncSuccess", { count: data.length }));
    } catch (err) {
      const msg = err?.response?.data?.error || i18n.t("groupManager.toasts.loadError");
      toast.error(msg);
      console.error(err);
    }
    setLoading(false);
  }, [whatsappFilter]);

  const handleClearGroups = () => {
    setGroups([]);
    localStorage.removeItem("gm_groups");
    setSelectedGroup(null);
    setGroupMetadata(null);
    setSynced(false);
  };

  // Load group metadata when selected
  const handleSelectGroup = async (group) => {
    setSelectedGroup(group);
    setLoadingMetadata(true);
    try {
      const { data } = await api.get(
        `/group-manager/${group.whatsappId}/${encodeURIComponent(group.id)}/metadata`
      );
      setGroupMetadata(data);
    } catch (err) {
      toast.error(i18n.t("groupManager.toasts.metadataError"));
      setGroupMetadata(null);
    }
    setLoadingMetadata(false);
  };

  // Filtered groups
  const filteredGroups = groups.filter((g) =>
    (g.subject || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Actions
  const handleUpdateName = async () => {
    if (!newName.trim()) return;
    setActionLoading(true);
    try {
      await api.put(
        `/group-manager/${selectedGroup.whatsappId}/${encodeURIComponent(selectedGroup.id)}/subject`,
        { subject: newName }
      );
      toast.success(i18n.t("groupManager.toasts.nameUpdated"));
      setEditNameOpen(false);
      setSelectedGroup({ ...selectedGroup, subject: newName });
      fetchGroups();
    } catch (err) {
      toast.error(i18n.t("groupManager.toasts.nameError"));
    }
    setActionLoading(false);
  };

  const handleUpdateDescription = async () => {
    setActionLoading(true);
    try {
      await api.put(
        `/group-manager/${selectedGroup.whatsappId}/${encodeURIComponent(selectedGroup.id)}/description`,
        { description: newDesc }
      );
      toast.success(i18n.t("groupManager.toasts.descUpdated"));
      setEditDescOpen(false);
      handleSelectGroup(selectedGroup);
    } catch (err) {
      toast.error(i18n.t("groupManager.toasts.descError"));
    }
    setActionLoading(false);
  };

  const handleGetInviteLink = async () => {
    setActionLoading(true);
    try {
      const { data } = await api.get(
        `/group-manager/${selectedGroup.whatsappId}/${encodeURIComponent(selectedGroup.id)}/invite-link`
      );
      setInviteLink(data.inviteLink);
      setInviteLinkOpen(true);
    } catch (err) {
      toast.error(i18n.t("groupManager.toasts.inviteLinkError"));
    }
    setActionLoading(false);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    toast.success(i18n.t("groupManager.toasts.linkCopied"));
  };

  const handleAddParticipant = async () => {
    if (!newParticipant.trim()) return;
    setActionLoading(true);
    try {
      const participants = newParticipant.split(",").map((p) => p.trim());
      await api.post(
        `/group-manager/${selectedGroup.whatsappId}/${encodeURIComponent(selectedGroup.id)}/participants`,
        { participants }
      );
      toast.success(i18n.t("groupManager.toasts.participantAdded"));
      setAddParticipantOpen(false);
      setNewParticipant("");
      handleSelectGroup(selectedGroup);
    } catch (err) {
      toast.error(i18n.t("groupManager.toasts.participantAddError"));
    }
    setActionLoading(false);
  };

  const handleSendMessage = async () => {
    if (!messageText.trim()) return;
    setActionLoading(true);
    try {
      await api.post(
        `/group-manager/${selectedGroup.whatsappId}/${encodeURIComponent(selectedGroup.id)}/send-message`,
        { message: messageText, mentionAll }
      );
      toast.success(i18n.t("groupManager.toasts.messageSent"));
      setSendMessageOpen(false);
      setMessageText("");
      setMentionAll(false);
    } catch (err) {
      toast.error(i18n.t("groupManager.toasts.messageError"));
    }
    setActionLoading(false);
  };

  const handleOpenGreeting = async () => {
    if (!selectedGroup) return;
    setGreetingOpen(true);
    setGreetingLoading(true);
    setGreetingPreview("");
    try {
      const { data } = await api.get(
        `/group-manager/${selectedGroup.whatsappId}/${encodeURIComponent(selectedGroup.id)}/greeting`
      );
      setGreetingEnabled(!!data.enabled);
      setGreetingInGroup(data.sendInGroup !== false);
      setGreetingInPrivate(!!data.sendInPrivate);
      setGreetingMessage(data.message || "");
      setGreetingVars(Array.isArray(data.variables) ? data.variables : []);
    } catch (err) {
      toast.error(i18n.t("groupGreeting.toasts.loadError"));
    }
    setGreetingLoading(false);
  };

  const handleSaveGreeting = async () => {
    if (!selectedGroup) return;
    setActionLoading(true);
    try {
      await api.put(
        `/group-manager/${selectedGroup.whatsappId}/${encodeURIComponent(selectedGroup.id)}/greeting`,
        {
          enabled: greetingEnabled,
          sendInGroup: greetingInGroup,
          sendInPrivate: greetingInPrivate,
          message: greetingMessage
        }
      );
      toast.success(i18n.t("groupGreeting.toasts.saved"));
      setGreetingOpen(false);
    } catch (err) {
      // O backend recusa configuração incoerente (ativa sem destino ou sem
      // texto) com uma mensagem específica — mostra ela em vez de um erro genérico.
      toast.error(
        err?.response?.data?.error || i18n.t("groupGreeting.toasts.saveError")
      );
    }
    setActionLoading(false);
  };

  const handlePreviewGreeting = async () => {
    try {
      const { data } = await api.post("/group-manager/greeting/preview", {
        message: greetingMessage
      });
      setGreetingPreview(data?.preview || "");
    } catch (err) {
      toast.error(i18n.t("groupGreeting.toasts.previewError"));
    }
  };

  // Insere a variável no fim do texto. Simples de propósito: mexer no cursor
  // exigiria uma ref no TextField e não agrega quase nada aqui.
  const handleInsertVariable = (key) => {
    setGreetingMessage((atual) => `${atual}{{${key}}}`);
  };

  const handleUpdateSetting = async (setting) => {
    try {
      await api.put(
        `/group-manager/${selectedGroup.whatsappId}/${encodeURIComponent(selectedGroup.id)}/settings`,
        { setting }
      );
      toast.success(i18n.t("groupManager.toasts.settingUpdated"));
      handleSelectGroup(selectedGroup);
    } catch (err) {
      toast.error(i18n.t("groupManager.toasts.settingError"));
    }
  };

  const handleRemoveParticipant = async (participantJid) => {
    if (!window.confirm(i18n.t("groupManager.confirmRemoveParticipant"))) return;
    try {
      await api.post(
        `/group-manager/${selectedGroup.whatsappId}/${encodeURIComponent(selectedGroup.id)}/remove-participant`,
        { participantJid }
      );
      toast.success(i18n.t("groupManager.toasts.participantRemoved"));
      handleSelectGroup(selectedGroup);
    } catch (err) {
      toast.error(i18n.t("groupManager.toasts.removeError"));
    }
  };

  const handlePromoteParticipant = async (participantJid) => {
    try {
      await api.post(
        `/group-manager/${selectedGroup.whatsappId}/${encodeURIComponent(selectedGroup.id)}/promote-participant`,
        { participantJid }
      );
      toast.success(i18n.t("groupManager.toasts.promoted"));
      handleSelectGroup(selectedGroup);
    } catch (err) {
      toast.error(i18n.t("groupManager.toasts.promoteError"));
    }
  };

  const handleDemoteParticipant = async (participantJid) => {
    try {
      await api.post(
        `/group-manager/${selectedGroup.whatsappId}/${encodeURIComponent(selectedGroup.id)}/demote-participant`,
        { participantJid }
      );
      toast.success(i18n.t("groupManager.toasts.demoted"));
      handleSelectGroup(selectedGroup);
    } catch (err) {
      toast.error(i18n.t("groupManager.toasts.demoteError"));
    }
  };

  const formatParticipantNumber = (jid) => {
    if (!jid) return "";
    return jid.replace("@s.whatsapp.net", "").replace("@lid", "");
  };

  return (
    <MainContainer>
      <div className={classes.root}>
        {/* Left Panel - Group List */}
        <div className={classes.leftPanel}>
          <div className={classes.leftPanelHeader}>
            <div className={classes.headerCount}>
              <Typography variant="h6" style={{ fontWeight: 600 }}>
                <GroupIcon style={{ verticalAlign: "middle", marginRight: 8 }} />
                {i18n.t("groupManager.groups")} ({filteredGroups.length})
              </Typography>
              <div>
                {groups.length > 0 && (
                  <Tooltip title={i18n.t("groupManager.clearAll")}>
                    <IconButton size="small" onClick={handleClearGroups}>
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                )}
              </div>
            </div>

            <div className={classes.filterRow}>
              <FormControl variant="outlined" size="small" fullWidth>
                <InputLabel>{i18n.t("groupManager.connection")}</InputLabel>
                <Select
                  value={whatsappFilter}
                  onChange={(e) => {
                    setWhatsappFilter(e.target.value);
                    setGroups([]);
                    setSelectedGroup(null);
                    setGroupMetadata(null);
                    setSynced(false);
                    localStorage.removeItem("gm_groups");
                  }}
                  label={i18n.t("groupManager.connection")}
                >
                  <MenuItem value="" disabled>
                    {i18n.t("groupManager.selectConnection")}
                  </MenuItem>
                  {whatsapps.map((w) => (
                    <MenuItem key={w.id} value={w.id}>
                      {w.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </div>

            <Button
              variant="contained"
              color="primary"
              fullWidth
              style={{ marginTop: 8 }}
              onClick={fetchGroups}
              disabled={loading || !whatsappFilter}
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
            >
              {loading ? i18n.t("groupManager.syncing") : i18n.t("groupManager.sync")}
            </Button>

            {synced && (
              <TextField
                variant="outlined"
                size="small"
                fullWidth
                placeholder={i18n.t("groupManager.searchGroup")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ marginTop: 8 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon color="disabled" />
                    </InputAdornment>
                  ),
                }}
              />
            )}
          </div>

          <List className={classes.groupList}>
            {loading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
                <CircularProgress />
              </div>
            ) : filteredGroups.length === 0 ? (
              <div style={{ textAlign: "center", padding: 32, color: grey[500] }}>
                <GroupIcon style={{ fontSize: 48, marginBottom: 8 }} />
                <Typography variant="body2">
                  {!whatsappFilter
                    ? i18n.t("groupManager.selectConnectionFirst")
                    : !synced
                      ? i18n.t("groupManager.clickSyncToLoad")
                      : i18n.t("groupManager.noGroupsFound")}
                </Typography>
              </div>
            ) : (
              filteredGroups.map((group) => (
                <ListItem
                  key={`${group.whatsappId}-${group.id}`}
                  className={`${classes.groupListItem} ${
                    selectedGroup?.id === group.id && selectedGroup?.whatsappId === group.whatsappId
                      ? classes.selectedGroup
                      : ""
                  }`}
                  onClick={() => handleSelectGroup(group)}
                >
                  <ListItemAvatar>
                    <Avatar src={group.profilePicUrl} alt={group.subject}>
                      <GroupIcon />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Typography variant="subtitle2" noWrap style={{ fontWeight: 500 }}>
                        {group.subject || i18n.t("groupManager.noName")}
                      </Typography>
                    }
                    secondary={
                      <Chip
                        label={group.whatsappName || i18n.t("groupManager.connectionLabel", { id: group.whatsappId })}
                        size="small"
                        variant="outlined"
                        className={classes.connectionChip}
                      />
                    }
                  />
                </ListItem>
              ))
            )}
          </List>
        </div>

        {/* Right Panel - Group Details */}
        <div className={classes.rightPanel}>
          {!selectedGroup ? (
            <div className={classes.emptyState}>
              <GroupIcon style={{ fontSize: 80, marginBottom: 16, opacity: 0.3 }} />
              <Typography variant="h6" color="textSecondary">
                {i18n.t("groupManager.selectGroup")}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {i18n.t("groupManager.selectGroupDesc")}
              </Typography>
            </div>
          ) : loadingMetadata ? (
            <div className={classes.emptyState}>
              <CircularProgress />
            </div>
          ) : (
            <>
              {/* Group Header */}
              <div className={classes.groupHeader}>
                <Avatar
                  src={selectedGroup.profilePicUrl}
                  className={classes.groupHeaderAvatar}
                >
                  <GroupIcon style={{ fontSize: 32 }} />
                </Avatar>
                <div style={{ flex: 1 }}>
                  <Typography variant="h6" style={{ fontWeight: 600 }}>
                    {selectedGroup.subject}
                  </Typography>
                  <Typography variant="body2" style={{ opacity: 0.8 }}>
                    {groupMetadata?.participants?.length || selectedGroup.participants} {i18n.t("groupManager.participants")}
                  </Typography>
                </div>
                <IconButton
                  style={{ color: "#fff" }}
                  onClick={() => {
                    setSelectedGroup(null);
                    setGroupMetadata(null);
                  }}
                >
                  <CloseIcon />
                </IconButton>
              </div>

              {/* Group Content */}
              <div className={classes.groupContent}>
                {/* Actions Section */}
                <div className={classes.section}>
                  <Typography className={classes.sectionTitle}>
                    {i18n.t("groupManager.groupActions")}
                  </Typography>

                  <div
                    className={classes.actionCard}
                    onClick={() => {
                      setNewName(selectedGroup.subject || "");
                      setEditNameOpen(true);
                    }}
                  >
                    <div className={classes.actionIcon} style={{ backgroundColor: "#7c3aed" }}>
                      <EditIcon fontSize="small" />
                    </div>
                    <div>
                      <Typography variant="subtitle2" style={{ fontWeight: 600 }}>
                        {i18n.t("groupManager.changeName")}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {i18n.t("groupManager.changeNameDesc")}
                      </Typography>
                    </div>
                  </div>

                  <div
                    className={classes.actionCard}
                    onClick={() => {
                      setNewDesc(groupMetadata?.desc || "");
                      setEditDescOpen(true);
                    }}
                  >
                    <div className={classes.actionIcon} style={{ backgroundColor: "#059669" }}>
                      <DescriptionIcon fontSize="small" />
                    </div>
                    <div>
                      <Typography variant="subtitle2" style={{ fontWeight: 600 }}>
                        {i18n.t("groupManager.changeDescription")}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {i18n.t("groupManager.changeDescriptionDesc")}
                      </Typography>
                    </div>
                  </div>

                  <div className={classes.actionCard} onClick={handleGetInviteLink}>
                    <div className={classes.actionIcon} style={{ backgroundColor: "#0284c7" }}>
                      <LinkIcon fontSize="small" />
                    </div>
                    <div>
                      <Typography variant="subtitle2" style={{ fontWeight: 600 }}>
                        {i18n.t("groupManager.inviteLink")}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {i18n.t("groupManager.inviteLinkDesc")}
                      </Typography>
                    </div>
                  </div>

                  <div
                    className={classes.actionCard}
                    onClick={() => {
                      setNewParticipant("");
                      setAddParticipantOpen(true);
                    }}
                  >
                    <div className={classes.actionIcon} style={{ backgroundColor: "#16a34a" }}>
                      <PersonAddIcon fontSize="small" />
                    </div>
                    <div>
                      <Typography variant="subtitle2" style={{ fontWeight: 600 }}>
                        {i18n.t("groupManager.addParticipants")}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {i18n.t("groupManager.addParticipantsDesc")}
                      </Typography>
                    </div>
                  </div>

                  <div
                    className={classes.actionCard}
                    onClick={() => {
                      setMessageText("");
                      setMentionAll(false);
                      setSendMessageOpen(true);
                    }}
                  >
                    <div className={classes.actionIcon} style={{ backgroundColor: "#dc2626" }}>
                      <SendIcon fontSize="small" />
                    </div>
                    <div>
                      <Typography variant="subtitle2" style={{ fontWeight: 600 }}>
                        {i18n.t("groupManager.sendMessage")}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {i18n.t("groupManager.sendMessageDesc")}
                      </Typography>
                    </div>
                  </div>

                  <div className={classes.actionCard} onClick={handleOpenGreeting}>
                    <div className={classes.actionIcon} style={{ backgroundColor: "#7c3aed" }}>
                      <GreetingIcon fontSize="small" />
                    </div>
                    <div>
                      <Typography variant="subtitle2" style={{ fontWeight: 600 }}>
                        {i18n.t("groupGreeting.cardTitle")}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {i18n.t("groupGreeting.cardDesc")}
                      </Typography>
                    </div>
                  </div>
                </div>

                <Divider />

                {/* Settings Section */}
                <div className={classes.section} style={{ marginTop: 16 }}>
                  <Typography className={classes.sectionTitle}>
                    {i18n.t("groupManager.settings")}
                  </Typography>
                  <div className={classes.settingsRow}>
                    <div>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={groupMetadata?.announce || false}
                            onChange={() =>
                              handleUpdateSetting(
                                groupMetadata?.announce ? "not_announcement" : "announcement"
                              )
                            }
                            color="primary"
                            size="small"
                          />
                        }
                        label={
                          <div>
                            <Typography variant="body2" style={{ fontWeight: 500 }}>
                               {i18n.t("groupManager.onlyAdminsSend")}
                            </Typography>
                            <Typography variant="caption" color="textSecondary">
                              {i18n.t("groupManager.onlyAdminsSendDesc")}
                            </Typography>
                          </div>
                        }
                      />
                    </div>
                    <div>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={groupMetadata?.restrict || false}
                            onChange={() =>
                              handleUpdateSetting(
                                groupMetadata?.restrict ? "unlocked" : "locked"
                              )
                            }
                            color="primary"
                            size="small"
                          />
                        }
                        label={
                          <div>
                            <Typography variant="body2" style={{ fontWeight: 500 }}>
                              {i18n.t("groupManager.restrictEdit")}
                            </Typography>
                            <Typography variant="caption" color="textSecondary">
                              {i18n.t("groupManager.restrictEditDesc")}
                            </Typography>
                          </div>
                        }
                      />
                    </div>
                  </div>
                </div>

                <Divider />

                {/* Participants Section */}
                <div className={classes.section} style={{ marginTop: 16 }}>
                  <Typography className={classes.sectionTitle}>
                    {i18n.t("groupManager.participantsCount", { count: groupMetadata?.participants?.length || 0 })}
                  </Typography>
                  {groupMetadata?.participants?.map((p, idx) => (
                    <div key={idx} className={classes.participantItem}>
                      <div className={classes.participantInfo}>
                        <Avatar
                          src={p.profilePicUrl || ""}
                          style={{ width: 36, height: 36 }}
                        >
                          {(p.name || formatParticipantNumber(p.id))?.charAt(0)?.toUpperCase() || "?"}
                        </Avatar>
                        <div>
                          {p.name && (
                            <Typography variant="body2" style={{ fontWeight: 600 }}>
                              {p.name}
                            </Typography>
                          )}
                          <Typography variant={p.name ? "caption" : "body2"} style={{ fontWeight: p.name ? 400 : 500 }} color={p.name ? "textSecondary" : "textPrimary"}>
                            {formatParticipantNumber(p.id)}
                          </Typography>
                          {(p.admin === "admin" || p.admin === "superadmin") && (
                            <Chip
                              label={p.admin === "superadmin" ? i18n.t("groupManager.creator") : i18n.t("groupManager.admin")}
                              size="small"
                              className={classes.adminBadge}
                              icon={<StarIcon style={{ fontSize: 12, color: green[800] }} />}
                            />
                          )}
                        </div>
                      </div>
                      <div>
                        {p.admin !== "superadmin" && (
                          <>
                            {p.admin === "admin" ? (
                              <Tooltip title={i18n.t("groupManager.demoteAdmin")}>
                                <IconButton
                                  size="small"
                                  onClick={() => handleDemoteParticipant(p.id)}
                                >
                                  <DemoteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            ) : (
                              <Tooltip title={i18n.t("groupManager.promoteAdmin")}>
                                <IconButton
                                  size="small"
                                  onClick={() => handlePromoteParticipant(p.id)}
                                >
                                  <PromoteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            <Tooltip title={i18n.t("groupManager.removeFromGroup")}>
                              <IconButton
                                size="small"
                                onClick={() => handleRemoveParticipant(p.id)}
                                style={{ color: red[400] }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Dialog: Edit Name */}
      <Dialog open={editNameOpen} onClose={() => setEditNameOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{i18n.t("groupManager.dialogChangeName")}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            variant="outlined"
            label={i18n.t("groupManager.groupName")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            margin="dense"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditNameOpen(false)}>{i18n.t("groupManager.cancel")}</Button>
          <Button
            onClick={handleUpdateName}
            color="primary"
            variant="contained"
            disabled={actionLoading}
          >
            {actionLoading ? <CircularProgress size={20} /> : i18n.t("groupManager.save")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Edit Description */}
      <Dialog open={editDescOpen} onClose={() => setEditDescOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{i18n.t("groupManager.dialogChangeDesc")}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            variant="outlined"
            label={i18n.t("groupManager.description")}
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            margin="dense"
            multiline
            rows={4}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDescOpen(false)}>{i18n.t("groupManager.cancel")}</Button>
          <Button
            onClick={handleUpdateDescription}
            color="primary"
            variant="contained"
            disabled={actionLoading}
          >
            {actionLoading ? <CircularProgress size={20} /> : i18n.t("groupManager.save")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Invite Link */}
      <Dialog open={inviteLinkOpen} onClose={() => setInviteLinkOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{i18n.t("groupManager.dialogInviteLink")}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            variant="outlined"
            value={inviteLink}
            margin="dense"
            InputProps={{
              readOnly: true,
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={handleCopyLink} size="small">
                    <FileCopyIcon />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInviteLinkOpen(false)}>{i18n.t("groupManager.close")}</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Add Participant */}
      <Dialog
        open={addParticipantOpen}
        onClose={() => setAddParticipantOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{i18n.t("groupManager.dialogAddParticipants")}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            variant="outlined"
            label={i18n.t("groupManager.phoneNumbers")}
            placeholder={i18n.t("groupManager.phoneNumbersPlaceholder")}
            value={newParticipant}
            onChange={(e) => setNewParticipant(e.target.value)}
            margin="dense"
            helperText={i18n.t("groupManager.phoneNumbersHelper")}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddParticipantOpen(false)}>{i18n.t("groupManager.cancel")}</Button>
          <Button
            onClick={handleAddParticipant}
            color="primary"
            variant="contained"
            disabled={actionLoading}
          >
            {actionLoading ? <CircularProgress size={20} /> : i18n.t("groupManager.add")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Send Message */}
      <Dialog
        open={sendMessageOpen}
        onClose={() => setSendMessageOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{i18n.t("groupManager.dialogSendMessage")}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            variant="outlined"
            label={i18n.t("groupManager.message")}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            margin="dense"
            multiline
            rows={4}
          />
          <FormControlLabel
            control={
              <Switch
                checked={mentionAll}
                onChange={(e) => setMentionAll(e.target.checked)}
                color="primary"
              />
            }
            label={i18n.t("groupManager.mentionAll")}
            style={{ marginTop: 8 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSendMessageOpen(false)}>{i18n.t("groupManager.cancel")}</Button>
          <Button
            onClick={handleSendMessage}
            color="primary"
            variant="contained"
            disabled={actionLoading}
          >
            {actionLoading ? <CircularProgress size={20} /> : i18n.t("groupManager.send")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Saudação de boas-vindas */}
      <Dialog
        open={greetingOpen}
        onClose={() => setGreetingOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{i18n.t("groupGreeting.dialogTitle")}</DialogTitle>
        <DialogContent dividers>
          {greetingLoading ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <>
              <Typography variant="body2" color="textSecondary">
                {i18n.t("groupGreeting.intro")}{" "}
                <strong>{selectedGroup?.subject || "este grupo"}</strong>.
                {i18n.t("groupGreeting.introScope")}
              </Typography>

              <FormControlLabel
                style={{ marginTop: 12 }}
                control={
                  <Switch
                    checked={greetingEnabled}
                    onChange={(e) => setGreetingEnabled(e.target.checked)}
                    color="primary"
                  />
                }
                label={i18n.t("groupGreeting.enable")}
              />

              <Box mt={1} mb={1}>
                <Typography variant="caption" color="textSecondary">
                  {i18n.t("groupGreeting.whereToSend")}
                </Typography>
                <Box>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={greetingInGroup}
                        onChange={(e) => setGreetingInGroup(e.target.checked)}
                        color="primary"
                      />
                    }
                    label={i18n.t("groupGreeting.inGroup")}
                  />
                </Box>
                <Box>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={greetingInPrivate}
                        onChange={(e) => setGreetingInPrivate(e.target.checked)}
                        color="primary"
                      />
                    }
                    label={i18n.t("groupGreeting.inPrivate")}
                  />
                </Box>
                {greetingInPrivate && (
                  <Typography variant="caption" style={{ color: orange[800] }}>
                    {i18n.t("groupGreeting.privateWarning")}
                  </Typography>
                )}
              </Box>

              <TextField
                label={i18n.t("groupGreeting.message")}
                fullWidth
                multiline
                minRows={4}
                variant="outlined"
                value={greetingMessage}
                onChange={(e) => setGreetingMessage(e.target.value)}
                placeholder={i18n.t("groupGreeting.messagePlaceholder")}
                style={{ marginTop: 8 }}
              />

              <Box mt={1}>
                <Typography variant="caption" color="textSecondary">
                  {i18n.t("groupGreeting.variablesHint")}
                </Typography>
                <Box mt={0.5} display="flex" flexWrap="wrap" style={{ gap: 6 }}>
                  {greetingVars.map((v) => (
                    <Tooltip key={v.key} title={`${v.label} — ex.: ${v.example}`}>
                      <Chip
                        size="small"
                        label={`{{${v.key}}}`}
                        onClick={() => handleInsertVariable(v.key)}
                        clickable
                      />
                    </Tooltip>
                  ))}
                </Box>
              </Box>

              {greetingPreview && (
                <Box
                  mt={2}
                  p={1.5}
                  style={{ background: "rgba(124,58,237,0.08)", borderRadius: 8 }}
                >
                  <Typography variant="caption" color="textSecondary">
                    {i18n.t("groupGreeting.previewTitle")}
                  </Typography>
                  <Typography variant="body2" style={{ whiteSpace: "pre-wrap" }}>
                    {greetingPreview}
                  </Typography>
                </Box>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handlePreviewGreeting} disabled={!greetingMessage.trim()}>
            {i18n.t("groupGreeting.preview")}
          </Button>
          <Button onClick={() => setGreetingOpen(false)}>
            {i18n.t("groupManager.cancel")}
          </Button>
          <Button
            onClick={handleSaveGreeting}
            color="primary"
            variant="contained"
            disabled={actionLoading || greetingLoading}
          >
            {actionLoading ? <CircularProgress size={20} /> : i18n.t("groupGreeting.save")}
          </Button>
        </DialogActions>
      </Dialog>
    </MainContainer>
  );
};

export default GroupManager;
