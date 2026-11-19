import React, { useState, useEffect, useContext, Suspense, useCallback, useRef } from "react";
import { useParams, useHistory } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import { useTheme, useMediaQuery } from "@material-ui/core";
import Button from "@material-ui/core/Button";
import Box from "@material-ui/core/Box";
import BottomNavigation from "@material-ui/core/BottomNavigation";
import BottomNavigationAction from "@material-ui/core/BottomNavigationAction";
import ChatIcon from "@material-ui/icons/Chat";
import QuestionAnswerIcon from "@material-ui/icons/QuestionAnswer";
import WhatsAppIcon from "@material-ui/icons/WhatsApp";
import AccessTimeIcon from "@material-ui/icons/AccessTime";
import GroupIcon from "@material-ui/icons/Group";
import CircularProgress from "@material-ui/core/CircularProgress";

import TicketsManagerTabs from "../../components/TicketsManagerTabs/";
import TicketAdvancedLayout from "../../components/TicketAdvancedLayout";
import { TicketsContext } from "../../context/Tickets/TicketsContext";
import { AuthContext } from "../../context/Auth/AuthContext";
import { i18n } from "../../translate/i18n";
import { QueueSelectedProvider } from "../../context/QueuesSelected/QueuesSelectedContext";
import useSettings from "../../hooks/useSettings";

const Ticket = React.lazy(() => import("../../components/Ticket/"));

const desktopTabCycle = ["open", "pending", "group"];
const tabLabels = {
  open: i18n.t("ticketsList.assignedHeader"),
  pending: i18n.t("ticketsList.pendingHeader"),
  group: i18n.t("ticketsList.groupingHeader"),
};

const useStyles = makeStyles((theme) => ({
  header: {},
  content: {
    overflowY: "auto",
    overflowX: "hidden",
    minHeight: 0,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    "@media (max-width: 960px)": {
      flex: 1,
      minHeight: 0,
      height: "100%",
      maxHeight: "100%",
      overflow: "hidden",
    },
  },
  placeholderContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    background: theme.palette.tabHeaderBackground,
  },
  placeholderItem: {},
  placeholderLogo: {
    maxWidth: 220,
    maxHeight: 90,
    objectFit: "contain",
    marginBottom: theme.spacing(2),
  },
  bottomNavAction: {
    minWidth: 60,
    color: "#8a8a8a",
    "& svg": { fontSize: 24 },
    "& .MuiBottomNavigationAction-label": {
      fontSize: 11,
      fontWeight: 500,
      color: "#8a8a8a",
    },
    "& .MuiBottomNavigationAction-label.Mui-selected": {
      fontSize: 11,
      color: "#8a8a8a",
    },
    "&.Mui-selected": {
      color: "#8a8a8a",
    },
  },
  subTabLabel: {
    fontSize: 9,
    fontWeight: 600,
    color: "#8a8a8a",
    backgroundColor: "rgba(138,138,138,0.15)",
    borderRadius: 8,
    padding: "1px 6px",
    marginTop: 2,
  },
  mobileFooter: {
    display: "flex",
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-around",
    padding: theme.spacing(0.25, 0),
    paddingBottom: "calc(2px + env(safe-area-inset-bottom, 0px))",
    borderTop: `1px solid ${theme.palette.divider}`,
    background: theme.palette.background.paper,
    position: "fixed",
    bottom: 0,
    left: 0,
    width: "100%",
    zIndex: 1100,
  },
  mobileTab: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing(0.25, 0),
    cursor: "pointer",
    color: "#8a8a8a",
    position: "relative",
    "& svg": { fontSize: 19 },
    "& .mobileTabLabel": {
      fontSize: 9,
      fontWeight: 500,
      color: "#8a8a8a",
    },
  },
  mobileTabIconWrap: {
    position: "relative",
    display: "inline-flex",
  },
  mobileTabBadge: {
    position: "absolute",
    top: -6,
    right: -10,
    minWidth: 16,
    height: 16,
    padding: "0 4px",
    borderRadius: 999,
    background: "#f5365c",
    color: "#fff",
    fontSize: 10,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
    boxSizing: "border-box",
  },
  mobileTabActive: {
    "&::after": {
      content: '""',
      position: "absolute",
      bottom: 0,
      left: "30%",
      right: "30%",
      height: 3,
      borderRadius: 2,
      background: "#8a8a8a",
    },
  },
}));

const TicketAdvanced = () => {
  const classes = useStyles();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { getPublicSetting } = useSettings();
  const [showChatLogo, setShowChatLogo] = useState(false);
  const { ticketId } = useParams();
  const history = useHistory();
  const [option, setOption] = useState(0);
  const { user } = useContext(AuthContext);
  const {
    currentTicket,
    setCurrentTicket,
    tabOpen,
    setTabOpen,
    openCount,
    pendingCount,
    groupingCount,
  } = useContext(TicketsContext);
  const [subTabIndex, setSubTabIndex] = useState(0);
  const tabCycle = user?.allowGroup ? ["open", "pending", "group"] : ["open", "pending"];
  const footerRef = useRef(null);
  const [footerHeight, setFooterHeight] = useState(44);

  useEffect(() => {
    if (!isMobile) return;
    const el = footerRef.current;
    if (!el) return;
    const update = () => setFooterHeight(el.offsetHeight || 44);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [isMobile, ticketId, user?.allowGroup]);

  useEffect(() => {
    if (currentTicket.id !== null) {
      setCurrentTicket({ id: currentTicket.id, code: "#open" });
    }
    if (!ticketId) {
      setOption(1);
    }
    return () => {
      setCurrentTicket({ id: null, code: null });
    };
  }, []);

  useEffect(() => {
    if (currentTicket.id !== null) {
      setOption(0);
    }
  }, [currentTicket]);

  useEffect(() => {
    let isMounted = true;
    getPublicSetting("showLogoInChat")
      .then((value) => {
        if (isMounted) setShowChatLogo(value === "enabled" || value === true);
      })
      .catch(() => {
        if (isMounted) setShowChatLogo(false);
      });
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.companyId]);

  useEffect(() => {
    const idx = tabCycle.indexOf(tabOpen);
    if (idx !== -1) {
      setSubTabIndex(idx);
    }
  }, [tabCycle, tabOpen]);

  const handleAtendimentosClick = useCallback(() => {
    const currentIndex = tabCycle.indexOf(tabOpen);
    const nextIndex = ((currentIndex === -1 ? 0 : currentIndex) + 1) % tabCycle.length;

    if (isMobile) {
      if (ticketId) {
        history.push("/tickets");
      }
      setSubTabIndex(nextIndex);
      setTabOpen(tabCycle[nextIndex]);
    } else {
      if (option === 1) {
        setSubTabIndex(nextIndex);
        setTabOpen(tabCycle[nextIndex]);
      } else {
        setOption(1);
      }
    }
  }, [isMobile, option, tabCycle, tabOpen, setTabOpen, ticketId, history]);

  const renderPlaceholder = () => (
    <Box className={classes.placeholderContainer}>
      {showChatLogo && (
        <img
          src={theme.mode === "dark" ? theme.calculatedLogoDark() : theme.calculatedLogoLight()}
          alt=""
          className={classes.placeholderLogo}
        />
      )}
      <div className={classes.placeholderItem}>{i18n.t("chat.noTicketMessage")}</div>
      {!isMobile && (
        <>
          <br />
          <Button onClick={() => setOption(1)} variant="contained" color="primary">
            Selecionar Ticket
          </Button>
        </>
      )}
    </Box>
  );

  const renderMessageContext = () => {
    if (ticketId && ticketId !== "undefined") {
      return (
        <Suspense fallback={<Box display="flex" justifyContent="center" alignItems="center" height="100%"><CircularProgress /></Box>}>
          <Ticket />
        </Suspense>
      );
    }
    return renderPlaceholder();
  };

  const renderTicketsManagerTabs = () => <TicketsManagerTabs />;

  const handleMobileTab = (key) => {
    if (ticketId) history.push("/tickets");
    if (!isMobile) setOption(1);
    const idx = tabCycle.indexOf(key);
    if (idx !== -1) {
      setSubTabIndex(idx);
      setTabOpen(key);
    }
  };

  const renderMobileFooter = () => {
    const tabs = [
      { key: "open", label: i18n.t("ticketsList.assignedHeader"), icon: <WhatsAppIcon />, count: openCount },
      { key: "pending", label: i18n.t("ticketsList.pendingHeader"), icon: <AccessTimeIcon />, count: pendingCount },
    ];
    if (user?.allowGroup) {
      tabs.push({ key: "group", label: i18n.t("ticketsList.groupingHeader"), icon: <GroupIcon />, count: groupingCount });
    }
    return (
      <Box className={classes.mobileFooter} ref={footerRef}>
        {tabs.map((t) => {
          const active = tabOpen === t.key;
          return (
            <Box
              key={t.key}
              className={`${classes.mobileTab} ${active ? classes.mobileTabActive : ""}`}
              onClick={() => handleMobileTab(t.key)}
            >
              <span className={classes.mobileTabIconWrap}>
                {t.icon}
                {t.count > 0 && (
                  <span className={classes.mobileTabBadge}>{t.count}</span>
                )}
              </span>
              <span className="mobileTabLabel">{t.label}</span>
            </Box>
          );
        })}
      </Box>
    );
  };

  const renderDesktopHeader = () => (
    <BottomNavigation
      value={option}
      onChange={(event, newValue) => {
        if (newValue === 1) {
          handleAtendimentosClick();
        } else {
          setOption(0);
        }
      }}
      showLabels
    >
      <BottomNavigationAction
        label={i18n.t("ticketsAdvanced.ticket")}
        icon={<ChatIcon />}
        className={classes.bottomNavAction}
      />
      <BottomNavigationAction
        label={
          <Box display="flex" flexDirection="column" alignItems="center">
            <span>{i18n.t("ticketsAdvanced.services")}</span>
            {option === 1 && (
              <span className={classes.subTabLabel}>{tabLabels[tabCycle[subTabIndex]]}</span>
            )}
          </Box>
        }
        icon={<QuestionAnswerIcon />}
        className={classes.bottomNavAction}
      />
    </BottomNavigation>
  );

  return (
    <QueueSelectedProvider>
      <TicketAdvancedLayout hasTicket={!!ticketId}>
        {!isMobile && <Box className={classes.header}>{renderDesktopHeader()}</Box>}
        <Box className={classes.content} style={isMobile ? (ticketId ? { overflow: "hidden", paddingBottom: `calc(${footerHeight}px + env(safe-area-inset-bottom, 0px))`, flex: 1, minHeight: 0, height: "100%", maxHeight: "100%", boxSizing: "border-box" } : {}) : { paddingBottom: "calc(64px + env(safe-area-inset-bottom, 0px))", boxSizing: "border-box" }}>
         {isMobile
           ? (ticketId ? renderMessageContext() : renderTicketsManagerTabs())
           : option === 0 ? renderMessageContext() : renderTicketsManagerTabs()}
        </Box>
        {renderMobileFooter()}
      </TicketAdvancedLayout>
    </QueueSelectedProvider>
  );
};

export default TicketAdvanced;
