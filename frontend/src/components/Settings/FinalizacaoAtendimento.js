import React, { useState, useEffect } from "react";
import {
  Grid,
  Paper,
  Typography,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControlLabel,
  Checkbox,
  Box,
} from "@material-ui/core";
import AddIcon from "@material-ui/icons/Add";
import EditIcon from "@material-ui/icons/Edit";
import DeleteIcon from "@material-ui/icons/Delete";
import { makeStyles } from "@material-ui/core/styles";
import { toast } from "react-toastify";
import { i18n } from "../../translate/i18n";
import api from "../../services/api";

const useStyles = makeStyles((theme) => ({
  root: {
    padding: theme.spacing(3),
  },
  paper: {
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  title: {
    marginBottom: theme.spacing(2),
    color: theme.palette.primary.main,
  },
  addButton: {
    marginBottom: theme.spacing(2),
  },
  table: {
    minWidth: 650,
  },
  actionCell: {
    width: 120,
  },
  chip: {
    margin: theme.spacing(0.5),
  },
}));

const FinalizacaoAtendimento = ({ settings, onSettingsChange }) => {
  const classes = useStyles();
  const [motivos, setMotivos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openModal, setOpenModal] = useState(false);
  const [editingMotivo, setEditingMotivo] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });
  const [informarValorVenda, setInformarValorVenda] = useState(false);

  useEffect(() => {
    if (settings) {
      setInformarValorVenda(settings.informarValorVenda || false);
    }
    fetchMotivos();
  }, [settings]);

  const fetchMotivos = async () => {
    try {
      const { data } = await api.get("/ticketFinalizationReasons");
      setMotivos(data);
    } catch (err) {
      console.error("Erro ao buscar motivos:", err);
    }
  };

  const handleOpenModal = (motivo = null) => {
    if (motivo) {
      setEditingMotivo(motivo);
      setFormData({
        name: motivo.name,
        description: motivo.description || "",
      });
    } else {
      setEditingMotivo(null);
      setFormData({
        name: "",
        description: "",
      });
    }
    setOpenModal(true);
  };

  const handleCloseModal = () => {
    setOpenModal(false);
    setEditingMotivo(null);
    setFormData({
      name: "",
      description: "",
    });
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error(i18n.t("finalizacaoAtendimento.nameRequired"));
      return;
    }

    setLoading(true);
    try {
      if (editingMotivo) {
        await api.put(
          `/ticketFinalizationReasons/${editingMotivo.id}`,
          formData
        );
        toast.success(i18n.t("finalizacaoAtendimento.reasonUpdated"));
      } else {
        await api.post("/ticketFinalizationReasons", formData);
        toast.success(i18n.t("finalizacaoAtendimento.reasonCreated"));
      }
      handleCloseModal();
      fetchMotivos();
    } catch (err) {
      toast.error(err.response?.data?.error || i18n.t("finalizacaoAtendimento.reasonSaveError"));
    }
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (window.confirm(i18n.t("finalizacaoAtendimento.confirmDelete"))) {
      try {
        await api.delete(`/ticketFinalizationReasons/${id}`);
        toast.success(i18n.t("finalizacaoAtendimento.reasonDeleted"));
        fetchMotivos();
      } catch (err) {
        toast.error(err.response?.data?.error || i18n.t("finalizacaoAtendimento.reasonDeleteError"));
      }
    }
  };

  const handleInformarValorVendaChange = async (event) => {
    const newValue = event.target.checked;
    setInformarValorVenda(newValue);

    try {
      await api.put("/companySettings", {
        column: "informarValorVenda",
        data: newValue,
      });

      if (onSettingsChange) {
        onSettingsChange({ ...settings, informarValorVenda: newValue });
      }

      toast.success(i18n.t("finalizacaoAtendimento.settingUpdated"));
    } catch (err) {
      toast.error(i18n.t("finalizacaoAtendimento.settingUpdateError"));
      setInformarValorVenda(!newValue);
    }
  };

  return (
    <div className={classes.root}>
      <Typography variant="h5" className={classes.title}>
        {i18n.t("finalizacaoAtendimento.title")}
      </Typography>

      {/* Configuração de Valor da Venda */}
      <Paper className={classes.paper}>
        <Typography variant="h6" gutterBottom>
          {i18n.t("finalizacaoAtendimento.generalSettings")}
        </Typography>

        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={informarValorVenda}
                  onChange={handleInformarValorVendaChange}
                  color="primary"
                />
              }
              label={i18n.t("finalizacaoAtendimento.informSaleValue")}
            />
            <Typography variant="body2" color="textSecondary">
              {i18n.t("finalizacaoAtendimento.informSaleValueHelper")}
            </Typography>
          </Grid>
        </Grid>
      </Paper>

      {/* Gestão de Motivos */}
      <Paper className={classes.paper}>
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          mb={2}
        >
          <Typography variant="h6">{i18n.t("finalizacaoAtendimento.finalizationReasons")}</Typography>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => handleOpenModal()}
            className={classes.addButton}
          >
            {i18n.t("finalizacaoAtendimento.addReason")}
          </Button>
        </Box>

        <TableContainer>
          <Table className={classes.table}>
            <TableHead>
              <TableRow>
                <TableCell>{i18n.t("finalizacaoAtendimento.name")}</TableCell>
                <TableCell>{i18n.t("finalizacaoAtendimento.description")}</TableCell>
                <TableCell className={classes.actionCell}>{i18n.t("finalizacaoAtendimento.actions")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {motivos.map((motivo) => (
                <TableRow key={motivo.id}>
                  <TableCell>
                    <Typography variant="body1">{motivo.name}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="textSecondary">
                      {motivo.description || i18n.t("finalizacaoAtendimento.noDescription")}
                    </Typography>
                  </TableCell>
                  <TableCell className={classes.actionCell}>
                    <IconButton
                      size="small"
                      onClick={() => handleOpenModal(motivo)}
                      color="primary"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(motivo.id)}
                      color="secondary"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {motivos.length === 0 && (
          <Box textAlign="center" py={3}>
            <Typography variant="body2" color="textSecondary">
              {i18n.t("finalizacaoAtendimento.noReasons")}
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Modal para Adicionar/Editar Motivo */}
      <Dialog
        open={openModal}
        onClose={handleCloseModal}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editingMotivo ? i18n.t("finalizacaoAtendimento.editReason") : i18n.t("finalizacaoAtendimento.addReason")}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={i18n.t("finalizacaoAtendimento.reasonName")}
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                variant="outlined"
                margin="dense"
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={i18n.t("finalizacaoAtendimento.descriptionOptional")}
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                variant="outlined"
                margin="dense"
                multiline
                rows={3}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseModal} disabled={loading}>
            {i18n.t("finalizacaoAtendimento.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            color="primary"
            variant="contained"
            disabled={loading}
          >
            {loading
              ? i18n.t("finalizacaoAtendimento.saving")
              : editingMotivo
              ? i18n.t("finalizacaoAtendimento.update")
              : i18n.t("finalizacaoAtendimento.add")}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default FinalizacaoAtendimento;
