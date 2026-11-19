import React, { useContext, useState } from "react";

import { Button, Menu, MenuItem } from "@material-ui/core";
import ExpandMoreIcon from "@material-ui/icons/ExpandMore";

import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";
import toastError from "../../errors/toastError";
import api from "../../services/api";

const languageFlags = {
    "pt": "🇧🇷",
    "pt-BR": "🇧🇷",
    "en": "🇺🇸",
    "es": "🇪🇸",
    "tr": "🇹🇷",
    "ar": "🇸🇦",
};

const languageCodes = {
    "pt": "BR",
    "pt-BR": "BR",
    "en": "EN",
    "es": "ES",
    "tr": "TR",
    "ar": "AR",
};

const UserLanguageSelector = () => {
    const [langueMenuAnchorEl, setLangueMenuAnchorEl] = useState(null);

    const { user, socket } = useContext(AuthContext);

    const handleOpenLanguageMenu = e => {
        setLangueMenuAnchorEl(e.currentTarget);
    };

    const handleCloseLanguageMenu = () => {
        setLangueMenuAnchorEl(null);
    };

    const handleChangeLanguage = async language => {
        try {
            await i18n.changeLanguage(language);
            await api.put(`/users/${user.id}`, { language });
        } catch (err) {
            toastError(err);
        }

        handleCloseLanguageMenu();
    };

    const currentLang = user.language || "pt-BR";

    return (
        <>
            <Button
                color="inherit"
                onClick={handleOpenLanguageMenu}
                endIcon={<ExpandMoreIcon style={{ fontSize: 16 }} />}
                style={{ minWidth: "auto", padding: "4px 8px", display: "flex", alignItems: "center", gap: 4 }}
            >
                <span style={{ fontSize: 18, lineHeight: 1 }}>{languageFlags[currentLang] || "🌐"}</span>
                <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.5 }}>{languageCodes[currentLang] || currentLang.toUpperCase()}</span>
            </Button>
            <Menu
                anchorEl={langueMenuAnchorEl}
                keepMounted
                open={Boolean(langueMenuAnchorEl)}
                onClose={handleCloseLanguageMenu}
            >
                <MenuItem onClick={() => handleChangeLanguage("pt-BR")} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18 }}>🇧🇷</span> {i18n.t("languages.pt-BR")}
                </MenuItem>
                <MenuItem onClick={() => handleChangeLanguage("en")} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18 }}>🇺🇸</span> {i18n.t("languages.en")}
                </MenuItem>
                <MenuItem onClick={() => handleChangeLanguage("es")} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18 }}>🇪🇸</span> {i18n.t("languages.es")}
                </MenuItem>
            </Menu>
        </>
    );
};

export default UserLanguageSelector;
