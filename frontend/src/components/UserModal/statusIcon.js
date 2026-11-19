import React from "react";
import { Tooltip, makeStyles } from "@material-ui/core";
import green from "@material-ui/core/colors/green";
import grey from "@material-ui/core/colors/grey";
import CheckCircleIcon from "@material-ui/icons/CheckCircle";
import ErrorIcon from "@material-ui/icons/Error";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles((theme) => ({
  on: {
    color: green[600],
    fontSize: "20px",
  },
  off: {
    color: grey[600],
    fontSize: "20px",
  },
}));

const UserStatusIcon = ({ user }) => {
  const classes = useStyles();
  if (!user || typeof user.online === "undefined") {
    return (
      <Tooltip title={i18n.t("hardcoded.unknown")}>
        <ErrorIcon className={classes.off} />
      </Tooltip>
    );
  }
  return user.online ? (
    <Tooltip title="Online">
      <CheckCircleIcon className={classes.on} />
    </Tooltip>
  ) : (
    <Tooltip title="Offline">
      <ErrorIcon className={classes.off} />
    </Tooltip>
  );
};

export default UserStatusIcon;
