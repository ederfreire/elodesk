import React, { useState, useEffect, useMemo } from "react";
import api from "./services/api";
import "react-toastify/dist/ReactToastify.css";
import { QueryClient, QueryClientProvider } from "react-query";

import { createTheme, ThemeProvider } from "@material-ui/core/styles";
import { useMediaQuery } from "@material-ui/core";
import ColorModeContext from "./layout/themeContext";
import { ActiveMenuProvider } from "./context/ActiveMenuContext";
import Favicon from "react-favicon";
import { getBackendUrl } from "./config";
import Routes from "./routes";
import defaultLogoLight from "./assets/logo1.png";
import defaultLogoDark from "./assets/logo2.png";
import useSettings from "./hooks/useSettings";
import "./styles/animations.css";
import "./styles/darkThemeFixes.css";

const defaultLogoFavicon = "/favicon.ico";

const queryClient = new QueryClient();

const App = () => {
  const [locale, setLocale] = useState();
  const appColorLocalStorage =
    localStorage.getItem("primaryColorLight") ||
    localStorage.getItem("primaryColorDark") ||
    "#065183";
  const appNameLocalStorage = localStorage.getItem("appName") || "";
  const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)");
  const preferredTheme = window.localStorage.getItem("preferredTheme");
  const [mode, setMode] = useState(
    preferredTheme ? preferredTheme : prefersDarkMode ? "dark" : "light"
  );
  const [primaryColorLight, setPrimaryColorLight] =
    useState(appColorLocalStorage);
  const [primaryColorDark, setPrimaryColorDark] =
    useState(appColorLocalStorage);
  // Inicializa a partir do cache do whitelabel para evitar "flash" da imagem
  // padrão ao dar F5 antes do fetch das settings públicas retornar.
  const [appLogoLight, setAppLogoLight] = useState(
    localStorage.getItem("wl_logoLight") || defaultLogoLight
  );
  const [appLogoDark, setAppLogoDark] = useState(
    localStorage.getItem("wl_logoDark") || defaultLogoDark
  );
  const [appLogoFavicon, setAppLogoFavicon] = useState(
    localStorage.getItem("wl_favicon") || defaultLogoFavicon
  );
  const [appName, setAppName] = useState(
    appNameLocalStorage || localStorage.getItem("wl_appName") || ""
  );
  const { getPublicSetting } = useSettings();

  const colorMode = useMemo(
    () => ({
      toggleColorMode: () => {
        setMode((prevMode) => {
          const newMode = prevMode === "light" ? "dark" : "light";
          window.localStorage.setItem("preferredTheme", newMode); // Persistindo o tema no localStorage
          return newMode;
        });
      },
      setPrimaryColorLight,
      setPrimaryColorDark,
      setAppLogoLight,
      setAppLogoDark,
      setAppLogoFavicon,
      setAppName,
      appLogoLight,
      appLogoDark,
      appLogoFavicon,
      appName,
      mode,
    }),
    [appLogoLight, appLogoDark, appLogoFavicon, appName, mode]
  );

  const theme = useMemo(
    () =>
      createTheme(
        {
          // Custom mode property for easy access as theme.mode
          mode: mode,

          /*
           * BARRAS DE ROLAGEM
           *
           * O polegar usava `primaryColorLight`/`primaryColorDark` — a cor da
           * marca. Com o whitelabel azul, toda area rolavel ganhava uma barra
           * azul forte, que disputava atencao com o conteudo e aparecia em
           * lugares onde nem se percebia que havia rolagem.
           *
           * Agora e cinza bem claro, com a trilha transparente. A barra so
           * fica visivel ao passar o mouse.
           *
           * `scrollbarStyles` e `scrollbarStylesSoft` ficaram iguais de
           * proposito: eram dois estilos para a mesma coisa, espalhados por
           * 63 pontos do sistema, e a diferenca entre eles era justamente o
           * azul. Mantive os dois nomes para nao precisar mexer nesses 63
           * lugares.
           */
          scrollbarStyles: {
            "&::-webkit-scrollbar": {
              width: "8px",
              height: "8px",
            },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor:
                mode === "light" ? "rgba(15,23,42,0.14)" : "rgba(255,255,255,0.14)",
              borderRadius: "8px",
              // Borda da cor do fundo: afina o polegar visualmente sem
              // reduzir a area de clique.
              border: "2px solid transparent",
              backgroundClip: "content-box",
              "&:hover": {
                backgroundColor:
                  mode === "light" ? "rgba(15,23,42,0.28)" : "rgba(255,255,255,0.28)",
              },
            },
            "&::-webkit-scrollbar-track": {
              backgroundColor: "transparent",
            },
            // Firefox nao entende ::-webkit-scrollbar.
            scrollbarWidth: "thin",
            scrollbarColor:
              mode === "light"
                ? "rgba(15,23,42,0.14) transparent"
                : "rgba(255,255,255,0.14) transparent",
          },

          scrollbarStylesSoft: {
            "&::-webkit-scrollbar": {
              width: "8px",
              height: "8px",
            },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor:
                mode === "light" ? "rgba(15,23,42,0.14)" : "rgba(255,255,255,0.14)",
              borderRadius: "8px",
              border: "2px solid transparent",
              backgroundClip: "content-box",
              "&:hover": {
                backgroundColor:
                  mode === "light" ? "rgba(15,23,42,0.28)" : "rgba(255,255,255,0.28)",
              },
            },
            "&::-webkit-scrollbar-track": {
              backgroundColor: "transparent",
            },
            scrollbarWidth: "thin",
            scrollbarColor:
              mode === "light"
                ? "rgba(15,23,42,0.14) transparent"
                : "rgba(255,255,255,0.14) transparent",
          },

          palette: {
            type: mode,
            mode: mode,
            primary: {
              main: mode === "light" ? primaryColorLight : primaryColorDark,
              light: mode === "light"
                ? `${primaryColorLight}80`
                : `${primaryColorDark}80`,
              dark: mode === "light"
                ? `${primaryColorLight}CC`
                : `${primaryColorDark}CC`,
              contrastText: "#ffffff",
            },
            text: {
              primary: mode === "light" ? "#1a1a1a" : "#e8eaed",
              secondary: mode === "light" ? "#666666" : "#9aa0a6",
            },
            background: {
              default: mode === "light" ? "#fafafa" : "#0d0f18",
              paper: mode === "light" ? "#ffffff" : "#141620",
            },
            action: {
              active: mode === "light" ? "rgba(0, 0, 0, 0.54)" : "rgba(255, 255, 255, 0.7)",
              hover: mode === "light" ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.08)",
              selected: mode === "light" ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.12)",
            },
            textPrimary:
              mode === "light" ? primaryColorLight : primaryColorDark,
            borderPrimary:
              mode === "light" ? primaryColorLight : primaryColorDark,
            dark: { main: mode === "light" ? "#333333" : "#F3F3F3" },
            light: { main: mode === "light" ? "#F3F3F3" : "#333333" },
            fontColor: mode === "light" ? primaryColorLight : primaryColorDark,
            tabHeaderBackground: mode === "light" ? "#EEE" : "#1a1c2e",
            optionsBackground: mode === "light" ? "#fafafa" : "#1a1c2e",
            fancyBackground: mode === "light" ? "#fafafa" : "#0d0f18",
            total: mode === "light" ? "#fff" : "#141620",
            messageIcons: mode === "light" ? "grey" : "#8b949e",
            inputBackground: mode === "light" ? "#FFFFFF" : "#1a1c2e",
            barraSuperior: mode === "light" ? primaryColorLight : "#141620",
            divider: mode === "light" ? "#e0e0e0" : "#1e2035",
          },

          typography: {
            fontFamily: [
              'Inter',
              'Roboto',
              '-apple-system',
              'BlinkMacSystemFont',
              '"Segoe UI"',
              '"Helvetica Neue"',
              'Arial',
              'sans-serif',
            ].join(','),
            // Titulos com Plus Jakarta Sans: contraste sutil com o corpo em
            // Inter, sem virar outra identidade visual.
            h1: {
              fontFamily: '"Plus Jakarta Sans", Inter, sans-serif',
              fontWeight: 700,
              letterSpacing: '-0.025em',
            },
            h2: {
              fontFamily: '"Plus Jakarta Sans", Inter, sans-serif',
              fontWeight: 700,
              letterSpacing: '-0.025em',
            },
            h3: {
              fontFamily: '"Plus Jakarta Sans", Inter, sans-serif',
              fontWeight: 600,
              letterSpacing: '-0.025em',
            },
            h4: {
              fontFamily: '"Plus Jakarta Sans", Inter, sans-serif',
              fontWeight: 600,
              letterSpacing: '-0.025em',
            },
            h5: {
              fontFamily: '"Plus Jakarta Sans", Inter, sans-serif',
              fontWeight: 600,
              letterSpacing: '-0.025em',
            },
            h6: {
              fontFamily: '"Plus Jakarta Sans", Inter, sans-serif',
              fontWeight: 600,
              letterSpacing: '-0.025em',
            },
            // O MUI escreve letterSpacing proprio em body1/body2/subtitle e
            // sobrescreve o `-0.01em` que o body do index.html define. Sem
            // repetir aqui, o ajuste so valeria em texto solto, e a maior
            // parte da interface (que passa por Typography) ficaria de fora.
            body1: {
              letterSpacing: '-0.01em',
            },
            body2: {
              letterSpacing: '-0.01em',
            },
            subtitle1: {
              letterSpacing: '-0.01em',
            },
            subtitle2: {
              letterSpacing: '-0.01em',
            },
            button: {
              fontWeight: 600,
              textTransform: 'none',
              letterSpacing: '0.025em',
            },
          },

          shape: {
            borderRadius: 8, // Bordas arredondadas mas não excessivas
          },
          overrides: {
            // Global CssBaseline
            MuiCssBaseline: {
              '@global': {
                /*
                 * Barra de rolagem padrao de TODO o sistema.
                 *
                 * As classes `scrollbarStyles` do tema so valem onde alguem
                 * lembrou de aplica-las. A barra da janela, os menus suspensos
                 * e qualquer area rolavel sem essa classe continuavam com a
                 * barra grossa e colorida do navegador. Aqui a regra vale para
                 * tudo.
                 */
                '*::-webkit-scrollbar': {
                  width: 8,
                  height: 8,
                },
                '*::-webkit-scrollbar-track': {
                  backgroundColor: 'transparent',
                },
                '*::-webkit-scrollbar-thumb': {
                  backgroundColor:
                    mode === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.14)',
                  borderRadius: 8,
                  border: '2px solid transparent',
                  backgroundClip: 'content-box',
                },
                '*::-webkit-scrollbar-thumb:hover': {
                  backgroundColor:
                    mode === 'dark' ? 'rgba(255,255,255,0.28)' : 'rgba(15,23,42,0.28)',
                },
                // O canto entre as duas barras vinha cinza-claro fixo do
                // navegador e ficava visivel no tema escuro.
                '*::-webkit-scrollbar-corner': {
                  backgroundColor: 'transparent',
                },
                html: {
                  scrollbarWidth: 'thin',
                  scrollbarColor:
                    mode === 'dark'
                      ? 'rgba(255,255,255,0.14) transparent'
                      : 'rgba(15,23,42,0.14) transparent',
                },
                body: {
                  color: mode === "dark" ? "#e8eaed !important" : "#1a1a1a",
                  backgroundColor: mode === "dark" ? "#0d0f18" : "#fafafa",
                },
                ...(mode === "dark" ? {
                  // Force override ALL hardcoded dark colors in inline styles
                  'h1, h2, h3, h4, h5, h6, p, span, label, div, td, th, li, a, strong, em, b, i, small': {
                    color: '#e8eaed !important',
                  },
                  // Preserve colored elements (badges, chips, status indicators, buttons with specific colors)
                  '[style*="background"], .MuiBadge-badge, .MuiChip-root, .MuiButton-containedPrimary, .MuiButton-containedSecondary, [class*="badge"], [class*="status"]': {
                    color: 'unset !important',
                  },
                  // Re-allow white text on colored backgrounds
                  '.MuiButton-containedPrimary, .MuiButton-containedSecondary, .MuiBadge-colorPrimary, .MuiBadge-colorSecondary, .MuiBadge-colorError': {
                    color: '#fff !important',
                  },
                  // Force SVG icons white
                  'svg, svg path, .MuiSvgIcon-root, .MuiIconButton-root svg': {
                    color: 'rgba(255,255,255,0.85) !important',
                    fill: 'currentColor',
                  },
                  // Secondary text
                  '.MuiTypography-colorTextSecondary, .MuiFormHelperText-root, .MuiInputLabel-root': {
                    color: '#9aa0a6 !important',
                  },
                  // Input text
                  'input, textarea, select, .MuiInputBase-input, .MuiSelect-select': {
                    color: '#e8eaed !important',
                  },
                  // Placeholder
                  'input::placeholder, textarea::placeholder': {
                    color: 'rgba(255,255,255,0.4) !important',
                    opacity: '1 !important',
                  },
                } : {
                  'h1, h2, h3, h4, h5, h6, p, span, label, div, td, th, li, a': {
                    color: 'inherit',
                  },
                }),
              },
            },

            // Botões usando cor do tema
            MuiButton: {
              root: {
                borderRadius: 8,
                textTransform: 'none',
                fontWeight: 600,
                letterSpacing: '0.025em',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                  transform: 'translateY(-1px)',
                },
                '&:active': {
                  transform: 'translateY(0)',
                }
              },
              contained: {
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                '&:hover': {
                  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
                }
              },
              outlined: {
                borderColor: mode === "dark" ? "rgba(255,255,255,0.2)" : undefined,
                color: mode === "dark" ? "#e8eaed" : undefined,
              },
              text: {
                color: mode === "dark" ? "#e8eaed" : undefined,
              },
            },

            MuiContainer: {
              root: {
                paddingLeft: '0 !important',
                paddingRight: '0 !important',
                maxWidth: 'none !important',
                width: '100% !important',
              },
              maxWidthLg: { maxWidth: 'none !important' },
              maxWidthMd: { maxWidth: 'none !important' },
              maxWidthSm: { maxWidth: 'none !important' },
              maxWidthXl: { maxWidth: 'none !important' },
              maxWidthXs: { maxWidth: 'none !important' },
            },
          
            MuiPaper: {
              root: {
                backgroundImage: 'none',
                backgroundColor: mode === "dark" ? "#141620" : "#ffffff",
                color: mode === "dark" ? "#e8eaed" : undefined,
              },
              rounded: {
                borderRadius: 12,
              },
              elevation1: {
                boxShadow: mode === "dark" ? '0 1px 3px rgba(0, 0, 0, 0.3)' : '0 1px 3px rgba(0, 0, 0, 0.1)',
              },
              elevation2: {
                boxShadow: mode === "dark" ? '0 2px 6px rgba(0, 0, 0, 0.3)' : '0 2px 6px rgba(0, 0, 0, 0.1)',
              },
              elevation3: {
                boxShadow: mode === "dark" ? '0 4px 12px rgba(0, 0, 0, 0.3)' : '0 4px 12px rgba(0, 0, 0, 0.1)',
              }
            },

            MuiMenu: {
              paper: {
                width: 'auto !important',
                maxWidth: '300px !important',
                minWidth: '180px !important',
                backgroundColor: mode === "dark" ? "#1a1c2e !important" : undefined,
              }
            },

            MuiPopover: {
              paper: {
                width: 'auto !important',
                maxWidth: '300px !important',
                minWidth: 'auto !important',
                backgroundColor: mode === "dark" ? "#1a1c2e" : undefined,
              }
            },

            MuiMenuItem: {
              root: {
                color: mode === "dark" ? "#e8eaed" : undefined,
              }
            },

            // Inputs melhorados
            MuiTextField: {
              root: {
                '& .MuiOutlinedInput-root': {
                  borderRadius: 8,
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    '& .MuiOutlinedInput-notchedOutline': {
                      borderColor: mode === "light" ? "#ccc" : "#555",
                    }
                  },
                  '&.Mui-focused': {
                    '& .MuiOutlinedInput-notchedOutline': {
                      borderColor: mode === "light" ? primaryColorLight : primaryColorDark,
                      borderWidth: 2,
                    }
                  }
                }
              }
            },

            // Tabs
            MuiTab: {
              root: {
                textTransform: 'none',
                fontWeight: 600,
                letterSpacing: '0.025em',
                borderRadius: '8px 8px 0 0',
                transition: 'all 0.3s ease',
                color: mode === "dark" ? "rgba(255,255,255,0.7) !important" : undefined,
                '&:hover': {
                  backgroundColor: mode === "light"
                    ? `${primaryColorLight}08`
                    : `${primaryColorDark}15`,
                },
                '&.Mui-selected': {
                  color: (mode === "light" ? primaryColorLight : primaryColorDark) + " !important",
                }
              },
              textColorInherit: {
                color: mode === "dark" ? "rgba(255,255,255,0.7)" : undefined,
                opacity: 1,
              },
              textColorPrimary: {
                color: mode === "dark" ? "rgba(255,255,255,0.7)" : undefined,
              },
            },

            MuiTabs: {
              indicator: {
                backgroundColor: mode === "dark" ? primaryColorDark : primaryColorLight,
              }
            },

            // Drawer
            MuiDrawer: {
              paper: {
                border: 'none',
                backgroundColor: mode === "dark" ? "#0d0f18" : "#ffffff",
                color: mode === "dark" ? "#e8eaed" : undefined,
              }
            },

            // AppBar
            MuiAppBar: {
              root: {
                boxShadow: mode === "dark" ? "none" : undefined,
                color: mode === "dark" ? "#e8eaed" : undefined,
              },
              colorDefault: {
                backgroundColor: mode === "dark" ? "#141620" : undefined,
                color: mode === "dark" ? "#e8eaed" : undefined,
              },
              colorPrimary: {
                color: "#ffffff",
              }
            },

            // Toolbar
            MuiToolbar: {
              root: {
                color: mode === "dark" ? "#e8eaed" : undefined,
              }
            },

            // Dialog
            MuiDialog: {
              paper: {
                backgroundColor: mode === "dark" ? "#141620" : "#ffffff",
                color: mode === "dark" ? "#e8eaed" : undefined,
              }
            },

            MuiDialogTitle: {
              root: {
                color: mode === "dark" ? "#e8eaed" : undefined,
              }
            },

            MuiDialogContent: {
              root: {
                color: mode === "dark" ? "#e8eaed" : undefined,
              }
            },

            MuiDialogContentText: {
              root: {
                color: mode === "dark" ? "#9aa0a6" : undefined,
              }
            },

            // Card
            MuiCard: {
              root: {
                backgroundColor: mode === "dark" ? "#141620" : "#ffffff",
                color: mode === "dark" ? "#e8eaed" : undefined,
              }
            },

            MuiCardContent: {
              root: {
                color: mode === "dark" ? "#e8eaed" : undefined,
              }
            },

            MuiCardHeader: {
              root: {
                color: mode === "dark" ? "#e8eaed" : undefined,
              },
              title: {
                color: mode === "dark" ? "#e8eaed" : undefined,
              },
              subheader: {
                color: mode === "dark" ? "#9aa0a6" : undefined,
              },
            },

            // Icons
            MuiSvgIcon: {
              root: {
                color: mode === "dark" ? "rgba(255,255,255,0.85)" : undefined,
              }
            },

            MuiIconButton: {
              root: {
                color: mode === "dark" ? "rgba(255,255,255,0.75)" : undefined,
              }
            },

            // Input labels and text
            MuiInputLabel: {
              root: {
                color: mode === "dark" ? "rgba(255,255,255,0.6)" : undefined,
                '&.Mui-focused': {
                  color: mode === "dark" ? primaryColorDark : primaryColorLight,
                }
              },
              outlined: {
                color: mode === "dark" ? "rgba(255,255,255,0.6)" : undefined,
              },
              filled: {
                color: mode === "dark" ? "rgba(255,255,255,0.6)" : undefined,
              },
            },

            MuiOutlinedInput: {
              root: {
                color: mode === "dark" ? "#e8eaed" : undefined,
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: mode === "dark" ? "rgba(255,255,255,0.15)" : undefined,
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: mode === "dark" ? "rgba(255,255,255,0.3)" : undefined,
                },
              },
              input: {
                color: mode === "dark" ? "#e8eaed" : undefined,
                '&::placeholder': {
                  color: mode === "dark" ? "rgba(255,255,255,0.4)" : undefined,
                  opacity: 1,
                },
              },
            },

            MuiFilledInput: {
              root: {
                backgroundColor: mode === "dark" ? "rgba(255,255,255,0.05)" : undefined,
                color: mode === "dark" ? "#e8eaed" : undefined,
                '&:hover': {
                  backgroundColor: mode === "dark" ? "rgba(255,255,255,0.08)" : undefined,
                },
                '&.Mui-focused': {
                  backgroundColor: mode === "dark" ? "rgba(255,255,255,0.08)" : undefined,
                },
              },
              input: {
                color: mode === "dark" ? "#e8eaed" : undefined,
              },
            },

            MuiInput: {
              root: {
                color: mode === "dark" ? "#e8eaed" : undefined,
              },
              underline: {
                '&:before': {
                  borderBottomColor: mode === "dark" ? "rgba(255,255,255,0.2)" : undefined,
                },
              },
            },

            MuiInputBase: {
              root: {
                color: mode === "dark" ? "#e8eaed" : undefined,
              },
              input: {
                color: mode === "dark" ? "#e8eaed" : undefined,
              },
            },

            MuiFormHelperText: {
              root: {
                color: mode === "dark" ? "rgba(255,255,255,0.5)" : undefined,
              },
            },

            MuiFormLabel: {
              root: {
                color: mode === "dark" ? "rgba(255,255,255,0.6)" : undefined,
                '&.Mui-focused': {
                  color: mode === "dark" ? primaryColorDark : undefined,
                },
              },
            },

            MuiSelect: {
              icon: {
                color: mode === "dark" ? "rgba(255,255,255,0.7)" : undefined,
              },
              select: {
                color: mode === "dark" ? "#e8eaed" : undefined,
              },
            },

            // Table
            MuiTableCell: {
              root: {
                color: mode === "dark" ? "#e8eaed" : undefined,
                borderBottom: mode === "dark" ? "1px solid rgba(255,255,255,0.06)" : undefined,
              },
              head: {
                color: mode === "dark" ? "#9aa0a6" : undefined,
                backgroundColor: mode === "dark" ? "#1a1c2e" : undefined,
                fontWeight: 600,
              },
              body: {
                color: mode === "dark" ? "#e8eaed" : undefined,
              },
            },

            MuiTableRow: {
              root: {
                '&:hover': {
                  backgroundColor: mode === "dark" ? "rgba(255,255,255,0.03) !important" : undefined,
                },
              },
            },

            MuiTableHead: {
              root: {
                backgroundColor: mode === "dark" ? "#1a1c2e" : undefined,
              },
            },

            MuiTablePagination: {
              root: {
                color: mode === "dark" ? "#e8eaed" : undefined,
              },
              caption: {
                color: mode === "dark" ? "#9aa0a6" : undefined,
              },
              selectIcon: {
                color: mode === "dark" ? "rgba(255,255,255,0.7)" : undefined,
              },
            },

            MuiChip: {
              root: {
                color: mode === "dark" ? "#e8eaed" : undefined,
                borderColor: mode === "dark" ? "rgba(255,255,255,0.15)" : undefined,
              },
              outlined: {
                borderColor: mode === "dark" ? "rgba(255,255,255,0.2)" : undefined,
              },
              deleteIcon: {
                color: mode === "dark" ? "rgba(255,255,255,0.5)" : undefined,
              },
            },

            MuiTypography: {
              root: {
                color: mode === "dark" ? "#e8eaed" : undefined,
              },
              colorTextSecondary: {
                color: mode === "dark" ? "#9aa0a6 !important" : undefined,
              },
              colorTextPrimary: {
                color: mode === "dark" ? "#e8eaed !important" : undefined,
              },
              colorInherit: {
                color: "inherit",
              },
            },

            MuiSwitch: {
              root: {
                width: 42,
                height: 24,
                padding: 0,
                display: "flex",
              },
              switchBase: {
                padding: 3,
                color: mode === "dark" ? "#718096" : "#a0aec0",
                "&$checked": {
                  transform: "translateX(18px)",
                  color: "#fff",
                  "& + $track": {
                    opacity: 1,
                    backgroundColor: "#555",
                    borderColor: "#777",
                  },
                },
                "&$checked + $track": {
                  opacity: 1,
                  backgroundColor: "#555",
                  borderColor: "#777",
                },
              },
              thumb: {
                width: 18,
                height: 18,
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              },
              track: {
                borderRadius: 12,
                opacity: 1,
                backgroundColor: mode === "dark" ? "#2d3748" : "#cbd5e0",
                border: mode === "dark" ? "1px solid #4a5568" : "1px solid #a0aec0",
              },
              checked: {},
            },

            MuiFormControlLabel: {
              label: {
                color: mode === "dark" ? "#e8eaed" : undefined,
              }
            },

            // Divider
            MuiDivider: {
              root: {
                backgroundColor: mode === "dark" ? "rgba(255,255,255,0.08)" : undefined,
              },
            },

            // Accordion
            MuiAccordion: {
              root: {
                backgroundColor: mode === "dark" ? "#141620" : undefined,
                color: mode === "dark" ? "#e8eaed" : undefined,
              },
            },

            MuiAccordionSummary: {
              root: {
                color: mode === "dark" ? "#e8eaed" : undefined,
              },
            },

            MuiAccordionDetails: {
              root: {
                color: mode === "dark" ? "#e8eaed" : undefined,
              },
            },

            // Tooltip
            MuiTooltip: {
              tooltip: {
                backgroundColor: mode === "dark" ? "#2a2d40" : undefined,
                color: mode === "dark" ? "#e8eaed" : undefined,
              },
            },

            // Badge
            MuiBadge: {
              colorSecondary: {
                color: "#ffffff",
              },
            },

            // Breadcrumbs
            MuiBreadcrumbs: {
              root: {
                color: mode === "dark" ? "#9aa0a6" : undefined,
              },
            },

            // Stepper
            MuiStepLabel: {
              label: {
                color: mode === "dark" ? "#9aa0a6" : undefined,
                '&.MuiStepLabel-active': {
                  color: mode === "dark" ? "#e8eaed" : undefined,
                },
                '&.MuiStepLabel-completed': {
                  color: mode === "dark" ? "#e8eaed" : undefined,
                },
              },
            },

            // ListItem active styling
            MuiListItem: {
              root: {
                color: mode === "dark" ? "#e8eaed" : undefined,
                '&.Mui-selected': {
                  backgroundColor: mode === "dark"
                    ? `${primaryColorDark}15`
                    : `${primaryColorLight}10`,
                  '&:hover': {
                    backgroundColor: mode === "dark"
                      ? `${primaryColorDark}20`
                      : `${primaryColorLight}15`,
                  },
                  '& .MuiListItemIcon-root': {
                    color: mode === "dark" ? primaryColorDark : primaryColorLight,
                  },
                  '& .MuiListItemText-primary': {
                    color: mode === "dark" ? primaryColorDark : primaryColorLight,
                    fontWeight: 600,
                  },
                }
              }
            },

            MuiListItemIcon: {
              root: {
                color: mode === "dark" ? "rgba(255,255,255,0.7)" : undefined,
              }
            },

            MuiListItemText: {
              primary: {
                color: mode === "dark" ? "#e8eaed" : undefined,
              },
              secondary: {
                color: mode === "dark" ? "#9aa0a6" : undefined,
              },
            },

            MuiListSubheader: {
              root: {
                color: mode === "dark" ? "#9aa0a6" : undefined,
                backgroundColor: mode === "dark" ? "#141620" : undefined,
              },
            },

            // Checkbox / Radio
            MuiCheckbox: {
              root: {
                color: mode === "dark" ? "rgba(255,255,255,0.5)" : undefined,
              },
            },

            MuiRadio: {
              root: {
                color: mode === "dark" ? "rgba(255,255,255,0.5)" : undefined,
              },
            },

            // Snackbar
            MuiSnackbarContent: {
              root: {
                backgroundColor: mode === "dark" ? "#2a2d40" : undefined,
                color: mode === "dark" ? "#e8eaed" : undefined,
              },
            },

            // Backdrop
            MuiBackdrop: {
              root: {
                backgroundColor: mode === "dark" ? "rgba(0,0,0,0.7)" : undefined,
              },
            },

            // Avatar fallback text
            MuiAvatar: {
              colorDefault: {
                backgroundColor: mode === "dark" ? "#2a2d40" : undefined,
                color: mode === "dark" ? "#e8eaed" : undefined,
              },
            },
          },

          mode,
          appLogoLight,
          appLogoDark,
          appLogoFavicon,
          appName,
          calculatedLogoDark: () => {
            if (
              appLogoDark === defaultLogoDark &&
              appLogoLight !== defaultLogoLight
            ) {
              return appLogoLight;
            }
            return appLogoDark;
          },
          calculatedLogoLight: () => {
            if (
              appLogoDark !== defaultLogoDark &&
              appLogoLight === defaultLogoLight
            ) {
              return appLogoDark;
            }
            return appLogoLight;
          },
        },
        locale
      ),
    [
      appLogoLight,
      appLogoDark,
      appLogoFavicon,
      appName,
      locale,
      mode,
      primaryColorDark,
      primaryColorLight, // Essas são as cores que vêm do tema dinâmico
    ]
  );

  useEffect(() => {
    window.localStorage.setItem("preferredTheme", mode);
  }, [mode]);

  useEffect(() => {
    getPublicSetting("primaryColorLight")
      .then((color) => {
        setPrimaryColorLight(color || "#0000FF");
      })
      .catch((error) => {
      });
    getPublicSetting("primaryColorDark")
      .then((color) => {
        setPrimaryColorDark(color || "#39ACE7");
      })
      .catch((error) => {
      });
    getPublicSetting("appLogoLight")
      .then((file) => {
        const lightLogoUrl = file ? getBackendUrl() + "/public/" + file : defaultLogoLight;
        setAppLogoLight(lightLogoUrl);
        localStorage.setItem("wl_logoLight", lightLogoUrl);
      })
      .catch((error) => {
      });
    getPublicSetting("appLogoDark")
      .then((file) => {
        const darkLogoUrl = file ? getBackendUrl() + "/public/" + file : defaultLogoDark;
        setAppLogoDark(darkLogoUrl);
        localStorage.setItem("wl_logoDark", darkLogoUrl);
        // A splash usa appLogoSplash quando disponível; o fallback por tema é tratado abaixo.
      })
      .catch((error) => {
      });
    getPublicSetting("appLogoSplash")
      .then((file) => {
        if (!file) return;
        const splashUrl = getBackendUrl() + "/public/" + file;
        localStorage.setItem("wl_logoSplash", splashUrl);
        const splashLogo = document.getElementById('splash-logo');
        if (splashLogo) splashLogo.src = splashUrl;
      })
      .catch((error) => {
      });
    getPublicSetting("appLogoFavicon")
      .then((file) => {
        const faviconUrl = file ? getBackendUrl() + "/public/" + file : defaultLogoFavicon;
        setAppLogoFavicon(faviconUrl);
        localStorage.setItem("wl_favicon", faviconUrl);

        // Atualiza o manifest.json com favicon, appLogoMobile e appNameMobile
        Promise.all([
          getPublicSetting("appNameMobile"),
          getPublicSetting("appLogoMobile"),
          // appName e a cor entram aqui para o manifest tambem ficar
          // whitelabel. Antes so `appNameMobile` era considerado: quem nao
          // preenchia esse campo especifico ficava com o "EquipeChat" fixo do
          // manifest.json estatico — e era isso que aparecia na barra de
          // titulo do app instalado no Windows.
          getPublicSetting("appName"),
          getPublicSetting("primaryColorLight"),
        ])
          .then(([mobileName, mobileLogoFile, nomeEmpresa, corPrimaria]) => {
            const manifestLink = document.querySelector('link[rel="manifest"]');
            if (manifestLink) {
              // Sempre buscar o manifest original estático, nunca o blob URL
              const originalManifestUrl = window.location.origin + "/manifest.json";
              fetch(originalManifestUrl)
                .then(r => r.json())
                .then(manifest => {
                  // ── Por que isso é obrigatório ──────────────────────────────────
                  // O manifest abaixo vira um Blob (`URL.createObjectURL`) para poder
                  // ser customizado com o logo/nome da empresa sem precisar de um
                  // endpoint dinâmico no backend. Só que URLs relativas dentro de um
                  // manifest só resolvem contra a URL do PRÓPRIO manifest — e a URL
                  // de um blob: não tem origem/caminho para resolver "/tickets" ou
                  // "/icon-96x96.png" contra. Resultado: o Chrome/Edge loga
                  // "property 'start_url' ignored, URL is invalid" (mesmo para scope
                  // e cada ícone) e o app nunca fica instalável — nenhum
                  // beforeinstallprompt dispara. Resolvendo tudo para URL absoluta
                  // ANTES de gerar o blob evita o problema inteiro.
                  const origin = window.location.origin;
                  const toAbsolute = (url) => {
                    try {
                      return new URL(url, origin).href;
                    } catch (_) {
                      return url;
                    }
                  };
                  if (manifest.start_url) manifest.start_url = toAbsolute(manifest.start_url);
                  if (manifest.scope) manifest.scope = toAbsolute(manifest.scope);
                  if (Array.isArray(manifest.icons)) {
                    manifest.icons = manifest.icons.map((icon) => ({
                      ...icon,
                      src: icon.src ? toAbsolute(icon.src) : icon.src,
                    }));
                  }
                  // Ordem de preferencia: nome mobile especifico > nome da
                  // empresa > o que ja estava no manifest.
                  const nomeDoApp = mobileName || nomeEmpresa;
                  if (nomeDoApp) {
                    manifest.name = nomeDoApp;
                    manifest.short_name = nomeDoApp;
                  }

                  // COR DO APP
                  // `theme_color` pinta a barra de titulo do app instalado no
                  // Windows e a barra de status no Android. Estava fixa em
                  // #4E93FF no manifest.json, entao mesmo com whitelabel o
                  // app abria com a cor padrao.
                  //
                  // Valida o formato antes de aplicar: cor invalida faz o
                  // Chrome descartar o manifest inteiro, e ai o app perde
                  // tambem nome e icone.
                  const corValida =
                    typeof corPrimaria === "string" &&
                    /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(corPrimaria.trim());

                  if (corValida) {
                    manifest.theme_color = corPrimaria.trim();

                    // A meta theme-color do documento vale para a aba comum do
                    // navegador; o manifest so vale para o app instalado.
                    let metaCor = document.querySelector('meta[name="theme-color"]');
                    if (!metaCor) {
                      metaCor = document.createElement("meta");
                      metaCor.name = "theme-color";
                      document.head.appendChild(metaCor);
                    }
                    metaCor.content = corPrimaria.trim();
                  }
                  // Prioriza appLogoMobile para ícones do PWA, senão usa favicon
                  const iconUrl = mobileLogoFile
                    ? getBackendUrl() + "/public/" + mobileLogoFile
                    : (file ? faviconUrl : null);
                  if (iconUrl) {
                    // Cache-buster para forçar o navegador / PWA a recarregar o ícone
                    const versionedIcon = iconUrl + (iconUrl.includes("?") ? "&" : "?") + "v=" + Date.now();
                    manifest.icons = [
                      { src: versionedIcon, sizes: "96x96",   type: "image/png", purpose: "any" },
                      { src: versionedIcon, sizes: "144x144", type: "image/png", purpose: "any" },
                      { src: versionedIcon, sizes: "192x192", type: "image/png", purpose: "any" },
                      { src: versionedIcon, sizes: "512x512", type: "image/png", purpose: "any" },
                      { src: versionedIcon, sizes: "192x192", type: "image/png", purpose: "maskable" },
                      { src: versionedIcon, sizes: "512x512", type: "image/png", purpose: "maskable" }
                    ];

                    // Atualizar apple-touch-icon (iOS PWA não usa manifest.icons)
                    let appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
                    if (!appleIcon) {
                      appleIcon = document.createElement("link");
                      appleIcon.rel = "apple-touch-icon";
                      document.head.appendChild(appleIcon);
                    }
                    appleIcon.href = versionedIcon;

                    // Atualizar favicon do browser também (rel="icon")
                    const iconLink = document.querySelector('link[rel="icon"]');
                    if (iconLink) iconLink.href = versionedIcon;
                  }
                  // Revogar blob URL anterior se existir
                  if (manifestLink.href.startsWith("blob:")) {
                    URL.revokeObjectURL(manifestLink.href);
                  }
                  const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
                  manifestLink.href = URL.createObjectURL(blob);
                })
                .catch(() => {});
            }
          })
          .catch(() => {});
      })
      .catch((error) => {
      });
    getPublicSetting("appName")
      .then((name) => {
        const finalName = name || "Equipechat";
        setAppName(finalName);
        localStorage.setItem("wl_appName", finalName);
        document.title = finalName;
      })
      .catch((error) => {
        setAppName("Equipechat");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(
      "--primaryColor",
      mode === "light" ? primaryColorLight : primaryColorDark
    );
  }, [primaryColorLight, primaryColorDark, mode]);

  useEffect(() => {
    async function fetchVersionData() {
      try {
        const response = await api.get("/version");
        const { data } = response;
        window.localStorage.setItem("frontendVersion", data.version);
      } catch (error) {
      }
    }
    fetchVersionData();
  }, []);

  return (
    <>
      <Favicon
        url={
          appLogoFavicon
            ? appLogoFavicon
            : defaultLogoFavicon
        }
      />
      <ColorModeContext.Provider value={{ colorMode }}>
        <ThemeProvider theme={theme}>
          <QueryClientProvider client={queryClient}>
            <ActiveMenuProvider>
              <Routes />
            </ActiveMenuProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </ColorModeContext.Provider>
    </>
  );
};

export default App;
