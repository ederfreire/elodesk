import React, {
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import toastError from "../../errors/toastError";
import { areNotificationsDisabled } from "../../helpers/notificationPrefs";
import { requestDesktopNotificationPermission, showDesktopNotification } from "../../helpers/desktopNotification";
import Popover from "@material-ui/core/Popover";
import { RiChat1Line } from "react-icons/ri";
import { MdChatBubbleOutline } from "react-icons/md";
import {
  Avatar,
  Badge,
  Box,
  IconButton,
  Typography,
} from "@material-ui/core";
import api from "../../services/api";
import { isArray } from "lodash";
import { useDate } from "../../hooks/useDate";
import { AuthContext } from "../../context/Auth/AuthContext";

import notifySound from "../../assets/chat_notify.mp3";
import useSound from "use-sound";
import { i18n } from "../../translate/i18n";
import { useHistory } from "react-router-dom";
import { socketConnection } from "../../services/socket";

const useStyles = makeStyles((theme) => ({
  popoverPaper: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 16,
    overflow: "hidden",
    boxShadow:
      "0 20px 60px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.08)",
    border: `1px solid ${
      theme.palette.type === "dark"
        ? "rgba(255,255,255,0.08)"
        : "rgba(0,0,0,0.06)"
    }`,
    [theme.breakpoints.down("sm")]: {
      maxWidth: 320,
    },
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px 12px",
    borderBottom: `1px solid ${
      theme.palette.type === "dark"
        ? "rgba(255,255,255,0.06)"
        : "rgba(0,0,0,0.06)"
    }`,
    background:
      theme.palette.type === "dark"
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
    backgroundColor: "#ef4444",
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
      background:
        theme.palette.type === "dark"
          ? "rgba(255,255,255,0.12)"
          : "rgba(0,0,0,0.12)",
    },
  },
  chatItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 16px",
    cursor: "pointer",
    transition: "background 0.15s ease",
    borderBottom: `1px solid ${
      theme.palette.type === "dark"
        ? "rgba(255,255,255,0.04)"
        : "rgba(0,0,0,0.04)"
    }`,
    "&:hover": {
      background:
        theme.palette.type === "dark"
          ? "rgba(255,255,255,0.05)"
          : "rgba(0,0,0,0.03)",
    },
    "&:last-child": { borderBottom: "none" },
  },
  avatar: {
    width: 40,
    height: 40,
    fontSize: 15,
    fontWeight: 600,
    backgroundColor:
      theme.palette.type === "dark" ? "#374151" : "#e2e8f0",
    color: theme.palette.type === "dark" ? "#d1d5db" : "#64748b",
    flexShrink: 0,
  },
  contentWrapper: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  topRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  contactName: {
    fontSize: 13,
    fontWeight: 600,
    color: theme.palette.text.primary,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
  },
  timestamp: {
    fontSize: 11,
    color: theme.palette.type === "dark" ? "#6b7280" : "#94a3b8",
    flexShrink: 0,
    fontWeight: 500,
  },
  bottomRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  lastMessage: {
    fontSize: 12,
    color: theme.palette.type === "dark" ? "#9ca3af" : "#64748b",
    flex: 1,
    lineHeight: 1.4,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    wordBreak: "break-word",
  },
  unreadBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#22c55e",
    color: "#fff",
    fontSize: 11,
    fontWeight: 700,
    padding: "0 5px",
    flexShrink: 0,
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

const reducer = (state, action) => {
  if (action.type === "LOAD_CHATS") {
    const chats = action.payload;
    const newChats = [];

    if (isArray(chats)) {
      chats.forEach((chat) => {
        const chatIndex = state.findIndex((u) => u.id === chat.id);
        if (chatIndex !== -1) {
          state[chatIndex] = chat;
        } else {
          newChats.push(chat);
        }
      });
    }

    return [...state, ...newChats];
  }

  if (action.type === "UPDATE_CHATS") {
    const chat = action.payload;
    const chatIndex = state.findIndex((u) => u.id === chat.id);

    if (chatIndex !== -1) {
      state[chatIndex] = chat;
      return [...state];
    } else {
      return [chat, ...state];
    }
  }

  if (action.type === "DELETE_CHAT") {
    const chatId = action.payload;

    const chatIndex = state.findIndex((u) => u.id === chatId);
    if (chatIndex !== -1) {
      state.splice(chatIndex, 1);
    }
    return [...state];
  }

  if (action.type === "RESET") {
    return [];
  }

  if (action.type === "CHANGE_CHAT") {
    const updatedChat = action.payload.chat;
    if (!updatedChat) return state;
    const changedChats = state.map((chat) => {
      if (chat.id === updatedChat.id) {
        return updatedChat;
      }
      return chat;
    });
    if (!state.find((chat) => chat.id === updatedChat.id)) {
      return [updatedChat, ...state];
    }
    return changedChats;
  }
};

const getInitials = (name) => {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
};

export default function ChatPopover(volume) {
  const classes = useStyles();
  const theme = useTheme();

  const { user: loggedUser } = useContext(AuthContext);
  const history = useHistory();

  const historyRef = useRef(history);
  const [loading, setLoading] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [searchParam] = useState("");
  const [chats, dispatch] = useReducer(reducer, []);
  const [invisible, setInvisible] = useState(true);
  const [unreadsTotal, setUnreadsTotal] = useState(0);
  const { datetimeToClient } = useDate();
  const [play] = useSound(notifySound, volume);
  const soundAlertRef = useRef();

  useEffect(() => {
    soundAlertRef.current = play;
  }, [play]);

  // Chat interno também usa a notificação nativa do sistema.
  useEffect(() => {
    requestDesktopNotificationPermission();
  }, []);

  useEffect(() => {
    dispatch({ type: "RESET" });
    setPageNumber(1);
  }, [searchParam]);

  useEffect(() => {
    setLoading(true);
    const delayDebounceFn = setTimeout(() => {
      fetchChats();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParam, pageNumber]);

  useEffect(() => {
    if (loggedUser.id) {
      const companyId = loggedUser.companyId;
      const socket = socketConnection({ companyId, userId: loggedUser.id });

      const onCompanyChatPopover = (data) => {
        if (data.action === "new-message") {
          dispatch({ type: "CHANGE_CHAT", payload: data });
          if (
            data.newMessage.senderId !== loggedUser.id &&
            data.chat.users.find((user) => user.userId === loggedUser.id)
          ) {
            if (!areNotificationsDisabled()) {
              soundAlertRef.current();
            }

            const remetente =
              data.newMessage?.sender?.name ||
              data.chat?.title ||
              "Chat interno";

            showDesktopNotification({
              title: remetente,
              body: data.newMessage?.message || "",
              tag: `chat-${data.chat?.id}`,
              onClick: () => {
                historyRef.current.push(`/chats/${data.chat?.uuid || ""}`);
              },
            });
          }
        }
        if (data.action === "update") {
          dispatch({ type: "CHANGE_CHAT", payload: data });
        }
      };

      socket.on(`company-${companyId}-chat`, onCompanyChatPopover);

      return () => {
        socket.off(`company-${companyId}-chat`, onCompanyChatPopover);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedUser.id, loggedUser.companyId]);

  useEffect(() => {
    let unreadsCount = 0;
    if (chats.length > 0) {
      for (let chat of chats) {
        for (let chatUser of chat.users) {
          if (chatUser.userId === loggedUser.id) {
            unreadsCount += chatUser.unreads;
          }
        }
      }
    }
    setUnreadsTotal(unreadsCount);
    if (unreadsCount > 0) {
      setInvisible(false);
    } else {
      setInvisible(true);
    }
  }, [chats, loggedUser.id]);

  const fetchChats = async () => {
    try {
      const { data } = await api.get("/chats/", {
        params: { searchParam, pageNumber },
      });
      dispatch({ type: "LOAD_CHATS", payload: data.records });
      setHasMore(data.hasMore);
      setLoading(false);
    } catch (err) {
      toastError(err);
    }
  };

  const loadMore = () => {
    setPageNumber((prevState) => prevState + 1);
  };

  const handleScroll = (e) => {
    if (!hasMore || loading) return;
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - (scrollTop + 100) < clientHeight) {
      loadMore();
    }
  };

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
    setInvisible(true);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const goToMessages = (chat) => {
    window.location.href = `/chats/${chat.uuid}`;
  };

  const getChatTitle = (item) => {
    if (typeof item.lastMessage === "string") {
      return item.title || i18n.t("chatPage.chat");
    }
    return (
      item.lastMessage?.sender?.name ||
      item.title ||
      i18n.t("chatPage.chat")
    );
  };

  const getChatLastMessage = (item) => {
    if (typeof item.lastMessage === "string") return item.lastMessage;
    return item.lastMessage?.message || i18n.t("chatPage.noMessages");
  };

  const getChatUnreads = (item) => {
    if (!item?.users) return 0;
    const me = item.users.find((u) => u.userId === loggedUser.id);
    return me?.unreads || 0;
  };

  const open = Boolean(anchorEl);
  const id = open ? "simple-popover" : undefined;

  return (
    <div>
      <IconButton
        aria-describedby={id}
        variant="contained"
        color={invisible ? "default" : "inherit"}
        onClick={handleClick}
        size="small"
        style={{
          borderRadius: "6px",
          padding: "6px",
          fontSize: "13px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <Badge
          color="error"
          badgeContent={unreadsTotal}
          max={99}
          invisible={invisible}
          overlap="rectangular"
          anchorOrigin={{ vertical: "top", horizontal: "right" }}
          sx={{
            "& .MuiBadge-badge": {
              backgroundColor: "#ef4444 !important",
              color: "#fff",
              fontSize: 9,
              fontWeight: 700,
              minWidth: 16,
              height: 16,
              borderRadius: "8px",
              boxShadow: "0 2px 6px rgba(239,68,68,0.4)",
              padding: "0 3px",
              top: -2,
              right: -4,
            },
          }}
        >
          <RiChat1Line size={20} color="#6b7280" />
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
              {i18n.t("chatPage.internalChat") || "Chat Interno"}
            </Typography>
            {unreadsTotal > 0 && (
              <span className={classes.headerBadge}>{unreadsTotal}</span>
            )}
          </Box>
        </Box>

        {/* List */}
        <Box className={classes.listContainer} onScroll={handleScroll}>
          {isArray(chats) && chats.length === 0 ? (
            <Box className={classes.emptyState}>
              <MdChatBubbleOutline className={classes.emptyIcon} />
              <Typography className={classes.emptyText}>
                {i18n.t("mainDrawer.appBar.notRegister")}
              </Typography>
            </Box>
          ) : (
            chats.map((item) => {
              const unreads = getChatUnreads(item);
              return (
                <Box
                  key={item.id}
                  className={classes.chatItem}
                  onClick={() => goToMessages(item)}
                >
                  <Avatar className={classes.avatar}>
                    {getInitials(getChatTitle(item))}
                  </Avatar>
                  <Box className={classes.contentWrapper}>
                    <Box className={classes.topRow}>
                      <Typography className={classes.contactName}>
                        {getChatTitle(item)}
                      </Typography>
                      <Typography className={classes.timestamp}>
                        {datetimeToClient(item.updatedAt)}
                      </Typography>
                    </Box>
                    <Box className={classes.bottomRow}>
                      <Typography className={classes.lastMessage}>
                        {getChatLastMessage(item)}
                      </Typography>
                      {unreads > 0 && (
                        <span className={classes.unreadBadge}>{unreads}</span>
                      )}
                    </Box>
                  </Box>
                </Box>
              );
            })
          )}
        </Box>
      </Popover>
    </div>
  );
}
