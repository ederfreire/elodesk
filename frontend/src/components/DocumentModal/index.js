import React, { useState, useEffect } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, Chip, IconButton } from "@material-ui/core";
import Description from "@material-ui/icons/Description";
import GetApp from "@material-ui/icons/GetApp";
import OpenInNew from "@material-ui/icons/OpenInNew";
import Close from "@material-ui/icons/Close";
import PictureAsPdf from "@material-ui/icons/PictureAsPdf";
import Image from "@material-ui/icons/Image";
import VideoLibrary from "@material-ui/icons/VideoLibrary";
import Audiotrack from "@material-ui/icons/Audiotrack";
import Archive from "@material-ui/icons/Archive";
import Code from "@material-ui/icons/Code";
import TableChart from "@material-ui/icons/TableChart";
import Slideshow from "@material-ui/icons/Slideshow";
import { makeStyles } from "@material-ui/core/styles";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles((theme) => ({
  root: {
    "& .MuiDialog-paper": {
      minWidth: 400,
      maxWidth: 600,
    },
  },
  documentInfo: {
    display: "flex",
    alignItems: "center",
    marginBottom: theme.spacing(2),
  },
  documentIcon: {
    fontSize: 48,
    marginRight: theme.spacing(2),
    color: theme.palette.primary.main,
  },
  documentDetails: {
    flex: 1,
  },
  documentName: {
    fontWeight: "bold",
    marginBottom: theme.spacing(1),
  },
  documentType: {
    marginBottom: theme.spacing(1),
  },
  actions: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: theme.spacing(2),
  },
  downloadButton: {
    marginRight: theme.spacing(1),
  },
  closeButton: {
    position: "absolute",
    right: theme.spacing(1),
    top: theme.spacing(1),
  },
}));

const DocumentModal = ({ open, onClose, document }) => {
  const classes = useStyles();
  const [fileInfo, setFileInfo] = useState(null);

  useEffect(() => {
    if (document && document.mediaPath) {
      // Extrair informações do arquivo
      const fileName =
        document.mediaName || document.mediaPath.split("/").pop();
      const fileExtension = fileName.split(".").pop()?.toLowerCase();

      setFileInfo({
        name: fileName,
        extension: fileExtension,
        type: document.mediaType,
        url: document.mediaPath,
      });
    }
  }, [document]);

  const getDocumentIcon = (extension, mediaType) => {
    switch (extension) {
      case "pdf":
        return <PictureAsPdf className={classes.documentIcon} />;
      case "doc":
      case "docx":
      case "odt":
        return <Description className={classes.documentIcon} />;
      case "xls":
      case "xlsx":
      case "ods":
        return <TableChart className={classes.documentIcon} />;
      case "ppt":
      case "pptx":
      case "odp":
        return <Slideshow className={classes.documentIcon} />;
      case "zip":
      case "rar":
      case "7z":
      case "tar":
      case "gz":
      case "bz2":
        return <Archive className={classes.documentIcon} />;
      case "exe":
        return <GetApp className={classes.documentIcon} />;
      case "xml":
      case "json":
      case "html":
        return <Code className={classes.documentIcon} />;
      case "ret":
        return <Description className={classes.documentIcon} />;
      default:
        if (mediaType === "image")
          return <Image className={classes.documentIcon} />;
        if (mediaType === "video")
          return <VideoLibrary className={classes.documentIcon} />;
        if (mediaType === "audio")
          return <Audiotrack className={classes.documentIcon} />;
        return <Description className={classes.documentIcon} />;
    }
  };

  const getDocumentTypeName = (extension) => {
    const typeMap = {
      pdf: i18n.t("documentModal.pdf") || "PDF Document",
      doc: i18n.t("documentModal.word") || "Word Document",
      docx: i18n.t("documentModal.word") || "Word Document",
      odt: i18n.t("documentModal.odt") || "OpenDocument",
      xls: i18n.t("documentModal.excel") || "Excel Spreadsheet",
      xlsx: i18n.t("documentModal.excel") || "Excel Spreadsheet",
      ods: i18n.t("documentModal.odsSheet") || "OpenDocument Spreadsheet",
      ppt: i18n.t("documentModal.ppt") || "PowerPoint",
      pptx: i18n.t("documentModal.ppt") || "PowerPoint",
      odp: i18n.t("documentModal.odpPresentation") || "OpenDocument Presentation",
      zip: i18n.t("documentModal.compressed") || "Compressed File",
      rar: i18n.t("documentModal.compressed") || "Compressed File",
      "7z": i18n.t("documentModal.compressed") || "Compressed File",
      tar: i18n.t("documentModal.compressed") || "Compressed File",
      gz: i18n.t("documentModal.compressed") || "Compressed File",
      bz2: i18n.t("documentModal.compressed") || "Compressed File",
      xml: i18n.t("documentModal.xml") || "XML File",
      json: i18n.t("documentModal.json") || "JSON File",
      html: i18n.t("documentModal.html") || "HTML File",
      ofx: i18n.t("documentModal.ofx") || "OFX File",
      msg: i18n.t("documentModalExtra.emailOutlook"),
      key: i18n.t("documentModalExtra.keynotePresentation"),
      numbers: i18n.t("documentModalExtra.numbersSpreadsheet"),
      pages: i18n.t("documentModalExtra.pagesDocument"),
      exe: i18n.t("documentModalExtra.executable"),
      ret: i18n.t("documentModalExtra.retFile"),
    };

    return typeMap[extension] || i18n.t("documentModalExtra.document");
  };

  const handleDownload = () => {
    if (fileInfo?.url) {
      window.open(fileInfo.url, "_blank");
    }
  };

  const handleOpen = () => {
    if (fileInfo?.url) {
      window.open(fileInfo.url, "_blank");
    }
  };

  if (!fileInfo) return null;

  return (
    <Dialog open={open} onClose={onClose} className={classes.root}>
      <DialogTitle>
        {i18n.t("documentModalExtra.viewDocument")}
        <IconButton className={classes.closeButton} onClick={onClose}>
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Box className={classes.documentInfo}>
          {["png", "jpg", "jpeg", "gif", "bmp", "webp"].includes(
            fileInfo.extension
          ) ? (
            <img
              src={fileInfo.url}
              alt={fileInfo.name}
              style={{ maxWidth: "100%", maxHeight: 300, marginBottom: 16 }}
            />
          ) : (
            getDocumentIcon(fileInfo.extension, fileInfo.type)
          )}
          <Box className={classes.documentDetails}>
            <Typography className={classes.documentName} variant="h6">
              {fileInfo.name}
            </Typography>
            <Typography
              className={classes.documentType}
              variant="body2"
              color="textSecondary"
            >
              {getDocumentTypeName(fileInfo.extension)}
            </Typography>
            <Chip
              label={fileInfo.extension.toUpperCase()}
              size="small"
              color="primary"
              variant="outlined"
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions className={classes.actions}>
        <Box>
          <Button
            variant="outlined"
            color="primary"
            startIcon={<OpenInNew />}
            onClick={handleOpen}
            className={classes.downloadButton}
          >
            {i18n.t("documentModalExtra.open")}
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<GetApp />}
            onClick={handleDownload}
          >
            {i18n.t("documentModalExtra.download")}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default DocumentModal;
