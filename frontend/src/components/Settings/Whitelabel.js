import React, { useEffect, useState, useContext, useRef } from "react";

import Grid from "@material-ui/core/Grid";
import FormControl from "@material-ui/core/FormControl";
import TextField from "@material-ui/core/TextField";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import Divider from "@material-ui/core/Divider";
import Box from "@material-ui/core/Box";
import useSettings from "../../hooks/useSettings";
import { toast } from "react-toastify";
import { makeStyles } from "@material-ui/core/styles";
import OnlyForSuperUser from "../OnlyForSuperUser";
import useAuth from "../../hooks/useAuth.js";

import { IconButton, InputAdornment } from "@material-ui/core";

import Colorize from "@material-ui/icons/Colorize";
import AttachFile from "@material-ui/icons/AttachFile";
import Delete from "@material-ui/icons/Delete";
import Palette from "@material-ui/icons/Palette";
import Image from "@material-ui/icons/Image";
import Language from "@material-ui/icons/Language";
import Apps from "@material-ui/icons/Apps";
import ColorPicker from "../ColorPicker";
import ColorModeContext from "../../layout/themeContext";
import api from "../../services/api";
import { getBackendUrl } from "../../config";

import defaultLogoLight from "../../assets/logo1.png";
import defaultLogoDark from "../../assets/logo2.png";
import ColorBoxModal from "../ColorBoxModal/index.js";
import Checkbox from "@material-ui/core/Checkbox";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import { i18n } from "../../translate/i18n";

const defaultLogoFavicon = "/favicon.ico";

const useStyles = makeStyles((theme) => ({
  container: {
    paddingTop: theme.spacing(2),
    paddingBottom: theme.spacing(4),
  },
  sectionPaper: {
    padding: theme.spacing(3),
    marginBottom: theme.spacing(3),
    borderRadius: theme.spacing(1),
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    [theme.breakpoints.down("sm")]: {
      padding: theme.spacing(2),
      marginBottom: theme.spacing(2),
    },
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    marginBottom: theme.spacing(2),
    [theme.breakpoints.down("sm")]: {
      marginBottom: theme.spacing(1.5),
    },
  },
  sectionIcon: {
    marginRight: theme.spacing(1),
    color: theme.palette.primary.main,
  },
  sectionTitle: {
    fontWeight: 600,
    color: theme.palette.text.primary,
    [theme.breakpoints.down("sm")]: {
      fontSize: "1.1rem",
    },
  },
  sectionSubtitle: {
    color: theme.palette.text.secondary,
    fontSize: "0.875rem",
    marginTop: theme.spacing(0.5),
    [theme.breakpoints.down("sm")]: {
      fontSize: "0.8rem",
    },
  },
  formField: {
    marginBottom: theme.spacing(2),
    [theme.breakpoints.down("sm")]: {
      marginBottom: theme.spacing(1.5),
    },
  },
  colorAdorment: {
    width: 20,
    height: 20,
    borderRadius: 4,
    border: "1px solid #ddd",
  },
  uploadInput: {
    display: "none",
  },
  uploadField: {
    "& .MuiInputBase-input": {
      cursor: "pointer",
    },
  },
  previewContainer: {
    marginTop: theme.spacing(2),
    [theme.breakpoints.down("sm")]: {
      marginTop: theme.spacing(1),
    },
  },
  previewGrid: {
    [theme.breakpoints.down("sm")]: {
      justifyContent: "center",
    },
  },
  previewCard: {
    padding: theme.spacing(2),
    borderRadius: theme.spacing(1),
    border: "2px solid #e0e0e0",
    textAlign: "center",
    height: "120px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    [theme.breakpoints.down("sm")]: {
      height: "100px",
      padding: theme.spacing(1),
    },
  },
  previewCardLight: {
    backgroundColor: "#ffffff",
    borderColor: "#e0e0e0",
  },
  previewCardDark: {
    backgroundColor: "#424242",
    borderColor: "#666666",
  },
  previewCardFavicon: {
    backgroundColor: "#f5f5f5",
    borderColor: "#d0d0d0",
  },
  previewImage: {
    maxWidth: "100%",
    maxHeight: "80px",
    objectFit: "contain",
    [theme.breakpoints.down("sm")]: {
      maxHeight: "60px",
    },
  },
  previewBackgroundImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    borderRadius: theme.spacing(0.5),
  },
  previewLabel: {
    fontSize: "0.75rem",
    color: "#666",
    marginTop: theme.spacing(0.5),
    fontWeight: 500,
  },
  previewLabelDark: {
    color: "#ccc",
  },
  languageSection: {
    marginTop: theme.spacing(1),
  },
  languageGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: theme.spacing(1),
    [theme.breakpoints.down("sm")]: {
      gap: theme.spacing(0.5),
    },
  },
  languageItem: {
    display: "flex",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: theme.spacing(0.5),
    padding: theme.spacing(0.5, 1),
    minWidth: "120px",
    [theme.breakpoints.down("sm")]: {
      minWidth: "100px",
      padding: theme.spacing(0.5),
    },
  },
  languageCheckbox: {
    padding: theme.spacing(0.5),
  },
  languageLabel: {
    fontSize: "0.875rem",
    fontWeight: 500,
    [theme.breakpoints.down("sm")]: {
      fontSize: "0.8rem",
    },
  },
  colorSection: {
    [theme.breakpoints.down("sm")]: {
      "& .MuiGrid-item": {
        paddingBottom: theme.spacing(1),
      },
    },
  },
  logoSection: {
    [theme.breakpoints.down("sm")]: {
      "& .MuiGrid-item": {
        paddingBottom: theme.spacing(1),
      },
    },
  },
  divider: {
    margin: theme.spacing(2, 0),
    [theme.breakpoints.down("sm")]: {
      margin: theme.spacing(1.5, 0),
    },
  },
}));

const LANGUAGE_OPTIONS = [
  { code: "pt-BR", label: "Português" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

export default function Whitelabel(props) {
  const { settings } = props;
  const classes = useStyles();
  const [settingsLoaded, setSettingsLoaded] = useState({});

  const { getCurrentUserInfo } = useAuth();
  const [currentUser, setCurrentUser] = useState({});
  const [loading, setLoading] = useState(true);
  const { colorMode } = useContext(ColorModeContext);
  const [primaryColorLightModalOpen, setPrimaryColorLightModalOpen] =
    useState(false);
  const [primaryColorDarkModalOpen, setPrimaryColorDarkModalOpen] =
    useState(false);

  const logoLightInput = useRef(null);
  const logoDarkInput = useRef(null);
  const logoFaviconInput = useRef(null);
  const logoMobileInput = useRef(null);
  const backgroundLightInput = useRef(null);
  const backgroundDarkInput = useRef(null);
  const logoSplashInput = useRef(null);
  const appNameInput = useRef(null);
  const [appName, setAppName] = useState(settingsLoaded.appName || "");
  const [appNameMobile, setAppNameMobile] = useState(settingsLoaded.appNameMobile || "");
  const [enabledLanguages, setEnabledLanguages] = useState(["pt-BR", "en"]);

  const { update } = useSettings();

  function updateSettingsLoaded(key, value) {
    if (
      key === "primaryColorLight" ||
      key === "primaryColorDark" ||
      key === "appName"
    ) {
      localStorage.setItem(key, value);
    }
    const newSettings = { ...settingsLoaded };
    newSettings[key] = value;
    setSettingsLoaded(newSettings);
  }

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    getCurrentUserInfo().then((u) => {
      const userData = u.user || u;
      if (isMounted) {
        setCurrentUser(userData);
      }
    });

    if (Array.isArray(settings) && settings.length) {
      const primaryColorLight = settings.find(
        (s) => s.key === "primaryColorLight"
      )?.value;
      const primaryColorDark = settings.find(
        (s) => s.key === "primaryColorDark"
      )?.value;
      const appLogoLight = settings.find(
        (s) => s.key === "appLogoLight"
      )?.value;
      const appLogoDark = settings.find((s) => s.key === "appLogoDark")?.value;
      const appLogoFavicon = settings.find(
        (s) => s.key === "appLogoFavicon"
      )?.value;
      const appLogoMobile = settings.find(
        (s) => s.key === "appLogoMobile"
      )?.value;
      const appLogoBackgroundLight = settings.find(
        (s) => s.key === "appLogoBackgroundLight"
      )?.value;
      const appLogoBackgroundDark = settings.find(
        (s) => s.key === "appLogoBackgroundDark"
      )?.value;
      const appLogoSplash = settings.find(
        (s) => s.key === "appLogoSplash"
      )?.value;
      const appName = settings.find((s) => s.key === "appName")?.value;
      const showLogoInChat = settings.find(
        (s) => s.key === "showLogoInChat"
      )?.value;
      const appNameMobile = settings.find((s) => s.key === "appNameMobile")?.value;
      const enabledLanguagesSetting = settings.find(
        (s) => s.key === "enabledLanguages"
      )?.value;
      let langs = ["pt-BR", "en"];
      try {
        if (enabledLanguagesSetting) {
          langs = JSON.parse(enabledLanguagesSetting);
        }
      } catch { }

      if (isMounted) {
        setAppName(appName || "");
        setAppNameMobile(appNameMobile || "");
        setEnabledLanguages(langs);
        setSettingsLoaded({
          ...settingsLoaded,
          primaryColorLight,
          primaryColorDark,
          appLogoLight,
          appLogoDark,
          appLogoFavicon,
          appLogoMobile,
          appLogoBackgroundLight,
          appLogoBackgroundDark,
          appLogoSplash,
          appName,
          appNameMobile,
          showLogoInChat: showLogoInChat || "disabled",
          enabledLanguages: langs,
        });
        setLoading(false);
      }
    }
    else {
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSaveSetting(key, value) {
    await update({
      key,
      value,
    });
    updateSettingsLoaded(key, value);
    toast.success(i18n.t("whitelabelSettings.operationUpdated"));
  }

  async function handleSaveEnabledLanguages(newLangs) {
    await handleSaveSetting("enabledLanguages", newLangs);
    setEnabledLanguages(newLangs);
  }

  const uploadLogo = async (e, mode) => {
    if (!e.target.files) {
      return;
    }

    const file = e.target.files[0];
    const formData = new FormData();

    formData.append("typeArch", "logo");
    formData.append("mode", mode);
    formData.append("file", file);

    await api
      .post("/settings-whitelabel/logo", formData, {
        onUploadProgress: (event) => {
          let progress = Math.round((event.loaded * 100) / event.total);
        },
      })
      .then((response) => {
        updateSettingsLoaded(`appLogo${mode}`, response.data);
        const publicUrl = getBackendUrl() + "/public/" + response.data;
        if (mode === "BackgroundLight" || mode === "BackgroundDark") {
          // nada a fazer
        } else if (mode === "Splash") {
          // Splash não tem setter no colorMode — atualiza direto o cache e o DOM.
          localStorage.setItem("wl_logoSplash", publicUrl);
          const splashLogo = document.getElementById("splash-logo");
          if (splashLogo) splashLogo.src = publicUrl;
        } else {
          const setter = colorMode[`setAppLogo${mode}`];
          if (typeof setter === "function") setter(publicUrl);
          if (mode === "Light") localStorage.setItem("wl_logoLight", publicUrl);
          if (mode === "Dark") localStorage.setItem("wl_logoDark", publicUrl);
        }
      })
      .catch((err) => {
        console.error(`Houve um problema ao realizar o upload da imagem.`);
      });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '50px' }}>
        <div>{i18n.t("whitelabel.loadingSettings", "Carregando configurações...")}</div>
      </div>
    );
  }

  return (
    <div className={classes.container}>
      <OnlyForSuperUser
        user={currentUser}
        yes={() => (
          <>
            {/* Seção de Configurações Gerais */}
            <Paper className={classes.sectionPaper}>
              <div className={classes.sectionHeader}>
                <Apps className={classes.sectionIcon} />
                <div>
                  <Typography variant="h6" className={classes.sectionTitle}>
                    {i18n.t("whitelabel.sections.general")}
                  </Typography>
                  <Typography className={classes.sectionSubtitle}>
                    {i18n.t("whitelabel.sections.generalDescription")}
                  </Typography>
                </div>
              </div>

              <Grid container spacing={3}>
                <Grid xs={12} sm={6} md={4} item>
                  <FormControl className={classes.formField} fullWidth>
                    <TextField
                      id="appname-field"
                      label={i18n.t("whitelabel.appName")}
                      variant="outlined"
                      name="appName"
                      value={appName}
                      inputRef={appNameInput}
                      onChange={(e) => {
                        setAppName(e.target.value);
                      }}
                      onBlur={async (_) => {
                        await handleSaveSetting("appName", appName);
                        colorMode.setAppName(appName || "Equipechat");
                      }}
                      size="small"
                      helperText={i18n.t("whitelabelSettings.appNameHelper")}
                    />
                  </FormControl>
                </Grid>
                <Grid xs={12} sm={6} md={4} item>
                  <FormControl className={classes.formField} fullWidth>
                    <TextField
                      id="appname-mobile-field"
                      label={i18n.t("whitelabelSettings.mobileAppName")}
                      variant="outlined"
                      name="appNameMobile"
                      value={appNameMobile}
                      onChange={(e) => {
                        setAppNameMobile(e.target.value);
                      }}
                      onBlur={async (_) => {
                        await handleSaveSetting("appNameMobile", appNameMobile);
                      }}
                      size="small"
                      helperText={i18n.t("whitelabelSettings.mobileAppNameHelper")}
                    />
                  </FormControl>
                </Grid>
                <Grid xs={12} sm={6} md={4} item>
                  <FormControl className={classes.formField} fullWidth>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={settingsLoaded.showLogoInChat === "enabled"}
                          onChange={(e) =>
                            handleSaveSetting(
                              "showLogoInChat",
                              e.target.checked ? "enabled" : "disabled"
                            )
                          }
                          color="primary"
                        />
                      }
                      label="Exibir logo na tela de atendimentos"
                    />
                    <Typography className={classes.sectionSubtitle}>
                      Mostra a logo acima da mensagem quando nenhum ticket está selecionado.
                    </Typography>
                  </FormControl>
                </Grid>
              </Grid>
            </Paper>

            {/* Seção de Cores */}
            <Paper className={classes.sectionPaper}>
              <div className={classes.sectionHeader}>
                <Palette className={classes.sectionIcon} />
                <div>
                  <Typography variant="h6" className={classes.sectionTitle}>
                    {i18n.t("whitelabel.sections.colors")}
                  </Typography>
                  <Typography className={classes.sectionSubtitle}>
                    {i18n.t("whitelabel.sections.colorsDescription")}
                  </Typography>
                </div>
              </div>

              <Grid container spacing={3} className={classes.colorSection}>
                <Grid xs={12} sm={6} md={6} item>
                  <FormControl className={classes.formField} fullWidth>
                    <TextField
                      id="primary-color-light-field"
                      label={i18n.t("whitelabel.primaryColorLight")}
                      variant="outlined"
                      value={settingsLoaded.primaryColorLight || ""}
                      onClick={() => setPrimaryColorLightModalOpen(true)}
                      size="small"
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <div
                              style={{
                                backgroundColor: settingsLoaded.primaryColorLight,
                              }}
                              className={classes.colorAdorment}
                            ></div>
                          </InputAdornment>
                        ),
                        endAdornment: (
                          <IconButton
                            size="small"
                            color="default"
                            onClick={() => setPrimaryColorLightModalOpen(true)}
                          >
                            <Colorize />
                          </IconButton>
                        ),
                      }}
                    />
                  </FormControl>
                  <ColorBoxModal
                    open={primaryColorLightModalOpen}
                    handleClose={() => setPrimaryColorLightModalOpen(false)}
                    onChange={(color) => {
                      handleSaveSetting("primaryColorLight", `#${color.hex}`);
                      colorMode.setPrimaryColorLight(`#${color.hex}`);
                    }}
                    currentColor={settingsLoaded.primaryColorLight}
                  />
                </Grid>
                <Grid xs={12} sm={6} md={6} item>
                  <FormControl className={classes.formField} fullWidth>
                    <TextField
                      id="primary-color-dark-field"
                      label={i18n.t("whitelabel.primaryColorDark")}
                      variant="outlined"
                      value={settingsLoaded.primaryColorDark || ""}
                      onClick={() => setPrimaryColorDarkModalOpen(true)}
                      size="small"
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <div
                              style={{
                                backgroundColor: settingsLoaded.primaryColorDark,
                              }}
                              className={classes.colorAdorment}
                            ></div>
                          </InputAdornment>
                        ),
                        endAdornment: (
                          <IconButton
                            size="small"
                            color="default"
                            onClick={() => setPrimaryColorDarkModalOpen(true)}
                          >
                            <Colorize />
                          </IconButton>
                        ),
                      }}
                    />
                  </FormControl>
                  <ColorBoxModal
                    open={primaryColorDarkModalOpen}
                    handleClose={() => setPrimaryColorDarkModalOpen(false)}
                    onChange={(color) => {
                      handleSaveSetting("primaryColorDark", `#${color.hex}`);
                      colorMode.setPrimaryColorDark(`#${color.hex}`);
                    }}
                    currentColor={settingsLoaded.primaryColorDark}
                  />
                </Grid>
              </Grid>
            </Paper>

            {/* Seção de Logos e Imagens */}
            <Paper className={classes.sectionPaper}>
              <div className={classes.sectionHeader}>
                <Image className={classes.sectionIcon} />
                <div>
                  <Typography variant="h6" className={classes.sectionTitle}>
                    {i18n.t("whitelabel.sections.logos")}
                  </Typography>
                  <Typography className={classes.sectionSubtitle}>
                    {i18n.t("whitelabel.sections.logosDescription")}
                  </Typography>
                </div>
              </div>

              <Grid container spacing={3} className={classes.logoSection}>
                <Grid xs={12} sm={6} md={4} item>
                  <FormControl className={classes.formField} fullWidth>
                    <TextField
                      id="logo-light-upload-field"
                      label={i18n.t("whitelabel.logoLight")}
                      variant="outlined"
                      value={settingsLoaded.appLogoLight || ""}
                      size="small"
                      className={classes.uploadField}
                      helperText="Recomendado: 400x120px (PNG transparente, até 500KB)"
                      InputProps={{
                        readOnly: true,
                        endAdornment: (
                          <>
                            {settingsLoaded.appLogoLight && (
                              <IconButton
                                size="small"
                                color="default"
                                onClick={() => {
                                  handleSaveSetting("appLogoLight", "");
                                  colorMode.setAppLogoLight(defaultLogoLight);
                                }}
                              >
                                <Delete
                                  titleAccess={i18n.t("whitelabel.delete")}
                                />
                              </IconButton>
                            )}
                            <input
                              type="file"
                              id="upload-logo-light-button"
                              ref={logoLightInput}
                              className={classes.uploadInput}
                              onChange={(e) => uploadLogo(e, "Light")}
                            />
                            <label htmlFor="upload-logo-light-button">
                              <IconButton
                                size="small"
                                color="default"
                                onClick={() => {
                                  logoLightInput.current.click();
                                }}
                              >
                                <AttachFile
                                  titleAccess={i18n.t("whitelabel.upload")}
                                />
                              </IconButton>
                            </label>
                          </>
                        ),
                      }}
                    />
                  </FormControl>
                </Grid>

                <Grid xs={12} sm={6} md={4} item>
                  <FormControl className={classes.formField} fullWidth>
                    <TextField
                      id="logo-dark-upload-field"
                      label={i18n.t("whitelabel.logoDark")}
                      variant="outlined"
                      value={settingsLoaded.appLogoDark || ""}
                      size="small"
                      className={classes.uploadField}
                      helperText="Recomendado: 400x120px (PNG transparente, até 500KB)"
                      InputProps={{
                        readOnly: true,
                        endAdornment: (
                          <>
                            {settingsLoaded.appLogoDark && (
                              <IconButton
                                size="small"
                                color="default"
                                onClick={() => {
                                  handleSaveSetting("appLogoDark", "");
                                  colorMode.setAppLogoDark(defaultLogoDark);
                                }}
                              >
                                <Delete
                                  titleAccess={i18n.t("whitelabel.delete")}
                                />
                              </IconButton>
                            )}
                            <input
                              type="file"
                              id="upload-logo-dark-button"
                              ref={logoDarkInput}
                              className={classes.uploadInput}
                              onChange={(e) => uploadLogo(e, "Dark")}
                            />
                            <label htmlFor="upload-logo-dark-button">
                              <IconButton
                                size="small"
                                color="default"
                                onClick={() => {
                                  logoDarkInput.current.click();
                                }}
                              >
                                <AttachFile
                                  titleAccess={i18n.t("whitelabel.upload")}
                                />
                              </IconButton>
                            </label>
                          </>
                        ),
                      }}
                    />
                  </FormControl>
                </Grid>

                <Grid xs={12} sm={6} md={4} item>
                  <FormControl className={classes.formField} fullWidth>
                    <TextField
                      id="logo-favicon-upload-field"
                      label={i18n.t("whitelabel.favicon")}
                      variant="outlined"
                      value={settingsLoaded.appLogoFavicon || ""}
                      size="small"
                      className={classes.uploadField}
                      helperText="Recomendado: 64x64px ou 32x32px (PNG ou ICO quadrado, até 100KB)"
                      InputProps={{
                        readOnly: true,
                        endAdornment: (
                          <>
                            {settingsLoaded.appLogoFavicon && (
                              <IconButton
                                size="small"
                                color="default"
                                onClick={() => {
                                  handleSaveSetting("appLogoFavicon", "");
                                  colorMode.setAppLogoFavicon(defaultLogoFavicon);
                                }}
                              >
                                <Delete
                                  titleAccess={i18n.t("whitelabel.delete")}
                                />
                              </IconButton>
                            )}
                            <input
                              type="file"
                              id="upload-logo-favicon-button"
                              ref={logoFaviconInput}
                              className={classes.uploadInput}
                              onChange={(e) => uploadLogo(e, "Favicon")}
                            />
                            <label htmlFor="upload-logo-favicon-button">
                              <IconButton
                                size="small"
                                color="default"
                                onClick={() => {
                                  logoFaviconInput.current.click();
                                }}
                              >
                                <AttachFile
                                  titleAccess={i18n.t("whitelabel.upload")}
                                />
                              </IconButton>
                            </label>
                          </>
                        ),
                      }}
                    />
                  </FormControl>
                </Grid>

                <Grid xs={12} sm={6} md={4} item>
                  <FormControl className={classes.formField} fullWidth>
                    <TextField
                      id="logo-mobile-upload-field"
                      label={i18n.t("whitelabel.logoMobile")}
                      variant="outlined"
                      value={settingsLoaded.appLogoMobile || ""}
                      size="small"
                      className={classes.uploadField}
                      helperText="Recomendado: 512x512px (PNG quadrado, até 500KB)"
                      InputProps={{
                        readOnly: true,
                        endAdornment: (
                          <>
                            {settingsLoaded.appLogoMobile && (
                              <IconButton
                                size="small"
                                color="default"
                                onClick={() => {
                                  handleSaveSetting("appLogoMobile", "");
                                }}
                              >
                                <Delete
                                  titleAccess={i18n.t("whitelabel.delete")}
                                />
                              </IconButton>
                            )}
                            <input
                              type="file"
                              id="upload-logo-mobile-button"
                              ref={logoMobileInput}
                              className={classes.uploadInput}
                              onChange={(e) => uploadLogo(e, "Mobile")}
                            />
                            <label htmlFor="upload-logo-mobile-button">
                              <IconButton
                                size="small"
                                color="default"
                                onClick={() => {
                                  logoMobileInput.current.click();
                                }}
                              >
                                <AttachFile
                                  titleAccess={i18n.t("whitelabel.upload")}
                                />
                              </IconButton>
                            </label>
                          </>
                        ),
                      }}
                    />
                  </FormControl>
                </Grid>

                <Grid xs={12} sm={6} md={6} item>
                  <FormControl className={classes.formField} fullWidth>
                    <TextField
                      id="background-light-upload-field"
                      label={i18n.t("whitelabel.backgroundLight")}
                      variant="outlined"
                      value={settingsLoaded.appLogoBackgroundLight || ""}
                      size="small"
                      className={classes.uploadField}
                      helperText="Recomendado: 1920x1080px (JPG ou PNG, até 1MB)"
                      InputProps={{
                        readOnly: true,
                        endAdornment: (
                          <>
                            {settingsLoaded.appLogoBackgroundLight && (
                              <IconButton
                                size="small"
                                color="default"
                                onClick={() => {
                                  handleSaveSetting("appLogoBackgroundLight", "");
                                }}
                              >
                                <Delete titleAccess={i18n.t("whitelabel.delete")} />
                              </IconButton>
                            )}
                            <input
                              type="file"
                              id="upload-background-light-button"
                              ref={backgroundLightInput}
                              className={classes.uploadInput}
                              onChange={(e) => uploadLogo(e, "BackgroundLight")}
                            />
                            <label htmlFor="upload-background-light-button">
                              <IconButton
                                size="small"
                                color="default"
                                onClick={() => { backgroundLightInput.current.click(); }}
                              >
                                <AttachFile titleAccess={i18n.t("whitelabel.upload")} />
                              </IconButton>
                            </label>
                          </>
                        ),
                      }}
                    />
                  </FormControl>
                </Grid>

                <Grid xs={12} sm={6} md={6} item>
                  <FormControl className={classes.formField} fullWidth>
                    <TextField
                      id="background-dark-upload-field"
                      label={i18n.t("whitelabel.backgroundDark")}
                      variant="outlined"
                      value={settingsLoaded.appLogoBackgroundDark || ""}
                      size="small"
                      className={classes.uploadField}
                      helperText="Recomendado: 1920x1080px (JPG ou PNG, até 1MB)"
                      InputProps={{
                        readOnly: true,
                        endAdornment: (
                          <>
                            {settingsLoaded.appLogoBackgroundDark && (
                              <IconButton
                                size="small"
                                color="default"
                                onClick={() => {
                                  handleSaveSetting("appLogoBackgroundDark", "");
                                }}
                              >
                                <Delete titleAccess={i18n.t("whitelabel.delete")} />
                              </IconButton>
                            )}
                            <input
                              type="file"
                              id="upload-background-dark-button"
                              ref={backgroundDarkInput}
                              className={classes.uploadInput}
                              onChange={(e) => uploadLogo(e, "BackgroundDark")}
                            />
                            <label htmlFor="upload-background-dark-button">
                              <IconButton
                                size="small"
                                color="default"
                                onClick={() => { backgroundDarkInput.current.click(); }}
                              >
                                <AttachFile titleAccess={i18n.t("whitelabel.upload")} />
                              </IconButton>
                            </label>
                          </>
                        ),
                      }}
                    />
                  </FormControl>
                </Grid>

                <Grid xs={12} sm={6} md={6} item>
                  <FormControl className={classes.formField} fullWidth>
                    <TextField
                      id="logo-splash-upload-field"
                      label="Logo da tela de carregamento (Splash)"
                      variant="outlined"
                      value={settingsLoaded.appLogoSplash || ""}
                      size="small"
                      className={classes.uploadField}
                      helperText="Recomendado: 512x512px (PNG quadrado com fundo transparente, até 500KB)"
                      InputProps={{
                        readOnly: true,
                        endAdornment: (
                          <>
                            {settingsLoaded.appLogoSplash && (
                              <IconButton
                                size="small"
                                color="default"
                                onClick={() => {
                                  handleSaveSetting("appLogoSplash", "");
                                  localStorage.removeItem("wl_logoSplash");
                                }}
                              >
                                <Delete titleAccess={i18n.t("whitelabel.delete")} />
                              </IconButton>
                            )}
                            <input
                              type="file"
                              id="upload-logo-splash-button"
                              ref={logoSplashInput}
                              className={classes.uploadInput}
                              onChange={(e) => uploadLogo(e, "Splash")}
                            />
                            <label htmlFor="upload-logo-splash-button">
                              <IconButton
                                size="small"
                                color="default"
                                onClick={() => { logoSplashInput.current.click(); }}
                              >
                                <AttachFile titleAccess={i18n.t("whitelabel.upload")} />
                              </IconButton>
                            </label>
                          </>
                        ),
                      }}
                    />
                  </FormControl>
                </Grid>
              </Grid>

              {/* Preview Section */}
              <div className={classes.previewContainer}>
                <Typography variant="subtitle2" gutterBottom style={{ fontWeight: 600, marginBottom: 16 }}>
                  {i18n.t("whitelabel.preview")}
                </Typography>
                <Grid container spacing={2} className={classes.previewGrid}>
                  <Grid xs={12} sm={6} md={3} item>
                    <div className={`${classes.previewCard} ${classes.previewCardLight}`}>
                      <img
                        className={classes.previewImage}
                        src={settingsLoaded.appLogoLight ?
                          getBackendUrl() + "/public/" + settingsLoaded.appLogoLight :
                          defaultLogoLight
                        }
                        alt={i18n.t("whitelabel.preview") + " light-logo"}
                        onError={(e) => { e.target.src = defaultLogoLight; }}
                      />
                      <div className={classes.previewLabel}>
                        {i18n.t("whitelabel.logoLight")}
                      </div>
                    </div>
                  </Grid>

                  <Grid xs={12} sm={6} md={3} item>
                    <div className={`${classes.previewCard} ${classes.previewCardDark}`}>
                      <img
                        className={classes.previewImage}
                        src={settingsLoaded.appLogoDark ?
                          getBackendUrl() + "/public/" + settingsLoaded.appLogoDark :
                          defaultLogoDark
                        }
                        alt={i18n.t("whitelabel.preview") + " dark-logo"}
                        onError={(e) => { e.target.src = defaultLogoDark; }}
                      />
                      <div className={`${classes.previewLabel} ${classes.previewLabelDark}`}>
                        {i18n.t("whitelabel.logoDark")}
                      </div>
                    </div>
                  </Grid>

                  <Grid xs={12} sm={6} md={3} item>
                    <div className={`${classes.previewCard} ${classes.previewCardFavicon}`}>
                      <img
                        className={classes.previewImage}
                        src={settingsLoaded.appLogoFavicon ?
                          getBackendUrl() + "/public/" + settingsLoaded.appLogoFavicon :
                          defaultLogoFavicon
                        }
                        alt={i18n.t("whitelabel.preview") + " favicon"}
                        onError={(e) => { e.target.src = defaultLogoFavicon; }}
                        style={{ maxHeight: "48px" }}
                      />
                      <div className={classes.previewLabel}>
                        {i18n.t("whitelabel.favicon")}
                      </div>
                    </div>
                  </Grid>

                  <Grid xs={12} sm={6} md={3} item>
                    <div className={`${classes.previewCard} ${classes.previewCardFavicon}`}>
                      {settingsLoaded.appLogoMobile ? (
                        <img
                          className={classes.previewImage}
                          src={getBackendUrl() + "/public/" + settingsLoaded.appLogoMobile}
                          alt={i18n.t("whitelabel.preview") + " mobile-logo"}
                          onError={(e) => { e.target.style.display = "none"; }}
                          style={{ maxHeight: "64px" }}
                        />
                      ) : (
                        <div className={classes.previewLabel}>
                          {i18n.t("whitelabel.logoMobile")}
                        </div>
                      )}
                      <div className={classes.previewLabel}>
                        {i18n.t("whitelabel.logoMobile")}
                      </div>
                    </div>
                  </Grid>

                  <Grid xs={12} sm={6} md={6} item>
                    <div className={`${classes.previewCard} ${classes.previewCardLight}`}>
                      {settingsLoaded.appLogoBackgroundLight ? (
                        <img
                          className={classes.previewBackgroundImage}
                          src={getBackendUrl() + "/public/" + settingsLoaded.appLogoBackgroundLight}
                          alt={i18n.t("whitelabel.preview") + " background-light"}
                          onError={(e) => { e.target.style.display = "none"; }}
                        />
                      ) : (
                        <div className={classes.previewLabel}>
                          {i18n.t("whitelabel.backgroundLight")}
                        </div>
                      )}
                    </div>
                  </Grid>

                  <Grid xs={12} sm={6} md={6} item>
                    <div className={`${classes.previewCard} ${classes.previewCardDark}`}>
                      {settingsLoaded.appLogoBackgroundDark ? (
                        <img
                          className={classes.previewBackgroundImage}
                          src={getBackendUrl() + "/public/" + settingsLoaded.appLogoBackgroundDark}
                          alt={i18n.t("whitelabel.preview") + " background-dark"}
                          onError={(e) => { e.target.style.display = "none"; }}
                        />
                      ) : (
                        <div className={`${classes.previewLabel} ${classes.previewLabelDark}`}>
                          {i18n.t("whitelabel.backgroundDark")}
                        </div>
                      )}
                    </div>
                  </Grid>
                </Grid>
              </div>
            </Paper>

            {/* Seção de Idiomas */}
            <Paper className={classes.sectionPaper}>
              <div className={classes.sectionHeader}>
                <Language className={classes.sectionIcon} />
                <div>
                  <Typography variant="h6" className={classes.sectionTitle}>
                    {i18n.t("whitelabel.sections.languages")}
                  </Typography>
                  <Typography className={classes.sectionSubtitle}>
                    {i18n.t("whitelabel.sections.languagesDescription")}
                  </Typography>
                </div>
              </div>

              <div className={classes.languageSection}>
                <div className={classes.languageGrid}>
                  {LANGUAGE_OPTIONS.map((lang) => (
                    <div key={lang.code} className={classes.languageItem}>
                      <Checkbox
                        className={classes.languageCheckbox}
                        checked={enabledLanguages.includes(lang.code)}
                        onChange={(e) => {
                          let newLangs = e.target.checked
                            ? [...enabledLanguages, lang.code]
                            : enabledLanguages.filter((c) => c !== lang.code);
                          if (newLangs.length === 0) {
                            toast.error(
                              i18n.t("whitelabel.atLeastOneLanguage")
                            );
                            return;
                          }
                          handleSaveEnabledLanguages(newLangs);
                        }}
                        color="primary"
                        size="small"
                      />
                      <span className={classes.languageLabel}>
                        {lang.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Paper>
          </>
        )}
      />
    </div>
  );
}