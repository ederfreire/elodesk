import { makeStyles } from "@material-ui/styles";
import React from "react";

const useStyles = makeStyles(theme => ({
    tag: {
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: "0.7em",
        fontWeight: 700,
        color: theme.palette.type === "dark" ? "#e6e6f0" : "#3b3b54",
        backgroundColor: theme.palette.type === "dark" ? "#2a2a3a" : "#f3f2fb",
        border: theme.palette.type === "dark" ? "1px solid #3a3a4d" : "1px solid #e4e2f3",
        marginRight: "4px",
        marginTop: "2px",
        whiteSpace: "nowrap",
        lineHeight: 1.3,
        letterSpacing: "0.4px",
        textTransform: "uppercase",
        boxShadow: "none"
    },
    dot: {
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        flexShrink: 0,
    }
}));

const ContactTag = ({ tag }) => {
    const classes = useStyles();

    return (
        <div className={classes.tag}>
           <span className={classes.dot} style={{ backgroundColor: tag.color || "#3AC0E7" }} />
           {(tag.name || tag.label || tag.title || "").toUpperCase()}
        </div>
    )
}

export default ContactTag;