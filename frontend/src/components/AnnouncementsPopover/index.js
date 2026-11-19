import React, { useEffect, useReducer, useState, useContext } from "react";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import toastError from "../../errors/toastError";
import Popover from "@material-ui/core/Popover";
import { RiMegaphoneLine } from "react-icons/ri";

import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";

import {
  Avatar,
  Badge,
  Box,
  IconButton,
  Dialog,
  Typography,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  DialogContentText,
} from "@material-ui/core";
import api from "../../services/api";
import { isArray } from "lodash";
import moment from "moment";

const useStyles = makeStyles((theme) => ({
  popoverPaper: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 16,
    overflow: "hidden",
    boxShadow: "0 20px 60px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.08)",
    border: `1px solid ${theme.palette.type === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
    [theme.breakpoints.down("sm")]: {
      maxWidth: 320,
    },
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px 12px",
    borderBottom: `1px solid ${theme.palette.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
    background: theme.palette.type === "dark"
      ? "linear-gradient(135deg, #1e1e2e 0%, #2a2a3e 100%)"
      : "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: theme.palette.text.primary,
    letterSpacing: "-0.01em",
  },
  headerBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 28,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#f59e0b",
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    padding: "0 8px",
  },
  listContainer: {
    overflowY: "auto",
    maxHeight: 400,
    padding: "4px 0",
    background: theme.palette.type === "dark" ? "#1a1a2e" : "#fff",
    "&::-webkit-scrollbar": { width: 5 },
    "&::-webkit-scrollbar-thumb": {
      borderRadius: 10,
      background: theme.palette.type === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)",
    },
  },
  item: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "12px 16px",
    cursor: "pointer",
    transition: "background 0.15s ease",
    borderBottom: `1px solid ${theme.palette.type === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
    "&:hover": {
      background: theme.palette.type === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
    },
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: theme.palette.text.primary,
    lineHeight: 1.3,
  },
  itemText: {
    fontSize: 12,
    color: theme.palette.type === "dark" ? "#9ca3af" : "#64748b",
    lineHeight: 1.4,
    marginTop: 4,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  itemDate: {
    fontSize: 11,
    color: theme.palette.type === "dark" ? "#6b7280" : "#94a3b8",
    marginTop: 4,
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px 20px",
    gap: 12,
  },
  emptyIcon: {
    color: theme.palette.type === "dark" ? "#374151" : "#cbd5e1",
    fontSize: 48,
  },
  emptyText: {
    fontSize: 14,
    color: theme.palette.type === "dark" ? "#6b7280" : "#94a3b8",
    fontWeight: 500,
  },
}));

function AnnouncementDialog({ announcement, open, handleClose, onDismiss }) {
  return (
    <Dialog
      open={open}
      onClose={() => handleClose()}
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
    >
      <DialogTitle id="alert-dialog-title">{announcement.title}</DialogTitle>
      <DialogContent>
        {announcement.mediaPath && (
          <div
            style={{
              border: "1px solid #f1f1f1",
              margin: "0 auto 20px",
              textAlign: "center",
              width: "95%",
              height: 300,
              backgroundRepeat: "no-repeat",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <img
              alt={`announcement image`}
              src={announcement.mediaPath}
              style={{ width: "95%", height: "100%" }}
            />
          </div>
        )}
        <DialogContentText id="alert-dialog-description" style={{ whiteSpace: "pre-line" }}>
          {announcement.text}
        </DialogContentText>
      </DialogContent>
      <DialogActions style={{ justifyContent: "space-between", padding: "8px 16px" }}>
        <Button
          onClick={() => onDismiss(announcement)}
          color="default"
          size="small"
          style={{ fontSize: 12, textTransform: "none", color: "#888" }}
        >
          {i18n.t("announcementsPopover.dontShowAgain")}
        </Button>
        <Button onClick={() => handleClose()} color="primary" autoFocus>
          {i18n.t("announcementsPopover.close")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const reducer = (state, action) => {
  if (action.type === "LOAD_ANNOUNCEMENTS") {
    const announcements = action.payload;
    const newAnnouncements = [];

    if (isArray(announcements)) {
      announcements.forEach((announcement) => {
        const announcementIndex = state.findIndex((u) => u.id === announcement.id);
        if (announcementIndex !== -1) {
          state[announcementIndex] = announcement;
        } else {
          newAnnouncements.push(announcement);
        }
      });
    }

    return [...state, ...newAnnouncements];
  }

  if (action.type === "UPDATE_ANNOUNCEMENTS") {
    const announcement = action.payload;
    const announcementIndex = state.findIndex((u) => u.id === announcement.id);

    if (announcementIndex !== -1) {
      state[announcementIndex] = announcement;
      return [...state];
    } else {
      return [announcement, ...state];
    }
  }

  if (action.type === "DELETE_ANNOUNCEMENT") {
    const announcementId = action.payload;
    const announcementIndex = state.findIndex((u) => u.id === announcementId);
    if (announcementIndex !== -1) {
      state.splice(announcementIndex, 1);
    }
    return [...state];
  }

  if (action.type === "RESET") {
    return [];
  }
};

export default function AnnouncementsPopover() {
  const classes = useStyles();
  const theme = useTheme();

  const [loading, setLoading] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [searchParam] = useState("");
  const [announcements, dispatch] = useReducer(reducer, []);
  const [invisible, setInvisible] = useState(false);
  const [announcement, setAnnouncement] = useState({});
  const [showAnnouncementDialog, setShowAnnouncementDialog] = useState(false);
  const [dismissedMap, setDismissedMap] = useState(() => {
    try {
      const stored = localStorage.getItem("announcementsDismissed");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const { user, socket } = useContext(AuthContext);

  useEffect(() => {
    dispatch({ type: "RESET" });
    setPageNumber(1);
  }, [searchParam]);

  useEffect(() => {
    setLoading(true);
    const delayDebounceFn = setTimeout(() => {
      fetchAnnouncements();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParam, pageNumber]);

  useEffect(() => {
    if (user.companyId && socket) {
      const onCompanyAnnouncement = (data) => {
        if (data.action === "update" || data.action === "create") {
          dispatch({ type: "UPDATE_ANNOUNCEMENTS", payload: data.record });
          setDismissedMap(prev => {
            const updated = { ...prev };
            delete updated[data.record.id];
            try { localStorage.setItem("announcementsDismissed", JSON.stringify(updated)); } catch {}
            return updated;
          });
          setInvisible(false);
        }
        if (data.action === "delete") {
          dispatch({ type: "DELETE_ANNOUNCEMENT", payload: +data.id });
        }
      };
      socket.on(`company-announcement`, onCompanyAnnouncement);

      return () => {
        socket.off(`company-announcement`, onCompanyAnnouncement);
      };
    }
    return undefined;
  }, [user, socket]);

  const fetchAnnouncements = async () => {
    try {
      const { data } = await api.get("/announcements/for-company", {
        params: { searchParam, pageNumber },
      });
      dispatch({ type: "LOAD_ANNOUNCEMENTS", payload: data.records });
      setHasMore(data.hasMore);
      setLoading(false);
    } catch (err) {
      toastError(err);
    }
  };

  const loadMore = () => setPageNumber((prevState) => prevState + 1);

  const handleScroll = (e) => {
    if (!hasMore || loading) return;
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - (scrollTop + 100) < clientHeight) loadMore();
  };

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
    setInvisible(true);
  };

  const handleDismissAnnouncement = (ann) => {
    const updatedAtKey = ann.updatedAt || ann.createdAt;
    setDismissedMap(prev => {
      const updated = { ...prev, [ann.id]: updatedAtKey };
      try { localStorage.setItem("announcementsDismissed", JSON.stringify(updated)); } catch {}
      return updated;
    });
    setShowAnnouncementDialog(false);
    import("react-toastify").then(({ toast }) => {
      toast.info(i18n.t("announcementsPopover.dismissedToast"), { autoClose: 4000 });
    }).catch(() => {});
  };

  const visibleAnnouncements = isArray(announcements) ? announcements.filter(item => {
    const dismissedAt = dismissedMap[item.id];
    if (!dismissedAt) return true;
    return item.updatedAt && item.updatedAt !== dismissedAt;
  }) : [];

  const handleClose = () => setAnchorEl(null);

  const priorityColor = (priority) => {
    if (priority === 1) return "#b81111";
    if (priority === 2) return "#f59e0b";
    return "#94a3b8";
  };

  const handleShowAnnouncementDialog = (record) => {
    setAnnouncement(record);
    setShowAnnouncementDialog(true);
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);
  const id = open ? "simple-popover" : undefined;

  return (
    <div>
      <AnnouncementDialog
        announcement={announcement}
        open={showAnnouncementDialog}
        handleClose={() => setShowAnnouncementDialog(false)}
        onDismiss={handleDismissAnnouncement}
      />
      <IconButton
        variant="contained"
        aria-describedby={id}
        onClick={handleClick}
        size="small"
        style={{ padding: 6 }}
      >
        <Badge
          color="secondary"
          variant="dot"
          invisible={invisible || visibleAnnouncements.length < 1}
          componentsProps={{
            badge: {
              style: {
                backgroundColor: "#f59e0b",
                width: 10,
                height: 10,
                minWidth: 10,
                borderRadius: "50%",
                boxShadow: "0 2px 6px rgba(245,158,11,0.4)",
                top: 4,
                right: 4,
              }
            }
          }}
        >
          <RiMegaphoneLine size={20} color="#6b7280" />
        </Badge>
      </IconButton>
      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        classes={{ paper: classes.popoverPaper }}
      >
        {/* Header */}
        <Box className={classes.header}>
          <Box style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Typography className={classes.headerTitle}>
              {i18n.t("mainDrawer.appBar.user.informations")}
            </Typography>
            {visibleAnnouncements.length > 0 && (
              <span className={classes.headerBadge}>{visibleAnnouncements.length}</span>
            )}
          </Box>
        </Box>

        {/* List */}
        <Box className={classes.listContainer} onScroll={handleScroll}>
          {visibleAnnouncements.length === 0 ? (
            <Box className={classes.emptyState}>
              <RiMegaphoneLine className={classes.emptyIcon} />
              <Typography className={classes.emptyText}>
                {i18n.t("mainDrawer.appBar.notRegister")}
              </Typography>
            </Box>
          ) : (
            visibleAnnouncements.map((item, key) => (
              <Box
                key={key}
                className={classes.item}
                onClick={() => handleShowAnnouncementDialog(item)}
                style={{ borderLeft: `4px solid ${priorityColor(item.priority)}` }}
              >
                {item.mediaPath && (
                  <Avatar src={item.mediaPath} style={{ width: 36, height: 36 }} />
                )}
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Typography className={classes.itemTitle}>{item.title}</Typography>
                  <Typography className={classes.itemText}>{item.text}</Typography>
                  <Typography className={classes.itemDate}>
                    {moment(item.createdAt).format("DD/MM/YYYY")}
                  </Typography>
                </Box>
              </Box>
            ))
          )}
        </Box>
      </Popover>
    </div>
  );
}
