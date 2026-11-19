import React, { useState, useEffect, useRef } from "react";
import { toast } from "react-toastify";
import Compressor from "compressorjs";
import api from "../../services/api";

import { makeStyles } from "@material-ui/core/styles";
import green from "@material-ui/core/colors/green";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import Typography from "@material-ui/core/Typography";
import IconButton from "@material-ui/core/IconButton";
import CircularProgress from "@material-ui/core/CircularProgress";
import MenuItem from "@material-ui/core/MenuItem";

import { i18n } from "../../translate/i18n";
import MessageVariablesPicker from "../MessageVariablesPicker";

import { Box, Chip, Stack, FormControlLabel, Switch } from "@mui/material";
import AddCircle from "@mui/icons-material/AddCircle";
import Delete from "@mui/icons-material/Delete";
import TouchApp from "@mui/icons-material/TouchApp";
import SmartButton from "@mui/icons-material/SmartButton";
import FormatListBulleted from "@mui/icons-material/FormatListBulleted";
import Call from "@mui/icons-material/Call";
import Payment from "@mui/icons-material/Payment";

const useStyles = makeStyles((theme) => ({
  root: { display: "flex", flexWrap: "wrap" },
  btnWrapper: { position: "relative" },
  buttonProgress: {
    color: green[500], position: "absolute", top: "50%", left: "50%",
    marginTop: -12, marginLeft: -12,
  },
}));

const TYPES = () => [
  { value: "button",   labelKey: "typeButton",   descKey: "typeDescButton",   icon: <SmartButton fontSize="small" />,        official: false },
  { value: "list",     labelKey: "typeList",     descKey: "typeDescList",     icon: <FormatListBulleted fontSize="small" />, official: false },
  { value: "pix",      labelKey: "typePix",      descKey: "typeDescPix",      icon: <Payment fontSize="small" />,            official: false },
];

const FlowBuilderInteractiveModal = ({ open, onSave, onUpdate, data, close }) => {
  const classes = useStyles();
  const messageRef = useRef(null);

  const [activeModal, setActiveModal] = useState(false);
  const [interactiveType, setInteractiveType] = useState("button");
  const [message, setMessage] = useState("");
  const [footer, setFooter] = useState("");
  const [headerImage, setHeaderImage] = useState("");
  const [headerImagePreview, setHeaderImagePreview] = useState("");
  const [headerImageMedias, setHeaderImageMedias] = useState([]);
  const [headerImageLoading, setHeaderImageLoading] = useState(false);
  const [listButtonText, setListButtonText] = useState("Selecionar");
  const [arrayOption, setArrayOption] = useState([]);

  // CTA / Flow / Catálogo / Carrossel
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [ctaPhone, setCtaPhone] = useState("");
  // PIX (copia e cola)
  const [pixCopyPaste, setPixCopyPaste] = useState("");
  const [pixButtonText, setPixButtonText] = useState("Copiar código PIX");
  const [pixName, setPixName] = useState("");
  const [pixAmount, setPixAmount] = useState("");
  const [pixIncludeQrCode, setPixIncludeQrCode] = useState(false);
  const [pixDocumentUrl, setPixDocumentUrl] = useState("");
  const [pixDocumentName, setPixDocumentName] = useState("");
  const [pixTotal, setPixTotal] = useState("");
  const [flowId, setFlowId] = useState("");
  const [flowToken, setFlowToken] = useState("");
  const [flowCta, setFlowCta] = useState("Abrir");
  const [flowScreen, setFlowScreen] = useState("WELCOME");
  const [catalogId, setCatalogId] = useState("");
  const [catalogProductId, setCatalogProductId] = useState("");
  const [carouselCards, setCarouselCards] = useState([]); // {title, body, imageUrl, buttonText, buttonId}

  const isOptionsType = interactiveType === "button" || interactiveType === "list";
  const maxOptions = interactiveType === "button" ? 3 : 10;

  const isEdit = open === "edit";

  useEffect(() => {
    if (open === "edit" || open === "create") {
      const d = (open === "edit" && data?.data) || {};
      setInteractiveType(d.interactiveType || "button");
      setMessage(d.message || "");
      setFooter(d.footer || "");
      setHeaderImage(d.headerImage || "");
      setHeaderImagePreview(d.headerImage ? process.env.REACT_APP_BACKEND_URL + "/public/" + d.headerImage : "");
      setHeaderImageMedias([]);
      setListButtonText(d.listButtonText || "Selecionar");
      setArrayOption(d.arrayOption || []);
      setCtaText(d.ctaText || "");
      setCtaUrl(d.ctaUrl || "");
      setCtaPhone(d.ctaPhone || "");
      setPixCopyPaste(d.pixCopyPaste || "");
      setPixButtonText(d.pixButtonText || "Copiar código PIX");
      setPixName(d.pixName || "");
      setPixAmount(d.pixAmount || "");
      setPixIncludeQrCode(!!d.pixIncludeQrCode);
      setPixDocumentUrl(d.pixDocumentUrl || "");
      setPixDocumentName(d.pixDocumentName || "");
      setPixTotal(d.pixTotal || "");
      setFlowId(d.flowId || "");
      setFlowToken(d.flowToken || "");
      setFlowCta(d.flowCta || "Abrir");
      setFlowScreen(d.flowScreen || "WELCOME");
      setCatalogId(d.catalogId || "");
      setCatalogProductId(d.catalogProductId || "");
      setCarouselCards(d.carouselCards || []);
      setActiveModal(true);
    } else {
      setActiveModal(false);
    }
  }, [open]); // eslint-disable-line

  const handleClose = () => { close(null); setActiveModal(false); };

  const uploadHeaderIfNeeded = async () => {
    if (headerImageMedias.length === 0) return headerImage;
    setHeaderImageLoading(true);
    try {
      const formData = new FormData();
      formData.append("fromMe", true);
      const file = headerImageMedias[0];
      await new Promise((resolve, reject) => {
        if (file.type.split("/")[0] === "image") {
          new Compressor(file, {
            quality: 0.7,
            success(c) { formData.append("medias", c); formData.append("body", c.name); resolve(); },
            error(err) { reject(err); },
          });
        } else { formData.append("medias", file); formData.append("body", file.name); resolve(); }
      });
      const res = await api.post("/flowbuilder/img", formData);
      return res.data.name;
    } finally { setHeaderImageLoading(false); }
  };

  // Faz upload de um único arquivo de imagem e devolve o nome salvo no backend
  const uploadOneImage = (file) => new Promise((resolve, reject) => {
    if (!file) return resolve("");
    if (file.size > 2000000) {
      toast.error(i18n.t("flowBuilderInteractive.fileTooLarge"));
      return reject(new Error("file too large"));
    }
    const formData = new FormData();
    formData.append("fromMe", true);
    new Compressor(file, {
      quality: 0.7,
      success: async (c) => {
        try {
          formData.append("medias", c);
          formData.append("body", c.name);
          const res = await api.post("/flowbuilder/img", formData);
          resolve(res.data.name);
        } catch (err) { reject(err); }
      },
      error: (err) => reject(err),
    });
  });

  const handleCardImageUpload = async (idx, file) => {
    if (!file) return;
    try {
      updateCard(idx, "imageUploading", true);
      const name = await uploadOneImage(file);
      const url = process.env.REACT_APP_BACKEND_URL + "/public/" + name;
      setCarouselCards((o) => {
        const a = [...o];
        a[idx] = { ...a[idx], imageUrl: url, imageUploading: false };
        return a;
      });
    } catch {
      updateCard(idx, "imageUploading", false);
      toast.error("Erro no upload da imagem do card");
    }
  };

  const handleCatalogImageUpload = async (file) => {
    if (!file) return;
    try {
      setHeaderImageLoading(true);
      const name = await uploadOneImage(file);
      setHeaderImage(name);
      setHeaderImagePreview(process.env.REACT_APP_BACKEND_URL + "/public/" + name);
    } catch {
      toast.error("Erro no upload da imagem");
    } finally {
      setHeaderImageLoading(false);
    }
  };

  const handleSave = async () => {
    if (!message.trim() && interactiveType !== "catalog" && interactiveType !== "carousel" && interactiveType !== "pix") {
      toast.error(i18n.t("flowBuilderInteractive.bodyRequired")); return;
    }
    if (interactiveType === "pix" && !pixCopyPaste.trim()) {
      toast.error("Informe o código PIX copia e cola."); return;
    }
    if (isOptionsType && arrayOption.length === 0) {
      toast.error(i18n.t("flowBuilderInteractive.addOption")); return;
    }
    if (interactiveType === "cta_url" && (!ctaText || !ctaUrl)) {
      toast.error(i18n.t("flowBuilderInteractive.ctaTextRequired")); return;
    }
    if (interactiveType === "cta_call" && (!ctaText || !ctaPhone)) {
      toast.error(i18n.t("flowBuilderInteractive.callTextRequired")); return;
    }
    if (interactiveType === "flow" && (!flowId || !flowCta)) {
      toast.error(i18n.t("flowBuilderInteractive.flowFieldsRequired")); return;
    }
    if (interactiveType === "catalog" && !catalogId) {
      toast.error(i18n.t("flowBuilderInteractive.catalogIdRequired")); return;
    }
    if (interactiveType === "carousel" && carouselCards.length === 0) {
      toast.error(i18n.t("flowBuilderInteractive.carouselCardsRequired")); return;
    }

    let finalHeaderImage;
    try { finalHeaderImage = await uploadHeaderIfNeeded(); }
    catch { toast.error("Erro no upload da imagem"); return; }

    const payload = {
      message, footer,
      headerImage: finalHeaderImage,
      interactiveType,
      listButtonText,
      arrayOption,
      ctaText, ctaUrl, ctaPhone,
      pixCopyPaste, pixButtonText, pixName, pixAmount, pixIncludeQrCode,
      pixDocumentUrl, pixDocumentName, pixTotal,
      flowId, flowToken, flowCta, flowScreen,
      catalogId, catalogProductId,
      carouselCards,
    };

    handleClose();
    if (isEdit) onUpdate({ ...data, data: payload });
    else onSave(payload);
  };

  const handleHeaderImageChange = (e) => {
    if (!e.target.files?.[0]) return;
    if (e.target.files[0].size > 2000000) { toast.error(i18n.t("flowBuilderInteractive.fileTooLarge")); return; }
    setHeaderImagePreview(URL.createObjectURL(e.target.files[0]));
    setHeaderImageMedias(Array.from(e.target.files));
  };

  const addOption = () => {
    if (arrayOption.length >= maxOptions) { toast.warning(i18n.t("flowBuilderInteractive.maxOptionsReached", { max: maxOptions })); return; }
    setArrayOption((old) => [...old, { number: old.length + 1, value: "" }]);
  };
  const removeOption = (n) => setArrayOption((old) =>
    old.filter((i) => i.number !== n).map((i, idx) => ({ ...i, number: idx + 1 }))
  );
  const updateOption = (idx, v) => setArrayOption((old) => {
    const a = [...old]; a[idx] = { ...a[idx], value: v }; return a;
  });

  const addCard = () => {
    if (carouselCards.length >= 10) { toast.warning(i18n.t("flowBuilderInteractive.maxCards")); return; }
    setCarouselCards((o) => [...o, { title: "", body: "", imageUrl: "", buttonText: "", buttonId: "" }]);
  };
  const updateCard = (idx, field, v) => setCarouselCards((o) => {
    const a = [...o]; a[idx] = { ...a[idx], [field]: v }; return a;
  });
  const removeCard = (idx) => setCarouselCards((o) => o.filter((_, i) => i !== idx));

  const handleAddVariable = (value) => {
    const input = messageRef.current?.querySelector("textarea");
    if (input) {
      const s = input.selectionStart, e = input.selectionEnd;
      setMessage(message.substring(0, s) + value + message.substring(e));
      setTimeout(() => { input.selectionStart = s + value.length; input.selectionEnd = s + value.length; input.focus(); }, 50);
    } else setMessage((p) => p + value);
  };

  return (
    <div className={classes.root}>
      <Dialog open={activeModal} onClose={handleClose} fullWidth maxWidth="sm" scroll="paper">
        <DialogTitle>
          <Stack direction="row" alignItems="center" gap={1}>
            <TouchApp sx={{ color: "#9C27B0" }} />
            <span>{isEdit ? i18n.t("flowBuilderInteractive.editTitle") : i18n.t("flowBuilderInteractive.title")}</span>
          </Stack>
        </DialogTitle>

        <DialogContent dividers>
          <Stack gap={2}>
            {/* Banner informativo sobre API Oficial */}
            <Box sx={{ backgroundColor: "#FFF3E0", border: "1px solid #FFB74D", borderRadius: 1, p: 1.2, fontSize: 12, color: "#5D4037" }}>
              {i18n.t("flowBuilderInteractive.officialOnlyBanner")}
            </Box>

            <TextField
              select label={i18n.t("flowBuilderInteractive.messageType")}
              value={interactiveType}
              onChange={(e) => setInteractiveType(e.target.value)}
              variant="outlined" fullWidth size="small"
            >
              {TYPES().map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  <Stack direction="row" alignItems="center" gap={1}>
                    {t.icon}
                    <span>{i18n.t(`flowBuilderInteractive.${t.labelKey}`)}</span>
                    {t.official && (
                      <Chip label="API Oficial" size="small" sx={{ backgroundColor: "#1976D2", color: "#fff", fontSize: 9, height: 18 }} />
                    )}
                  </Stack>
                </MenuItem>
              ))}
            </TextField>

            {/* Descrição do tipo selecionado */}
            {(() => {
              const t = TYPES().find((x) => x.value === interactiveType);
              return t ? (
                <Typography variant="caption" sx={{ color: "#666", fontStyle: "italic", mt: -1 }}>
                  {i18n.t(`flowBuilderInteractive.${t.descKey}`)}
                </Typography>
              ) : null;
            })()}

            {/* Body texto */}
            {interactiveType !== "catalog" && interactiveType !== "carousel" && (
              <>
                <MessageVariablesPicker onClick={handleAddVariable} disabled={false} />
                <div ref={messageRef}>
                  <TextField
                    label={i18n.t("flowBuilderInteractive.messageBody")} multiline rows={3} variant="outlined"
                    value={message} onChange={(e) => setMessage(e.target.value)}
                    fullWidth required
                  />
                </div>
                <TextField
                  label={i18n.t("flowBuilderInteractive.footerOptional")} variant="outlined" size="small"
                  value={footer} onChange={(e) => setFooter(e.target.value)} fullWidth
                />
              </>
            )}

            {/* Botões / Listas */}
            {isOptionsType && (
              <>
                {interactiveType === "list" && (
                  <TextField
                    label={i18n.t("flowBuilderInteractive.listButtonText")} variant="outlined" size="small"
                    value={listButtonText} onChange={(e) => setListButtonText(e.target.value)} fullWidth
                  />
                )}
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography style={{ fontWeight: 500 }}>
                    {interactiveType === "button"
                      ? `${i18n.t("flowBuilderInteractive.buttonsLabel")} (${arrayOption.length}/${maxOptions})`
                      : `${i18n.t("flowBuilderInteractive.listOptions")} (${arrayOption.length}/${maxOptions})`}
                  </Typography>
                  <Button onClick={addOption} color="primary" variant="contained" size="small"
                    startIcon={<AddCircle />} disabled={arrayOption.length >= maxOptions}>
                    {i18n.t("flowBuilderInteractive.add")}
                  </Button>
                </Stack>
                {arrayOption.map((item, idx) => (
                  <Stack key={item.number} direction="row" alignItems="center" gap={1}>
                    <Chip label={item.number} size="small" sx={{ backgroundColor: "#388E3C", color: "#fff", minWidth: 28 }} />
                    <TextField
                      placeholder={
                        interactiveType === "button"
                          ? i18n.t("flowBuilderInteractive.buttonTextPlaceholder", { number: item.number })
                          : i18n.t("flowBuilderInteractive.optionPlaceholder", { number: item.number })
                      }
                      variant="outlined" size="small"
                      value={item.value} onChange={(e) => updateOption(idx, e.target.value)}
                      fullWidth inputProps={{ maxLength: interactiveType === "button" ? 20 : 24 }}
                    />
                    <IconButton size="small" onClick={() => removeOption(item.number)}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
              </>
            )}

            {/* CTA URL */}
            {interactiveType === "cta_url" && (
              <>
                <TextField label={i18n.t("flowBuilderInteractive.ctaButtonText")} size="small" variant="outlined" fullWidth
                  value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder={i18n.t("flowBuilderInteractive.ctaUrlPlaceholder")} />
                <TextField label={i18n.t("flowBuilderInteractive.ctaUrl")} size="small" variant="outlined" fullWidth
                  value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://..." />
              </>
            )}

            {/* CTA Call */}
            {interactiveType === "cta_call" && (
              <>
                <TextField label={i18n.t("flowBuilderInteractive.ctaButtonText")} size="small" variant="outlined" fullWidth
                  value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder={i18n.t("flowBuilderInteractive.ctaCallPlaceholder")} />
                <TextField label={i18n.t("flowBuilderInteractive.ctaPhone")} size="small" variant="outlined" fullWidth
                  value={ctaPhone} onChange={(e) => setCtaPhone(e.target.value)} />
              </>
            )}

            {/* PIX (copia e cola) */}
            {interactiveType === "pix" && (
              <>
                <Box sx={{ backgroundColor: "#E8F5E9", borderRadius: 1, p: 1, fontSize: 12 }}>
                  {i18n.t("flowBuilderInteractive.pixBoxInfo")}
                </Box>
                <Box sx={{ backgroundColor: "#FFF8E1", borderRadius: 1, p: 1, fontSize: 12 }}>
                  🔁 <b>{i18n.t("flowBuilderInteractive.pixReuseTitle")}</b> {i18n.t("flowBuilderInteractive.pixReuseSubtitle")}
                  <br />• {i18n.t("flowBuilderInteractive.pixFlowVars")} <code>{"${valor}"}</code>, <code>{"${pixCopiaCola}"}</code>, <code>{"${linkBoleto}"}</code>
                  <br />• {i18n.t("flowBuilderInteractive.pixTicketVars")} <code>{"{{name}}"}</code>, <code>{"{{protocol}}"}</code>, <code>{"{{data}}"}</code>
                </Box>
                <TextField label={i18n.t("flowBuilderInteractive.pixCopyPasteLabel")} size="small" variant="outlined" fullWidth multiline minRows={3}
                  value={pixCopyPaste} onChange={(e) => setPixCopyPaste(e.target.value)} placeholder="00020126... ou ${pixCopiaCola}" />
                <TextField label={i18n.t("flowBuilderInteractive.pixButtonTextLabel")} size="small" variant="outlined" fullWidth
                  value={pixButtonText} onChange={(e) => setPixButtonText(e.target.value)} />
                <TextField label={i18n.t("flowBuilderInteractive.pixNameLabel")} size="small" variant="outlined" fullWidth
                  value={pixName} onChange={(e) => setPixName(e.target.value)} />
                <TextField label={i18n.t("flowBuilderInteractive.pixAmountLabel")} size="small" variant="outlined" type="number" fullWidth
                  value={pixAmount} onChange={(e) => setPixAmount(e.target.value)} />
                <FormControlLabel
                  control={<Switch color="primary" checked={pixIncludeQrCode} onChange={(e) => setPixIncludeQrCode(e.target.checked)} />}
                  label={i18n.t("flowBuilderInteractive.pixQrCodeLabel")}
                />
                <Box sx={{ backgroundColor: "#E3F2FD", borderRadius: 1, p: 1, fontSize: 12 }}>
                  {i18n.t("flowBuilderInteractive.pixDocBoxInfo")}
                </Box>
                <TextField label={i18n.t("flowBuilderInteractive.pixTotalLabel")} size="small" variant="outlined" fullWidth
                  value={pixTotal} onChange={(e) => setPixTotal(e.target.value)} placeholder="R$ ${valor} ou R$ 130,00" />
                <TextField label={i18n.t("flowBuilderInteractive.pixDocUrlLabel")} size="small" variant="outlined" fullWidth
                  value={pixDocumentUrl} onChange={(e) => setPixDocumentUrl(e.target.value)} placeholder="${linkBoleto} ou https://.../doc.pdf" />
                <TextField label={i18n.t("flowBuilderInteractive.pixDocNameLabel")} size="small" variant="outlined" fullWidth
                  value={pixDocumentName} onChange={(e) => setPixDocumentName(e.target.value)} placeholder="fatura-${protocol}.pdf" disabled={!pixDocumentUrl.trim()} />
              </>
            )}


            {/* Flow */}
            {interactiveType === "flow" && (
              <>
                <Box sx={{ backgroundColor: "#E3F2FD", borderRadius: 1, p: 1, fontSize: 12 }}>
                  {i18n.t("flowBuilderInteractive.flowOnlyOfficial")}
                </Box>
                <TextField label={i18n.t("flowBuilderInteractive.flowId")} size="small" variant="outlined" fullWidth
                  value={flowId} onChange={(e) => setFlowId(e.target.value)} />
                <TextField label={i18n.t("flowBuilderInteractive.flowToken")} size="small" variant="outlined" fullWidth
                  value={flowToken} onChange={(e) => setFlowToken(e.target.value)} />
                <TextField label={i18n.t("flowBuilderInteractive.flowCta")} size="small" variant="outlined" fullWidth
                  value={flowCta} onChange={(e) => setFlowCta(e.target.value)} />
                <TextField label={i18n.t("flowBuilderInteractive.flowScreen")} size="small" variant="outlined" fullWidth
                  value={flowScreen} onChange={(e) => setFlowScreen(e.target.value)} placeholder="WELCOME" />
              </>
            )}

            {/* Catálogo */}
            {interactiveType === "catalog" && (
              <>
                <Typography variant="caption" sx={{ color: "#666" }}>
                  Informe o <b>Catalog ID</b> do Meta Commerce. Opcionalmente envie um <b>Produto destaque</b> (retailer_id) para destacar um item, e uma <b>imagem de capa</b> que será enviada antes do catálogo.
                </Typography>
                <TextField label={i18n.t("flowBuilderInteractive.catalogId")} size="small" variant="outlined" fullWidth
                  value={catalogId} onChange={(e) => setCatalogId(e.target.value)} />
                <TextField label={i18n.t("flowBuilderInteractive.catalogProductId")} size="small" variant="outlined" fullWidth
                  value={catalogProductId} onChange={(e) => setCatalogProductId(e.target.value)} />
                <TextField label={i18n.t("flowBuilderInteractive.messageBody")} multiline rows={2} variant="outlined" fullWidth
                  value={message} onChange={(e) => setMessage(e.target.value)} />
                <TextField label={i18n.t("flowBuilderInteractive.footerOptional")} size="small" variant="outlined" fullWidth
                  value={footer} onChange={(e) => setFooter(e.target.value)} />
                {/* Anexo de imagem de capa removido: instável no @itsliaaa/baileys */}
              </>
            )}

            {/* Carrossel */}
            {interactiveType === "carousel" && (
              <>
                <Typography variant="caption" sx={{ color: "#666" }}>
                  Crie até 10 cards. Cada card pode ter <b>imagem</b> (upload ou URL), <b>título</b>, <b>descrição</b> e um <b>botão</b> com texto e ID. O ID do botão é o que o fluxo recebe quando o cliente clica. Somente API Oficial.
                </Typography>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography style={{ fontWeight: 500 }}>{i18n.t("flowBuilderInteractive.carouselCards")} ({carouselCards.length}/10)</Typography>
                  <Button onClick={addCard} color="primary" variant="contained" size="small" startIcon={<AddCircle />}>
                    {i18n.t("flowBuilderInteractive.addCard")}
                  </Button>
                </Stack>
                {carouselCards.map((card, idx) => (
                  <Box key={idx} sx={{ border: "1px solid #ddd", borderRadius: 1, p: 1 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>{i18n.t("flowBuilderInteractive.cardLabel")} {idx + 1}</Typography>
                      <IconButton size="small" onClick={() => removeCard(idx)}><Delete fontSize="small" /></IconButton>
                    </Stack>
                    <Stack gap={1}>
                      <TextField label={i18n.t("flowBuilderInteractive.cardTitle")} size="small" variant="outlined" fullWidth
                        value={card.title} onChange={(e) => updateCard(idx, "title", e.target.value)} />
                      <TextField label={i18n.t("flowBuilderInteractive.cardDescription")} size="small" variant="outlined" fullWidth multiline rows={2}
                        value={card.body} onChange={(e) => updateCard(idx, "body", e.target.value)} />
                      {/* Anexo de imagem do card removido: instável no @itsliaaa/baileys */}
                      <Stack direction="row" gap={1}>
                        <TextField label={i18n.t("flowBuilderInteractive.cardButtonText")} size="small" variant="outlined" fullWidth
                          value={card.buttonText} onChange={(e) => updateCard(idx, "buttonText", e.target.value)} />
                        <TextField label={i18n.t("flowBuilderInteractive.cardButtonId")} size="small" variant="outlined" fullWidth
                          value={card.buttonId} onChange={(e) => updateCard(idx, "buttonId", e.target.value)} />
                      </Stack>
                    </Stack>
                  </Box>
                ))}
              </>
            )}

            {/* Header image — desabilitado para botão/lista pois NÃO funciona na API Oficial */}
            {(interactiveType === "cta_url" || interactiveType === "cta_call") && (
              <Box sx={{ border: "1px dashed #ccc", borderRadius: 1, p: 1, textAlign: "center" }}>
                <Typography style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>
                  {i18n.t("flowBuilderInteractive.headerImageOptional")}
                </Typography>
                {headerImagePreview && (
                  <Box sx={{ mb: 1, position: "relative", display: "inline-block" }}>
                    <img src={headerImagePreview} alt="" style={{ maxWidth: 200, maxHeight: 100, borderRadius: 6, objectFit: "cover" }} />
                    <IconButton size="small" onClick={() => { setHeaderImage(""); setHeaderImagePreview(""); setHeaderImageMedias([]); }}
                      sx={{ position: "absolute", top: -8, right: -8, backgroundColor: "#fff", boxShadow: 1 }}>
                      <Delete fontSize="small" color="error" />
                    </IconButton>
                  </Box>
                )}
                {!headerImageLoading && (
                  <Button variant="outlined" component="label" size="small">
                    {headerImagePreview ? i18n.t("flowBuilderInteractive.changeImage") : i18n.t("flowBuilderInteractive.uploadImage")}
                    <input type="file" accept="image/png, image/jpg, image/jpeg" hidden onChange={handleHeaderImageChange} />
                  </Button>
                )}
                {headerImageLoading && <CircularProgress size={20} />}
              </Box>
            )}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={handleClose} color="secondary" variant="outlined">{i18n.t("flowBuilderInteractive.cancel")}</Button>
          <Button color="primary" variant="contained" className={classes.btnWrapper} onClick={handleSave}>
            {isEdit ? i18n.t("flowBuilderInteractive.save") : i18n.t("flowBuilderInteractive.add")}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default FlowBuilderInteractiveModal;
