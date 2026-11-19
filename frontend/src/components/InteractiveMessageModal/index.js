import React, { useState, useCallback, useEffect, useContext } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Typography, IconButton, Tabs, Tab, Box, Divider, Paper, Chip, Tooltip, Menu, MenuItem, ListItemIcon, ListItemText, FormControlLabel, Switch, CircularProgress } from "@material-ui/core";
import Close from "@material-ui/icons/Close";
import FormatListBulleted from "@material-ui/icons/FormatListBulleted";
import LocalOffer from "@material-ui/icons/LocalOffer";
import Payment from "@material-ui/icons/Payment";
import LinkIcon from "@material-ui/icons/Link";
import Phone from "@material-ui/icons/Phone";
import LocationOn from "@material-ui/icons/LocationOn";
import ViewCarousel from "@material-ui/icons/ViewCarousel";
import Storefront from "@material-ui/icons/Storefront";
import Poll from "@material-ui/icons/Poll";
import Add from "@material-ui/icons/Add";
import Delete from "@material-ui/icons/Delete";
import Send from "@material-ui/icons/Send";
import Save from "@material-ui/icons/Save";
import FolderOpen from "@material-ui/icons/FolderOpen";
import BookmarkBorder from "@material-ui/icons/BookmarkBorder";
import Bookmark from "@material-ui/icons/Bookmark";
import Receipt from "@material-ui/icons/Receipt";
import ImageIcon from "@material-ui/icons/Image";
import SmartButton from "@mui/icons-material/SmartButton";
import Autocomplete from "@material-ui/lab/Autocomplete";
import { makeStyles } from "@material-ui/core/styles";
import { toast } from "react-toastify";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";
import { formatCurrency, getCompanyCurrency, getCurrencyInfo } from "../../helpers/currencyHelper";
import useCompanyCurrency from "../../hooks/useCompanyCurrency";
import { AuthContext } from "../../context/Auth/AuthContext";
import LocationPicker from "./LocationPicker";

const useStyles = makeStyles((theme) => ({
  dialogPaper: {
    maxWidth: 600,
    width: "100%",
    borderRadius: 12,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  headerTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  tabsRoot: {
    minHeight: 42,
  },
  tab: {
    minWidth: 48,
    minHeight: 42,
    padding: "6px 10px",
    fontSize: 11,
  },
  content: {
    padding: "16px !important",
    maxHeight: "60vh",
    overflowY: "auto",
  },
  fieldRow: {
    marginBottom: 12,
  },
  optionRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  optionNumber: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    backgroundColor: theme.palette.primary.main,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 600,
    flexShrink: 0,
  },
  addBtn: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    cursor: "pointer",
    color: theme.palette.primary.main,
    fontSize: 13,
    fontWeight: 600,
    padding: "6px 0",
  },
  previewBox: {
    backgroundColor: "#075E54",
    borderRadius: 8,
    padding: 12,
    color: "#fff",
    marginTop: 12,
  },
  previewTitle: {
    fontWeight: 600,
    fontSize: 14,
    marginBottom: 4,
  },
  previewBody: {
    fontSize: 12,
    opacity: 0.9,
    marginBottom: 8,
  },
  previewFooter: {
    fontSize: 11,
    opacity: 0.7,
  },
  previewButton: {
    color: "#00a5f4",
    textAlign: "center",
    padding: "6px 0",
    fontSize: 13,
    fontWeight: 600,
    borderTop: "1px solid rgba(255,255,255,0.15)",
  },
  infoAlert: {
    backgroundColor: "#E8F5E9",
    border: "1px solid #A5D6A7",
    borderRadius: 8,
    padding: "8px 12px",
    marginBottom: 12,
    fontSize: 12,
    color: "#2E7D32",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  sectionBox: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  templateBar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 16px",
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.type === "dark" ? "rgba(255,255,255,0.03)" : "#FAFAFA",
  },
  templateChip: {
    cursor: "pointer",
    fontSize: 12,
  },
  templateMenu: {
    maxHeight: 300,
  },
  saveDialog: {
    minWidth: 350,
  },
}));

const TAB_CONFIG = [
  { label: i18n.t("interactiveMessageModal.tabs.buttons"), icon: <SmartButton style={{ fontSize: 16 }} />, type: "button" },
  { label: i18n.t("interactiveMessageModal.tabs.list"), icon: <FormatListBulleted style={{ fontSize: 16 }} />, type: "list" },
  { label: i18n.t("interactiveMessageModal.tabs.billing"), icon: <Receipt style={{ fontSize: 16 }} />, type: "cobranca" },
  { label: i18n.t("interactiveMessageModal.tabs.offers"), icon: <LocalOffer style={{ fontSize: 16 }} />, type: "offer" },
  { label: i18n.t("interactiveMessageModal.tabs.pix"), icon: <Payment style={{ fontSize: 16 }} />, type: "pix" },
  { label: i18n.t("interactiveMessageModal.tabs.url"), icon: <LinkIcon style={{ fontSize: 16 }} />, type: "url" },
  { label: i18n.t("interactiveMessageModal.tabs.call"), icon: <Phone style={{ fontSize: 16 }} />, type: "call" },
  { label: i18n.t("interactiveMessageModal.tabs.location"), icon: <LocationOn style={{ fontSize: 16 }} />, type: "location" },
  { label: i18n.t("interactiveMessageModal.tabs.carousel"), icon: <ViewCarousel style={{ fontSize: 16 }} />, type: "carousel" },
  { label: i18n.t("interactiveMessageModal.tabs.catalog"), icon: <Storefront style={{ fontSize: 16 }} />, type: "catalog" },
  { label: i18n.t("interactiveMessageModal.tabs.poll"), icon: <Poll style={{ fontSize: 16 }} />, type: "poll" },
];

const InteractiveMessageModal = ({ open, onClose, ticketId, ticketChannel, initialType }) => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  useCompanyCurrency(user?.companyId);
  const currencyCode = getCurrencyInfo(getCompanyCurrency()).code;
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);

  // Templates state
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateMenuAnchor, setTemplateMenuAnchor] = useState(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [activeTemplateName, setActiveTemplateName] = useState("");

  // Common fields
  const [bodyText, setBodyText] = useState("");
  const [footerText, setFooterText] = useState("");

  // Buttons
  const [buttons, setButtons] = useState([
    { displayText: "", id: "1" },
    { displayText: "", id: "2" },
  ]);

  // List
  const [listButtonText, setListButtonText] = useState(i18n.t("hardcoded.select"));
  const [sections, setSections] = useState([
    {
      title: i18n.t("hardcoded.options"),
      rows: [
        { title: "", description: "", id: "1" },
        { title: "", description: "", id: "2" },
      ],
    },
  ]);

  // Location
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");

  // URL
  const [urlText, setUrlText] = useState("");
  const [url, setUrl] = useState("");

  // Call
  const [callText, setCallText] = useState("");
  const [callNumber, setCallNumber] = useState("");
  const [callContacts, setCallContacts] = useState([]);
  const [callContactSearch, setCallContactSearch] = useState("");
  const [callContactsLoading, setCallContactsLoading] = useState(false);

  // PIX
  const [pixKey, setPixKey] = useState("");
  const [pixName, setPixName] = useState("");
  const [pixCity, setPixCity] = useState("");
  const [pixAmount, setPixAmount] = useState("");
  const [pixCopyPaste, setPixCopyPaste] = useState("");
  const [pixButtonText, setPixButtonText] = useState("Copiar código PIX");
  const [pixIncludeQrCode, setPixIncludeQrCode] = useState(false);
  const [pixDocumentUrl, setPixDocumentUrl] = useState("");
  const [pixDocumentName, setPixDocumentName] = useState("");
  const [pixTotal, setPixTotal] = useState("");

  // Poll
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);

  // Offer
  const [offerTitle, setOfferTitle] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [offerDescription, setOfferDescription] = useState("");

  // Carousel
  const [carouselCards, setCarouselCards] = useState([
    { title: "", body: "", buttons: [{ displayText: "", id: "1" }] },
  ]);
  const [cardUploading, setCardUploading] = useState({});

  // Cobrança
  const [cobrancaNumber, setCobrancaNumber] = useState("");
  const [cobrancaDescription, setCobrancaDescription] = useState("");
  const [cobrancaQuantity, setCobrancaQuantity] = useState("1");
  const [cobrancaAmount, setCobrancaAmount] = useState("");
  const [cobrancaMessage, setCobrancaMessage] = useState("");
  const [cobrancaPaymentUrl, setCobrancaPaymentUrl] = useState("");
  const [cobrancaButtonText, setCobrancaButtonText] = useState(i18n.t("hardcoded.reviewAndPay"));
  const [cobrancaPdfFile, setCobrancaPdfFile] = useState(null);
  const [cobrancaPdfName, setCobrancaPdfName] = useState("");

  const currentType = TAB_CONFIG[activeTab]?.type;

  // ===== TEMPLATES =====
  const fetchTemplates = useCallback(async () => {
    try {
      setLoadingTemplates(true);
      const { data } = await api.get("/interactive-templates");
      setTemplates(data);
    } catch (err) {
      console.error("Erro ao buscar templates:", err);
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchTemplates();
  }, [open, fetchTemplates]);

  // Quando aberto com um tipo inicial (ex.: PIX vindo do menu "+"), seleciona a aba correta
  useEffect(() => {
    if (open && initialType) {
      const tabIdx = TAB_CONFIG.findIndex((t) => t.type === initialType);
      if (tabIdx >= 0) setActiveTab(tabIdx);
    }
  }, [open, initialType]);

  // Busca contatos da aba de contatos para o seletor de Ligação
  useEffect(() => {
    if (!open) return;
    const delay = setTimeout(async () => {
      setCallContactsLoading(true);
      try {
        const { data } = await api.get("/contacts", {
          params: { searchParam: callContactSearch, pageNumber: 1 },
        });
        setCallContacts(data.contacts || []);
      } catch (e) {
        setCallContacts([]);
      } finally {
        setCallContactsLoading(false);
      }
    }, 350);
    return () => clearTimeout(delay);
  }, [open, callContactSearch]);

  const getCurrentFormData = () => {
    const data = { bodyText, footerText };
    switch (currentType) {
      case "button": return { ...data, buttons };
      case "list": return { ...data, listButtonText, sections };
      case "location": return { ...data, latitude, longitude, locationName, locationAddress };
      case "url": return { ...data, urlText, url };
      case "call": return { ...data, callText, callNumber };
      case "pix": return { ...data, pixKey, pixName, pixCity, pixAmount, pixCopyPaste, pixButtonText, pixIncludeQrCode, pixDocumentUrl, pixDocumentName, pixTotal };
      case "poll": return { ...data, pollQuestion, pollOptions };
      case "offer": return { ...data, offerTitle, offerPrice, offerDescription };
      case "carousel":
      case "catalog": return { ...data, carouselCards };
      case "cobranca": return { ...data, cobrancaNumber, cobrancaDescription, cobrancaQuantity, cobrancaAmount, cobrancaMessage, cobrancaPaymentUrl, cobrancaButtonText };
      default: return data;
    }
  };

  const loadTemplateData = (tpl) => {
    const d = tpl.templateData;
    // Switch to correct tab
    const tabIdx = TAB_CONFIG.findIndex(t => t.type === tpl.interactiveType);
    if (tabIdx >= 0) setActiveTab(tabIdx);

    setBodyText(d.bodyText || "");
    setFooterText(d.footerText || "");
    setActiveTemplateName(tpl.name);

    switch (tpl.interactiveType) {
      case "button":
        setButtons(d.buttons || [{ displayText: "", id: "1" }]);
        break;
      case "list":
        setListButtonText(d.listButtonText || i18n.t("hardcoded.select"));
        setSections(d.sections || [{ title: i18n.t("hardcoded.options"), rows: [{ title: "", description: "", id: "1" }] }]);
        break;
      case "location":
        setLatitude(d.latitude || "");
        setLongitude(d.longitude || "");
        setLocationName(d.locationName || "");
        setLocationAddress(d.locationAddress || "");
        break;
      case "url":
        setUrlText(d.urlText || "");
        setUrl(d.url || "");
        break;
      case "call":
        setCallText(d.callText || "");
        setCallNumber(d.callNumber || "");
        break;
      case "pix":
        setPixKey(d.pixKey || "");
        setPixName(d.pixName || "");
        setPixCity(d.pixCity || "");
        setPixAmount(d.pixAmount || "");
        setPixCopyPaste(d.pixCopyPaste || "");
        setPixButtonText(d.pixButtonText || "Copiar código PIX");
        setPixIncludeQrCode(!!d.pixIncludeQrCode);
        setPixDocumentUrl(d.pixDocumentUrl || "");
        setPixDocumentName(d.pixDocumentName || "");
        setPixTotal(d.pixTotal || "");
        break;
      case "poll":
        setPollQuestion(d.pollQuestion || "");
        setPollOptions(d.pollOptions || ["", ""]);
        break;
      case "offer":
        setOfferTitle(d.offerTitle || "");
        setOfferPrice(d.offerPrice || "");
        setOfferDescription(d.offerDescription || "");
        break;
      case "carousel":
      case "catalog":
        setCarouselCards(d.carouselCards || [{ title: "", body: "", buttons: [{ displayText: "", id: "1" }] }]);
        break;
      case "cobranca":
        setCobrancaNumber(d.cobrancaNumber || "");
        setCobrancaDescription(d.cobrancaDescription || "");
        setCobrancaQuantity(d.cobrancaQuantity || "1");
        setCobrancaAmount(d.cobrancaAmount || "");
        setCobrancaMessage(d.cobrancaMessage || "");
        setCobrancaPaymentUrl(d.cobrancaPaymentUrl || "");
        setCobrancaButtonText(d.cobrancaButtonText || "Revisar e pagar");
        break;
    }
    setTemplateMenuAnchor(null);
    toast.info(i18n.t("interactiveMessageModalExtra.templateLoaded", { name: tpl.name }));
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast.error(i18n.t("interactiveMessageModal.templateNameRequired"));
      return;
    }
    try {
      await api.post("/interactive-templates", {
        name: templateName,
        interactiveType: currentType,
        templateData: getCurrentFormData(),
      });
      toast.success(i18n.t("interactiveMessageModal.templateSaved"));
      setTemplateName("");
      setSaveDialogOpen(false);
      setActiveTemplateName(templateName);
      fetchTemplates();
    } catch (err) {
      toast.error(i18n.t("interactiveMessageModal.templateSaveError"));
    }
  };

  const handleDeleteTemplate = async (id, e) => {
    e.stopPropagation();
    try {
      await api.delete(`/interactive-templates/${id}`);
      toast.success(i18n.t("interactiveMessageModal.templateRemoved"));
      fetchTemplates();
    } catch (err) {
      toast.error(i18n.t("interactiveMessageModal.templateRemoveError"));
    }
  };

  const filteredTemplates = templates.filter(t => t.interactiveType === currentType);

  // ===== HANDLERS (same as before) =====
  const handleAddButton = () => {
    if (buttons.length < 3) {
      setButtons([...buttons, { displayText: "", id: String(buttons.length + 1) }]);
    }
  };

  const handleRemoveButton = (index) => {
    setButtons(buttons.filter((_, i) => i !== index));
  };

  const handleButtonChange = (index, value) => {
    const newBtns = [...buttons];
    newBtns[index] = { ...newBtns[index], displayText: value };
    setButtons(newBtns);
  };

  const handleAddRow = (sectionIdx) => {
    const newSections = [...sections];
    const rows = newSections[sectionIdx].rows;
    if (rows.length < 10) {
      rows.push({ title: "", description: "", id: String(rows.length + 1) });
      setSections(newSections);
    }
  };

  const handleRemoveRow = (sectionIdx, rowIdx) => {
    const newSections = [...sections];
    newSections[sectionIdx].rows = newSections[sectionIdx].rows.filter((_, i) => i !== rowIdx);
    setSections(newSections);
  };

  const handleRowChange = (sectionIdx, rowIdx, field, value) => {
    const newSections = [...sections];
    newSections[sectionIdx].rows[rowIdx][field] = value;
    setSections(newSections);
  };

  const handleAddPollOption = () => {
    if (pollOptions.length < 12) {
      setPollOptions([...pollOptions, ""]);
    }
  };

  const handleRemovePollOption = (index) => {
    setPollOptions(pollOptions.filter((_, i) => i !== index));
  };

  const handlePollOptionChange = (index, value) => {
    const newOpts = [...pollOptions];
    newOpts[index] = value;
    setPollOptions(newOpts);
  };

  const handleAddCard = () => {
    if (carouselCards.length < 10) {
      setCarouselCards([...carouselCards, { title: "", body: "", buttons: [{ displayText: "", id: "1" }] }]);
    }
  };

  const handleRemoveCard = (index) => {
    setCarouselCards(carouselCards.filter((_, i) => i !== index));
  };

  const handleCardChange = (index, field, value) => {
    const newCards = [...carouselCards];
    newCards[index] = { ...newCards[index], [field]: value };
    setCarouselCards(newCards);
  };

  const handleCardButtonChange = (cardIndex, buttonIndex, value) => {
    const newCards = [...carouselCards];
    const cardButtons = newCards[cardIndex].buttons || [{ displayText: "", id: "1" }];
    cardButtons[buttonIndex] = {
      ...cardButtons[buttonIndex],
      displayText: value,
      id: cardButtons[buttonIndex]?.id || String(buttonIndex + 1),
    };
    newCards[cardIndex] = { ...newCards[cardIndex], buttons: cardButtons };
    setCarouselCards(newCards);
  };

  const handleCardImageUpload = async (index, file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(i18n.t("interactiveMessageModalExtra.cardImageInvalid") || "Selecione um arquivo de imagem.");
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      toast.error(i18n.t("interactiveMessageModal.pdfTooBig") || "Arquivo muito grande (máx. 16MB).");
      return;
    }
    setCardUploading((prev) => ({ ...prev, [index]: true }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await api.post("/interactive/upload-media", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const filename = uploadRes.data?.filename || uploadRes.data?.[0]?.filename || "";
      if (!filename) throw new Error("upload");
      handleCardChange(index, "imageUrl", filename);
      handleCardChange(index, "imageName", file.name);
    } catch (err) {
      toast.error(i18n.t("interactiveMessageModalExtra.cardImageUploadError") || "Erro ao enviar a imagem.");
    } finally {
      setCardUploading((prev) => ({ ...prev, [index]: false }));
    }
  };

  const handleRemoveCardImage = (index) => {
    const newCards = [...carouselCards];
    newCards[index] = { ...newCards[index], imageUrl: "", imageName: "" };
    setCarouselCards(newCards);
  };

  const handleSend = async () => {
    if (!bodyText.trim() && !["poll", "location", "cobranca", "pix"].includes(currentType)) {
      toast.error(i18n.t("interactiveMessageModal.fillMessageText"));
      return;
    }

    setLoading(true);
    try {
      const payload = {
        interactiveType: currentType,
        bodyText,
        footerText: footerText || undefined,
      };

      switch (currentType) {
        case "button":
          const validBtns = buttons.filter(b => b.displayText.trim());
          if (validBtns.length === 0) {
            toast.error(i18n.t("interactiveMessageModal.addAtLeastOneButton"));
            setLoading(false);
            return;
          }
          payload.buttons = validBtns;
          break;
        case "list":
          const validSections = sections.map(s => ({
            ...s,
            rows: s.rows.filter(r => r.title.trim()),
          })).filter(s => s.rows.length > 0);
          if (validSections.length === 0) {
            toast.error(i18n.t("interactiveMessageModal.addAtLeastOneOption"));
            setLoading(false);
            return;
          }
          payload.listButtonText = listButtonText;
          payload.sections = validSections;
          break;
        case "location":
          if (!latitude || !longitude) {
            toast.error(i18n.t("interactiveMessageModal.fillLatLong"));
            setLoading(false);
            return;
          }
          payload.latitude = parseFloat(latitude);
          payload.longitude = parseFloat(longitude);
          payload.locationName = locationName;
          payload.locationAddress = locationAddress;
          break;
        case "url":
          if (!url.trim()) {
            toast.error(i18n.t("interactiveMessageModal.fillUrl"));
            setLoading(false);
            return;
          }
          payload.urlText = urlText;
          payload.url = url;
          break;
        case "call":
          if (!callNumber.trim()) {
            toast.error(i18n.t("interactiveMessageModal.fillPhone"));
            setLoading(false);
            return;
          }
          payload.callText = callText;
          payload.callNumber = callNumber;
          break;
        case "pix":
          if (!pixKey.trim() && !pixCopyPaste.trim()) {
            toast.error("Preencha a chave PIX ou o código PIX copia e cola.");
            setLoading(false);
            return;
          }
          payload.pixKey = pixKey;
          payload.pixName = pixName;
          payload.pixCity = pixCity;
          payload.pixAmount = pixAmount ? parseFloat(pixAmount) : undefined;
          payload.pixCopyPaste = pixCopyPaste || undefined;
          payload.pixButtonText = pixButtonText || undefined;
          payload.pixIncludeQrCode = pixIncludeQrCode;
          payload.pixDocumentUrl = pixDocumentUrl || undefined;
          payload.pixDocumentName = pixDocumentName || undefined;
          payload.pixTotal = pixTotal || undefined;
          break;
        case "poll":
          const validOpts = pollOptions.filter(o => o.trim());
          if (validOpts.length < 2) {
            toast.error(i18n.t("interactiveMessageModal.addAtLeast2Options"));
            setLoading(false);
            return;
          }
          payload.pollQuestion = pollQuestion || bodyText;
          payload.pollOptions = validOpts;
          break;
        case "offer":
          payload.offerTitle = offerTitle;
          payload.offerPrice = offerPrice;
          payload.offerDescription = offerDescription;
          break;
        case "carousel":
        case "catalog":
          const validCards = carouselCards.filter(c => c.title.trim());
          if (validCards.length === 0) {
            toast.error(i18n.t("interactiveMessageModal.addAtLeastOneCard"));
            setLoading(false);
            return;
          }
          payload.carouselCards = validCards;
          break;
        case "cobranca":
          if (!cobrancaDescription.trim()) {
            toast.error(i18n.t("interactiveMessageModal.fillBillingDesc"));
            setLoading(false);
            return;
          }
          // Upload PDF if present
          let pdfPath = "";
          if (cobrancaPdfFile) {
            try {
              const formData = new FormData();
              formData.append("file", cobrancaPdfFile);
              const uploadRes = await api.post("/interactive/upload-pdf", formData, {
                headers: { "Content-Type": "multipart/form-data" },
              });
              pdfPath = uploadRes.data?.filename || uploadRes.data?.[0]?.filename || "";
            } catch (uploadErr) {
              toast.error(i18n.t("interactiveMessageModal.pdfUploadError") || "Erro ao enviar PDF");
              setLoading(false);
              return;
            }
          }
          payload.cobrancaNumber = cobrancaNumber;
          payload.cobrancaDescription = cobrancaDescription;
          payload.cobrancaQuantity = cobrancaQuantity ? parseInt(cobrancaQuantity) : 1;
          payload.cobrancaAmount = cobrancaAmount ? parseFloat(cobrancaAmount) : 0;
          payload.cobrancaMessage = cobrancaMessage;
          payload.cobrancaPaymentUrl = cobrancaPaymentUrl;
          payload.cobrancaButtonText = cobrancaButtonText || "Revisar e pagar";
          payload.cobrancaPdfPath = pdfPath;
          break;
      }

      await api.post(`/messages-interactive/${ticketId}`, payload);
      toast.success(i18n.t("interactiveMessageModal.messageSent"));
      onClose();
    } catch (err) {
      const errMsg = err?.response?.data?.error || err?.message || i18n.t("interactiveMessageModal.messageError");
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  // ===== RENDER TABS (same as before) =====
  const renderButtonsTab = () => (
    <>
      <div className={classes.infoAlert}>
        {i18n.t("interactiveMessageModalExtra.buttonsInfo")}
      </div>
      <TextField label={i18n.t("interactiveMessageModalExtra.messageText")} fullWidth multiline rows={3} variant="outlined" value={bodyText} onChange={(e) => setBodyText(e.target.value)} className={classes.fieldRow} />
      <TextField label={i18n.t("interactiveMessageModalExtra.footer")} fullWidth variant="outlined" size="small" value={footerText} onChange={(e) => setFooterText(e.target.value)} className={classes.fieldRow} />
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="subtitle2">{i18n.t("interactiveMessageModalExtra.buttonsMax")}</Typography>
        {buttons.length < 3 && (
          <div className={classes.addBtn} onClick={handleAddButton}><Add style={{ fontSize: 16 }} /> {i18n.t("interactiveMessageModalExtra.add")}</div>
        )}
      </Box>
      {buttons.map((btn, idx) => (
        <div key={idx} className={classes.optionRow}>
          <div className={classes.optionNumber}>{idx + 1}</div>
          <TextField fullWidth size="small" variant="outlined" placeholder={i18n.t("interactiveMessageModalExtra.optionPlaceholder", { n: idx + 1 })} value={btn.displayText} onChange={(e) => handleButtonChange(idx, e.target.value)} inputProps={{ maxLength: 20 }} />
          {buttons.length > 1 && (
            <IconButton size="small" onClick={() => handleRemoveButton(idx)}><Delete color="error" fontSize="small" /></IconButton>
          )}
        </div>
      ))}
    </>
  );

  const renderListTab = () => (
    <>
      <div className={classes.infoAlert}>{i18n.t("interactiveMessageModalExtra.listInfo")}</div>
      <TextField label={i18n.t("interactiveMessageModalExtra.messageText")} fullWidth multiline rows={3} variant="outlined" value={bodyText} onChange={(e) => setBodyText(e.target.value)} className={classes.fieldRow} />
      <TextField label={i18n.t("interactiveMessageModalExtra.footer")} fullWidth variant="outlined" size="small" value={footerText} onChange={(e) => setFooterText(e.target.value)} className={classes.fieldRow} />
      <TextField label={i18n.t("interactiveMessageModalExtra.buttonText")} fullWidth variant="outlined" size="small" value={listButtonText} onChange={(e) => setListButtonText(e.target.value)} className={classes.fieldRow} />
      {sections.map((sec, sIdx) => (
        <div key={sIdx} className={classes.sectionBox}>
          <TextField label={i18n.t("interactiveMessageModalExtra.sectionTitle")} fullWidth size="small" variant="outlined" value={sec.title} onChange={(e) => { const newSec = [...sections]; newSec[sIdx].title = e.target.value; setSections(newSec); }} style={{ marginBottom: 8 }} />
          {sec.rows.map((row, rIdx) => (
            <div key={rIdx} className={classes.optionRow}>
              <div className={classes.optionNumber}>{rIdx + 1}</div>
              <TextField size="small" variant="outlined" placeholder={i18n.t("interactiveMessageModalExtra.titleLabel")} value={row.title} onChange={(e) => handleRowChange(sIdx, rIdx, "title", e.target.value)} inputProps={{ maxLength: 24 }} style={{ flex: 1 }} />
              <TextField size="small" variant="outlined" placeholder={i18n.t("interactiveMessageModalExtra.descriptionLabel")} value={row.description} onChange={(e) => handleRowChange(sIdx, rIdx, "description", e.target.value)} inputProps={{ maxLength: 72 }} style={{ flex: 1 }} />
              {sec.rows.length > 1 && (
                <IconButton size="small" onClick={() => handleRemoveRow(sIdx, rIdx)}><Delete color="error" fontSize="small" /></IconButton>
              )}
            </div>
          ))}
          {sec.rows.length < 10 && (
            <div className={classes.addBtn} onClick={() => handleAddRow(sIdx)}><Add style={{ fontSize: 16 }} /> {i18n.t("interactiveMessageModalExtra.addOption")}</div>
          )}
        </div>
      ))}
    </>
  );

  const renderOfferTab = () => (
    <>
      <div className={classes.infoAlert}>{i18n.t("interactiveMessageModalExtra.offerInfo")}</div>
      <TextField label={i18n.t("interactiveMessageModalExtra.offerTitle")} fullWidth variant="outlined" size="small" value={offerTitle} onChange={(e) => setOfferTitle(e.target.value)} className={classes.fieldRow} />
      <TextField label={i18n.t("interactiveMessageModalExtra.offerBody")} fullWidth multiline rows={3} variant="outlined" value={bodyText} onChange={(e) => setBodyText(e.target.value)} className={classes.fieldRow} />
      <TextField label={i18n.t("interactiveMessageModalExtra.offerPrice")} fullWidth variant="outlined" size="small" value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} className={classes.fieldRow} />
      <TextField label={i18n.t("interactiveMessageModalExtra.offerDetails")} fullWidth variant="outlined" size="small" multiline rows={2} value={offerDescription} onChange={(e) => setOfferDescription(e.target.value)} className={classes.fieldRow} />
      <TextField label={i18n.t("interactiveMessageModalExtra.footer")} fullWidth variant="outlined" size="small" value={footerText} onChange={(e) => setFooterText(e.target.value)} className={classes.fieldRow} />
    </>
  );

  const renderPixTab = () => (
    <>
      <div className={classes.infoAlert}>{i18n.t("interactiveMessageModalExtra.pixInfo")}</div>
      <TextField label={i18n.t("interactiveMessageModalExtra.messageText")} fullWidth multiline rows={2} variant="outlined" value={bodyText} onChange={(e) => setBodyText(e.target.value)} className={classes.fieldRow} />
      <TextField label={i18n.t("interactiveMessageModalExtra.pixCopyPasteLabel")} fullWidth multiline rows={3} variant="outlined" size="small" value={pixCopyPaste} onChange={(e) => setPixCopyPaste(e.target.value)} className={classes.fieldRow} placeholder="00020126...5204000053039865802BR..." helperText={i18n.t("interactiveMessageModalExtra.pixCopyPasteHelper")} />
      <TextField label={i18n.t("interactiveMessageModalExtra.pixButtonTextLabel")} fullWidth variant="outlined" size="small" value={pixButtonText} onChange={(e) => setPixButtonText(e.target.value)} className={classes.fieldRow} />
      <FormControlLabel
        className={classes.fieldRow}
        control={<Switch color="primary" checked={pixIncludeQrCode} onChange={(e) => setPixIncludeQrCode(e.target.checked)} disabled={!pixCopyPaste.trim()} />}
        label={i18n.t("interactiveMessageModalExtra.pixQrCodeLabel")}
      />
      <Divider className={classes.fieldRow} />
      <div className={classes.infoAlert}>{i18n.t("interactiveMessageModalExtra.pixDocInfo")}</div>
      <TextField label={i18n.t("interactiveMessageModalExtra.pixTotalLabel")} fullWidth variant="outlined" size="small" value={pixTotal} onChange={(e) => setPixTotal(e.target.value)} className={classes.fieldRow} placeholder="R$ 130,00" helperText={i18n.t("interactiveMessageModalExtra.pixTotalHelper")} />
      <TextField label={i18n.t("interactiveMessageModalExtra.pixDocUrlLabel")} fullWidth variant="outlined" size="small" value={pixDocumentUrl} onChange={(e) => setPixDocumentUrl(e.target.value)} className={classes.fieldRow} placeholder="https://.../doc.pdf" helperText={i18n.t("interactiveMessageModalExtra.pixDocUrlHelper")} />
      <TextField label={i18n.t("interactiveMessageModalExtra.pixDocNameLabel")} fullWidth variant="outlined" size="small" value={pixDocumentName} onChange={(e) => setPixDocumentName(e.target.value)} className={classes.fieldRow} placeholder="doc.pdf" disabled={!pixDocumentUrl.trim()} />
      <Divider className={classes.fieldRow} />
      <TextField label={i18n.t("interactiveMessageModalExtra.pixKey")} fullWidth variant="outlined" size="small" value={pixKey} onChange={(e) => setPixKey(e.target.value)} className={classes.fieldRow} placeholder={i18n.t("interactiveMessageModalExtra.pixKeyPlaceholder")} />
      <TextField label={i18n.t("interactiveMessageModalExtra.pixBeneficiary")} fullWidth variant="outlined" size="small" value={pixName} onChange={(e) => setPixName(e.target.value)} className={classes.fieldRow} />
      <TextField label={i18n.t("interactiveMessageModalExtra.pixCity")} fullWidth variant="outlined" size="small" value={pixCity} onChange={(e) => setPixCity(e.target.value)} className={classes.fieldRow} />
      <TextField label={i18n.t("interactiveMessageModalExtra.pixAmount")} fullWidth variant="outlined" size="small" type="number" value={pixAmount} onChange={(e) => setPixAmount(e.target.value)} className={classes.fieldRow} />
    </>
  );

  const renderUrlTab = () => (
    <>
      <div className={classes.infoAlert}>{i18n.t("interactiveMessageModalExtra.urlInfo")}</div>
      <TextField label={i18n.t("interactiveMessageModalExtra.messageText")} fullWidth multiline rows={2} variant="outlined" value={bodyText} onChange={(e) => setBodyText(e.target.value)} className={classes.fieldRow} />
      <TextField label={i18n.t("interactiveMessageModalExtra.linkText")} fullWidth variant="outlined" size="small" value={urlText} onChange={(e) => setUrlText(e.target.value)} className={classes.fieldRow} placeholder={i18n.t("interactiveMessageModalExtra.linkPlaceholder")} />
      <TextField label={i18n.t("interactiveMessageModalExtra.urlLabel")} fullWidth variant="outlined" size="small" value={url} onChange={(e) => setUrl(e.target.value)} className={classes.fieldRow} placeholder="https://..." />
      <TextField label={i18n.t("interactiveMessageModalExtra.footer")} fullWidth variant="outlined" size="small" value={footerText} onChange={(e) => setFooterText(e.target.value)} className={classes.fieldRow} />
    </>
  );

  const renderCallTab = () => (
    <>
      <div className={classes.infoAlert}>{i18n.t("interactiveMessageModalExtra.callInfo")}</div>
      <TextField label={i18n.t("interactiveMessageModalExtra.messageText")} fullWidth multiline rows={2} variant="outlined" value={bodyText} onChange={(e) => setBodyText(e.target.value)} className={classes.fieldRow} />
      <TextField label={i18n.t("interactiveMessageModalExtra.callButtonText")} fullWidth variant="outlined" size="small" value={callText} onChange={(e) => setCallText(e.target.value)} className={classes.fieldRow} placeholder={i18n.t("interactiveMessageModalExtra.callPlaceholder")} />
      <Autocomplete
        className={classes.fieldRow}
        options={callContacts}
        loading={callContactsLoading}
        getOptionLabel={(opt) => (opt && opt.name ? `${opt.name} - ${opt.number}` : "")}
        onInputChange={(e, value) => setCallContactSearch(value)}
        onChange={(e, contact) => {
          if (contact && contact.number) {
            setCallNumber(contact.number);
          }
        }}
        noOptionsText={i18n.t("interactiveMessageModalExtra.callContactNoOptions") || "Nenhum contato encontrado"}
        loadingText={i18n.t("interactiveMessageModalExtra.callContactLoading") || "Buscando..."}
        renderInput={(params) => (
          <TextField
            {...params}
            label={i18n.t("interactiveMessageModalExtra.callContactSelect") || "Escolher da agenda de contatos"}
            variant="outlined"
            size="small"
            placeholder={i18n.t("interactiveMessageModalExtra.callContactPlaceholder") || "Pesquisar contato..."}
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {callContactsLoading ? <CircularProgress color="inherit" size={18} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
      />
      <TextField label={i18n.t("interactiveMessageModalExtra.callPhoneLabel")} fullWidth variant="outlined" size="small" value={callNumber} onChange={(e) => setCallNumber(e.target.value)} className={classes.fieldRow} placeholder="+5511999999999" helperText={i18n.t("interactiveMessageModalExtra.callPhoneHelper") || "Selecione um contato acima ou digite manualmente"} />
    </>
  );

  const renderLocationTab = () => (
    <>
      <div className={classes.infoAlert}>{i18n.t("interactiveMessageModalExtra.locationInfo")}</div>
      <LocationPicker
        latitude={latitude}
        longitude={longitude}
        onChange={({ lat, lng }) => {
          setLatitude(lat.toFixed(6));
          setLongitude(lng.toFixed(6));
        }}
        onPlaceSelected={({ name, address }) => {
          if (name && !locationName) setLocationName(name);
          if (address && !locationAddress) setLocationAddress(address);
        }}
      />
      <TextField label={i18n.t("interactiveMessageModalExtra.locationMessageText")} fullWidth multiline rows={2} variant="outlined" value={bodyText} onChange={(e) => setBodyText(e.target.value)} className={classes.fieldRow} />
      <TextField label={i18n.t("interactiveMessageModalExtra.locationName")} fullWidth variant="outlined" size="small" value={locationName} onChange={(e) => setLocationName(e.target.value)} className={classes.fieldRow} />
      <TextField label={i18n.t("interactiveMessageModalExtra.locationAddress")} fullWidth variant="outlined" size="small" value={locationAddress} onChange={(e) => setLocationAddress(e.target.value)} className={classes.fieldRow} />
      <Box display="flex" gap={1} style={{ gap: 8 }}>
        <TextField label={i18n.t("interactiveMessageModalExtra.latitudeLabel")} variant="outlined" size="small" type="number" value={latitude} onChange={(e) => setLatitude(e.target.value)} className={classes.fieldRow} style={{ flex: 1 }} placeholder="-23.5505" />
        <TextField label={i18n.t("interactiveMessageModalExtra.longitudeLabel")} variant="outlined" size="small" type="number" value={longitude} onChange={(e) => setLongitude(e.target.value)} className={classes.fieldRow} style={{ flex: 1 }} placeholder="-46.6333" />
      </Box>
    </>
  );

  const renderCardImageUploader = (idx, card) => {
    const backendUrl = process.env.REACT_APP_BACKEND_URL || "";
    const previewSrc = card.imageUrl
      ? (/^https?:\/\//i.test(card.imageUrl) ? card.imageUrl : `${backendUrl}/public/${card.imageUrl}`)
      : "";
    return (
      <Box mt={1}>
        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
          <Button
            variant="outlined"
            component="label"
            size="small"
            startIcon={cardUploading[idx] ? <CircularProgress size={14} /> : <ImageIcon fontSize="small" />}
            style={{ textTransform: "none" }}
            disabled={!!cardUploading[idx]}
          >
            {card.imageName || (card.imageUrl ? i18n.t("interactiveMessageModalExtra.cardImageChange") || "Trocar imagem" : i18n.t("interactiveMessageModalExtra.cardImageAdd") || "Anexar imagem")}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCardImageUpload(idx, file);
                e.target.value = "";
              }}
            />
          </Button>
          {card.imageUrl && (
            <IconButton size="small" onClick={() => handleRemoveCardImage(idx)}>
              <Delete color="error" fontSize="small" />
            </IconButton>
          )}
        </Box>
        {previewSrc && (
          <img
            src={previewSrc}
            alt={card.imageName || "card"}
            style={{ marginTop: 8, width: "100%", maxHeight: 120, objectFit: "cover", borderRadius: 6, border: "1px solid rgba(0,0,0,0.12)" }}
          />
        )}
      </Box>
    );
  };

  const renderCarouselTab = () => (
    <>
      <div className={classes.infoAlert}>{i18n.t("interactiveMessageModalExtra.carouselInfo")}</div>
      <TextField label={i18n.t("interactiveMessageModalExtra.messageText")} fullWidth multiline rows={2} variant="outlined" value={bodyText} onChange={(e) => setBodyText(e.target.value)} className={classes.fieldRow} />
      {carouselCards.map((card, idx) => (
        <div key={idx} className={classes.sectionBox}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="subtitle2">{i18n.t("interactiveMessageModalExtra.cardLabel", { n: idx + 1 })}</Typography>
            {carouselCards.length > 1 && (<IconButton size="small" onClick={() => handleRemoveCard(idx)}><Delete color="error" fontSize="small" /></IconButton>)}
          </Box>
          <TextField label={i18n.t("interactiveMessageModalExtra.cardTitle")} fullWidth size="small" variant="outlined" value={card.title} onChange={(e) => handleCardChange(idx, "title", e.target.value)} style={{ marginBottom: 8 }} />
          <TextField label={i18n.t("interactiveMessageModalExtra.cardDescription")} fullWidth size="small" variant="outlined" multiline rows={2} value={card.body} onChange={(e) => handleCardChange(idx, "body", e.target.value)} />
          {/* Anexo de imagem removido: instável no @itsliaaa/baileys */}
          <TextField label={i18n.t("interactiveMessageModalExtra.cardButtonText") || "Texto do botão"} fullWidth size="small" variant="outlined" value={(card.buttons?.[0]?.displayText) || ""} onChange={(e) => handleCardButtonChange(idx, 0, e.target.value)} style={{ marginTop: 8 }} inputProps={{ maxLength: 20 }} placeholder="Ver detalhes" />
        </div>
      ))}
      {carouselCards.length < 10 && (<div className={classes.addBtn} onClick={handleAddCard}><Add style={{ fontSize: 16 }} /> {i18n.t("interactiveMessageModalExtra.addCard")}</div>)}
    </>
  );

  const renderCatalogTab = () => (
    <>
      <div className={classes.infoAlert}>{i18n.t("interactiveMessageModalExtra.catalogInfo")}</div>
      <TextField label={i18n.t("interactiveMessageModalExtra.messageText")} fullWidth multiline rows={2} variant="outlined" value={bodyText} onChange={(e) => setBodyText(e.target.value)} className={classes.fieldRow} />
      {carouselCards.map((card, idx) => (
        <div key={idx} className={classes.sectionBox}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="subtitle2">{i18n.t("interactiveMessageModalExtra.productLabel", { n: idx + 1 })}</Typography>
            {carouselCards.length > 1 && (<IconButton size="small" onClick={() => handleRemoveCard(idx)}><Delete color="error" fontSize="small" /></IconButton>)}
          </Box>
          <TextField label={i18n.t("interactiveMessageModalExtra.productName")} fullWidth size="small" variant="outlined" value={card.title} onChange={(e) => handleCardChange(idx, "title", e.target.value)} style={{ marginBottom: 8 }} />
          <TextField label={i18n.t("interactiveMessageModalExtra.productDescription")} fullWidth size="small" variant="outlined" multiline rows={2} value={card.body} onChange={(e) => handleCardChange(idx, "body", e.target.value)} />
          {/* Anexo de imagem removido: instável no @itsliaaa/baileys */}
          <TextField label={i18n.t("interactiveMessageModalExtra.cardButtonText") || "Texto do botão"} fullWidth size="small" variant="outlined" value={(card.buttons?.[0]?.displayText) || ""} onChange={(e) => handleCardButtonChange(idx, 0, e.target.value)} style={{ marginTop: 8 }} inputProps={{ maxLength: 20 }} placeholder="Ver produto" />
        </div>
      ))}
      {carouselCards.length < 10 && (<div className={classes.addBtn} onClick={handleAddCard}><Add style={{ fontSize: 16 }} /> {i18n.t("interactiveMessageModalExtra.addProduct")}</div>)}
    </>
  );

  const renderPollTab = () => (
    <>
      <div className={classes.infoAlert}>
        {i18n.t("interactiveMessageModalExtra.pollInfo")} {ticketChannel === "whatsapp_oficial" && i18n.t("interactiveMessageModalExtra.pollOfficialNote")}
      </div>
      <TextField label={i18n.t("interactiveMessageModalExtra.pollQuestion")} fullWidth multiline rows={2} variant="outlined" value={pollQuestion || bodyText} onChange={(e) => { setPollQuestion(e.target.value); if (!bodyText) setBodyText(e.target.value); }} className={classes.fieldRow} />
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="subtitle2">{i18n.t("interactiveMessageModalExtra.pollOptionsLabel")}</Typography>
        {pollOptions.length < 12 && (<div className={classes.addBtn} onClick={handleAddPollOption}><Add style={{ fontSize: 16 }} /> {i18n.t("interactiveMessageModalExtra.add")}</div>)}
      </Box>
      {pollOptions.map((opt, idx) => (
        <div key={idx} className={classes.optionRow}>
          <div className={classes.optionNumber}>{idx + 1}</div>
          <TextField fullWidth size="small" variant="outlined" placeholder={i18n.t("interactiveMessageModalExtra.optionPlaceholder", { n: idx + 1 })} value={opt} onChange={(e) => handlePollOptionChange(idx, e.target.value)} />
          {pollOptions.length > 2 && (<IconButton size="small" onClick={() => handleRemovePollOption(idx)}><Delete color="error" fontSize="small" /></IconButton>)}
        </div>
      ))}
    </>
  );

  const renderCobrancaTab = () => (
    <>
      <div className={classes.infoAlert}>{i18n.t("interactiveMessageModalExtra.billingInfo")}</div>
      <TextField label={i18n.t("interactiveMessageModalExtra.billingNumber")} fullWidth variant="outlined" size="small" value={cobrancaNumber} onChange={(e) => setCobrancaNumber(e.target.value)} className={classes.fieldRow} placeholder="DJ89J1E0ZTK" />
      <TextField label={i18n.t("interactiveMessageModalExtra.billingDescription")} fullWidth multiline rows={2} variant="outlined" value={cobrancaDescription} onChange={(e) => setCobrancaDescription(e.target.value)} className={classes.fieldRow} />
      <Box display="flex" style={{ gap: 8 }}>
        <TextField label={i18n.t("interactiveMessageModalExtra.billingQuantity")} variant="outlined" size="small" type="number" value={cobrancaQuantity} onChange={(e) => setCobrancaQuantity(e.target.value)} className={classes.fieldRow} style={{ flex: 1 }} />
        <TextField label={i18n.t("interactiveMessageModalExtra.billingTotalAmount")} variant="outlined" size="small" type="number" value={cobrancaAmount} onChange={(e) => setCobrancaAmount(e.target.value)} className={classes.fieldRow} style={{ flex: 1 }} placeholder="199.99" />
      </Box>
      <TextField label={i18n.t("interactiveMessageModalExtra.billingCustomMessage")} fullWidth multiline rows={2} variant="outlined" value={cobrancaMessage} onChange={(e) => setCobrancaMessage(e.target.value)} className={classes.fieldRow} />
      <TextField label={i18n.t("interactiveMessageModalExtra.footer")} fullWidth variant="outlined" size="small" value={footerText} onChange={(e) => setFooterText(e.target.value)} className={classes.fieldRow} />
      <Divider style={{ margin: "12px 0" }} />
      <Typography variant="subtitle2" style={{ marginBottom: 8 }}>{i18n.t("interactiveMessageModalExtra.billingAttachPdf")}</Typography>
      <Box display="flex" alignItems="center" style={{ gap: 8, marginBottom: 12 }}>
        <Button
          variant="outlined"
          component="label"
          size="small"
          style={{ textTransform: "none" }}
        >
          {cobrancaPdfName || i18n.t("interactiveMessageModalExtra.billingSelectPdf")}
          <input
            type="file"
            accept=".pdf,application/pdf"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                if (file.size > 16 * 1024 * 1024) {
                  toast.error(i18n.t("interactiveMessageModal.pdfTooBig"));
                  return;
                }
                setCobrancaPdfFile(file);
                setCobrancaPdfName(file.name);
              }
            }}
          />
        </Button>
        {cobrancaPdfFile && (
          <IconButton size="small" onClick={() => { setCobrancaPdfFile(null); setCobrancaPdfName(""); }}>
            <Delete color="error" fontSize="small" />
          </IconButton>
        )}
      </Box>
      <Divider style={{ margin: "12px 0" }} />
      <Typography variant="subtitle2" style={{ marginBottom: 8 }}>{i18n.t("interactiveMessageModalExtra.billingPaymentButton")}</Typography>
      <TextField label={i18n.t("interactiveMessageModalExtra.billingButtonText")} fullWidth variant="outlined" size="small" value={cobrancaButtonText} onChange={(e) => setCobrancaButtonText(e.target.value)} className={classes.fieldRow} />
      <TextField label={i18n.t("interactiveMessageModalExtra.billingPaymentUrl")} fullWidth variant="outlined" size="small" value={cobrancaPaymentUrl} onChange={(e) => setCobrancaPaymentUrl(e.target.value)} className={classes.fieldRow} placeholder="https://pay.example.com/invoice/123" helperText={i18n.t("interactiveMessageModalExtra.billingPaymentUrlHelper")} />
    </>
  );

  const renderPreview = () => {
    const type = currentType;
    return (
      <Paper className={classes.previewBox} elevation={2}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="caption" style={{ color: "#4FC3F7", fontWeight: 600 }}>● {i18n.t("interactiveMessageModal.previewTitle")}</Typography>
          <Typography variant="caption" style={{ color: "rgba(255,255,255,0.5)" }}>{new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</Typography>
        </Box>
        <div className={classes.previewTitle}>{type === "cobranca" ? `💳 ${cobrancaDescription || i18n.t("interactiveMessageModalExtra.billingDefaultDescription")}` : type === "offer" ? `🛍️ ${offerTitle || bodyText || i18n.t("interactiveMessageModalExtra.billingDefaultBody")}` : (offerTitle || bodyText || pollQuestion || i18n.t("interactiveMessageModalExtra.billingDefaultBody"))}</div>
        {type === "cobranca" && (
          <>
            {cobrancaNumber && <div className={classes.previewBody} style={{ fontSize: 10, opacity: 0.6, textTransform: "uppercase", letterSpacing: 1 }}>{i18n.t("interactiveMessageModalExtra.billingNumberPreview")}: {cobrancaNumber}</div>}
            <div className={classes.previewBody}>{cobrancaDescription || "..."}<br/>{i18n.t("interactiveMessageModalExtra.billingQuantityPreview")}: {cobrancaQuantity || 1}</div>
            <Box display="flex" justifyContent="space-between" style={{ marginBottom: 8 }}>
              <Typography style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{i18n.t("interactiveMessageModalExtra.billingTotal")}</Typography>
              <Typography style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{currencyCode} {cobrancaAmount ? parseFloat(cobrancaAmount).toFixed(2).replace(".", ",") : "0,00"}</Typography>
            </Box>
            {cobrancaMessage && <div className={classes.previewBody}>{cobrancaMessage}</div>}
          </>
        )}
        {type !== "cobranca" && footerText && <div className={classes.previewFooter}>{footerText}</div>}
        {type === "cobranca" && footerText && <div className={classes.previewFooter}>{footerText}</div>}
        {type === "button" && buttons.filter(b => b.displayText.trim()).map((btn, i) => (<div key={i} className={classes.previewButton}>{btn.displayText}</div>))}
        {type === "list" && (<div className={classes.previewButton}><FormatListBulleted style={{ fontSize: 14, verticalAlign: "middle", marginRight: 4 }} />{listButtonText || i18n.t("interactiveMessageModalExtra.buttonText")}</div>)}
        {type === "pix" && pixIncludeQrCode && pixCopyPaste.trim() && (
          <Box display="flex" flexDirection="column" alignItems="center" style={{ margin: "8px 0" }}>
            <img
              alt="QR Code PIX"
              src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(pixCopyPaste.trim())}`}
              style={{ width: 120, height: 120, borderRadius: 8, background: "#fff", padding: 4 }}
            />
            <Typography variant="caption" style={{ color: "rgba(255,255,255,0.6)", marginTop: 4 }}>🔳 {i18n.t("interactiveMessageModalExtra.pixQrCodeLabel")}</Typography>
          </Box>
        )}
        {type === "pix" && pixCopyPaste.trim() && (<div className={classes.previewBody} style={{ wordBreak: "break-all", fontSize: 11 }}>📋 {pixButtonText || "Copiar código PIX"}:<br/>{pixCopyPaste.trim()}</div>)}
        {type === "pix" && !pixCopyPaste.trim() && pixKey && (<div className={classes.previewBody}>💰 {i18n.t("interactiveMessageModalExtra.pixKey")}: {pixKey}{pixAmount && `\n💵 ${formatCurrency(parseFloat(pixAmount))}`}</div>)}
        {type === "url" && url && (<div className={classes.previewButton}>🔗 {urlText || url}</div>)}
        {type === "call" && callNumber && (<div className={classes.previewButton}>📞 {callText || i18n.t("interactiveMessageModalExtra.callPlaceholder")}</div>)}
        {type === "location" && (<div className={classes.previewBody}>📍 {locationName || i18n.t("interactiveMessageModalExtra.locationName")}</div>)}
        {type === "poll" && pollOptions.filter(o => o.trim()).map((o, i) => (<div key={i} className={classes.previewBody}>○ {o}</div>))}
        {type === "cobranca" && (<div className={classes.previewButton}>{cobrancaButtonText || i18n.t("interactiveMessageModalExtra.billingDefaultButton")}</div>)}
      </Paper>
    );
  };

  const renderTabContent = () => {
    switch (currentType) {
      case "button": return renderButtonsTab();
      case "list": return renderListTab();
      case "cobranca": return renderCobrancaTab();
      case "offer": return renderOfferTab();
      case "pix": return renderPixTab();
      case "url": return renderUrlTab();
      case "call": return renderCallTab();
      case "location": return renderLocationTab();
      case "carousel": return renderCarouselTab();
      case "catalog": return renderCatalogTab();
      case "poll": return renderPollTab();
      default: return null;
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} classes={{ paper: classes.dialogPaper }} scroll="paper">
        <div className={classes.header}>
          <div className={classes.headerTitle}>
            <Send style={{ color: "#4CAF50", transform: "rotate(-30deg)" }} />
            <div>
              <Typography variant="subtitle1" style={{ fontWeight: 600, lineHeight: 1.2 }}>
                {i18n.t("interactiveMessageModalExtra.sendInteractiveMessage")}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                {activeTemplateName ? `📋 Template: ${activeTemplateName}` : i18n.t("interactiveMessageModal.subtitle")}
              </Typography>
            </div>
          </div>
          <IconButton size="small" onClick={onClose}><Close /></IconButton>
        </div>

        {/* Template bar */}
        <div className={classes.templateBar}>
          <Tooltip title={i18n.t("interactiveMessageModal.loadTemplate")}>
            <Chip
              icon={<FolderOpen style={{ fontSize: 16 }} />}
              label={`${i18n.t("interactiveMessageModalExtra.modelsCount", { count: filteredTemplates.length })}`}
              size="small"
              variant="outlined"
              clickable
              className={classes.templateChip}
              onClick={(e) => setTemplateMenuAnchor(e.currentTarget)}
            />
          </Tooltip>
          <Tooltip title={i18n.t("interactiveMessageModal.saveAsTemplate")}>
            <Chip
              icon={<Save style={{ fontSize: 16 }} />}
              label={i18n.t("interactiveMessageModal.save")}
              size="small"
              color="primary"
              clickable
              className={classes.templateChip}
              onClick={() => setSaveDialogOpen(true)}
            />
          </Tooltip>
          {activeTemplateName && (
            <Chip
              icon={<Bookmark style={{ fontSize: 14 }} />}
              label={activeTemplateName}
              size="small"
              color="secondary"
              onDelete={() => setActiveTemplateName("")}
              style={{ fontSize: 11 }}
            />
          )}
        </div>

        {/* Template load menu */}
        <Menu
          anchorEl={templateMenuAnchor}
          open={Boolean(templateMenuAnchor)}
          onClose={() => setTemplateMenuAnchor(null)}
          classes={{ paper: classes.templateMenu }}
        >
          {filteredTemplates.length === 0 ? (
            <MenuItem disabled>
              <ListItemText primary={i18n.t("interactiveMessageModal.noTemplates")} />
            </MenuItem>
          ) : (
            filteredTemplates.map((tpl) => (
              <MenuItem key={tpl.id} onClick={() => loadTemplateData(tpl)}>
                <ListItemIcon><BookmarkBorder fontSize="small" /></ListItemIcon>
                <ListItemText primary={tpl.name} />
                <IconButton size="small" onClick={(e) => handleDeleteTemplate(tpl.id, e)}>
                  <Delete fontSize="small" color="error" />
                </IconButton>
              </MenuItem>
            ))
          )}
        </Menu>

        <Tabs
          value={activeTab}
          onChange={(_, v) => { setActiveTab(v); setActiveTemplateName(""); }}
          variant="scrollable"
          scrollButtons="auto"
          indicatorColor="primary"
          textColor="primary"
          classes={{ root: classes.tabsRoot }}
        >
          {TAB_CONFIG.map((tab, i) => (
            <Tab key={i} icon={tab.icon} label={tab.label} classes={{ root: classes.tab }} />
          ))}
        </Tabs>

        <DialogContent className={classes.content}>
          {renderTabContent()}
          {renderPreview()}
        </DialogContent>

        <DialogActions style={{ padding: "8px 16px" }}>
          <Button onClick={onClose} color="default">{i18n.t("interactiveMessageModal.cancel")}</Button>
          <Button variant="contained" color="primary" onClick={handleSend} disabled={loading} startIcon={loading ? null : <Send />}>
            {loading ? i18n.t("interactiveMessageModal.sending") : i18n.t("interactiveMessageModal.send")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Save template dialog */}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)}>
        <DialogTitle>{i18n.t("interactiveMessageModal.saveTemplate")}</DialogTitle>
        <DialogContent className={classes.saveDialog}>
          <Typography variant="body2" color="textSecondary" style={{ marginBottom: 12 }}>
            {i18n.t("interactiveMessageModalExtra.saveCurrentConfig")} <strong>{TAB_CONFIG[activeTab]?.label}</strong>.
          </Typography>
          <TextField
            label={i18n.t("interactiveMessageModal.templateNameLabel")}
            fullWidth
            variant="outlined"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            autoFocus
            placeholder={i18n.t("interactiveMessageModal.templateNamePlaceholder")}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>{i18n.t("interactiveMessageModal.cancel")}</Button>
          <Button variant="contained" color="primary" onClick={handleSaveTemplate} startIcon={<Save />}>
            {i18n.t("interactiveMessageModalExtra.saveButton")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default InteractiveMessageModal;
