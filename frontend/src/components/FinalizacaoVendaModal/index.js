import React, { useState, useContext, useEffect } from "react";
import { toast } from "react-toastify";

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Typography,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormLabel,
} from "@material-ui/core";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import { AuthContext } from "../../context/Auth/AuthContext";
import { getCurrencySymbol } from "../../helpers/currencyHelper";
import useCompanyCurrency from "../../hooks/useCompanyCurrency";

const FinalizacaoVendaModal = ({ open, onClose, ticket, onFinalizar }) => {
  const { user } = useContext(AuthContext);
  const [loading] = useState(false);
  const [vendaConcluida, setVendaConcluida] = useState(true);
  const [valorVenda, setValorVenda] = useState("");
  const [motivoNaoVenda, setMotivoNaoVenda] = useState("");
  const [motivoFinalizacao, setMotivoFinalizacao] = useState("");
  const [motivosFinalizacao, setMotivosFinalizacao] = useState([]);
  const [informarValorVenda, setInformarValorVenda] = useState(false);
  const [currencySymbol, setCurrencySymbol] = useState(getCurrencySymbol());
  const [loadingConfig, setLoadingConfig] = useState(true);
  // Hook centralizado: limpa cache obsoleto e mantém moeda sincronizada
  const { currency: liveCurrency, currencyReady } = useCompanyCurrency(user?.companyId);

  useEffect(() => {
    if (currencyReady) {
      setCurrencySymbol(getCurrencySymbol(liveCurrency || undefined));
    }
  }, [liveCurrency, currencyReady]);

  const handleClose = () => {
    onClose();
    setVendaConcluida(true);
    setValorVenda("");
    setMotivoNaoVenda("");
    setMotivoFinalizacao("");
  };

  useEffect(() => {
    if (open) {
      setLoadingConfig(true);
      Promise.all([fetchMotivosFinalizacao(), fetchCompanySettings()]).then(
        () => setLoadingConfig(false)
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fetchMotivosFinalizacao = async () => {
    try {
      const { data } = await api.get("/ticketFinalizationReasons");
      setMotivosFinalizacao(data);
    } catch (err) {
      console.error("Erro ao buscar motivos de finalização:", err);
    }
  };

  const fetchCompanySettings = async () => {
    try {
      const url = user?.companyId
        ? `/companySettings/${user.companyId}`
        : "/companySettings";
      const { data } = await api.get(url);
      setInformarValorVenda(data?.informarValorVenda || false);
      // moeda agora é tratada por useCompanyCurrency
    } catch (err) {
      console.error("Erro ao buscar configurações da empresa:", err);
    }
  };

  const handleSubmit = async () => {
    if (informarValorVenda) {
      // Check ativado: lógica antiga
      if (vendaConcluida) {
        if (!valorVenda) {
          toast.error(i18n.t("finalizacaoVendaModal.errorSaleValue"));
          return;
        }
      } else {
        if (!motivoNaoVenda) {
          toast.error(i18n.t("finalizacaoVendaModal.errorNoSaleReason"));
          return;
        }
      }
    } else {
      // Check desativado: só motivo de finalização
      if (!motivoFinalizacao) {
        toast.error(i18n.t("finalizacaoVendaModal.errorFinalizationReason"));
        return;
      }
    }

    // Em vez de finalizar aqui, apenas passa os dados para o pai
    const ticketData = {
      status: "closed",
      userId: user?.id || null,
      // sendFarewellMessage e finalizacaoMessage serão definidos no modal seguinte
    };

    if (informarValorVenda) {
      ticketData.finalizadoComVenda = vendaConcluida;
      if (vendaConcluida) {
        ticketData.valorVenda = parseFloat(valorVenda);
        ticketData.motivoNaoVenda = null;
        ticketData.motivoFinalizacao = null;
      } else {
        ticketData.valorVenda = null;
        ticketData.motivoNaoVenda = motivoNaoVenda;
        ticketData.motivoFinalizacao = null;
      }
    } else {
      ticketData.finalizadoComVenda = null;
      ticketData.valorVenda = null;
      ticketData.motivoNaoVenda = null;
      ticketData.motivoFinalizacao = motivoFinalizacao;
    }

    // Chama o callback passando os dados
    if (onFinalizar) onFinalizar(ticketData);
    handleClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{i18n.t("finalizacaoVendaModal.title")}</DialogTitle>
      {loadingConfig ? (
        <DialogContent>
          <Typography>{i18n.t("finalizacaoVendaModal.loading")}</Typography>
        </DialogContent>
      ) : (
        <DialogContent>
          <Grid container spacing={2}>
            {informarValorVenda ? (
              <>
                <Grid item xs={12}>
                  <FormControl component="fieldset">
                    <FormLabel component="legend">
                      {i18n.t("finalizacaoVendaModal.saleCompleted")}
                    </FormLabel>
                    <RadioGroup
                      value={vendaConcluida}
                      onChange={(e) =>
                        setVendaConcluida(e.target.value === "true")
                      }
                    >
                      <FormControlLabel
                        value={true}
                        control={<Radio />}
                        label={i18n.t("finalizacaoVendaModal.yes")}
                      />
                      <FormControlLabel
                        value={false}
                        control={<Radio />}
                        label={i18n.t("finalizacaoVendaModal.no")}
                      />
                    </RadioGroup>
                  </FormControl>
                </Grid>
                {vendaConcluida ? (
                  <Grid item xs={12}>
                    <TextField
                      label={`${i18n.t("finalizacaoVendaModal.saleValue")} (${currencySymbol})`}
                      type="number"
                      value={valorVenda}
                      onChange={(e) => setValorVenda(e.target.value)}
                      fullWidth
                      variant="outlined"
                      margin="dense"
                      inputProps={{
                        step: "0.01",
                        min: "0",
                      }}
                      placeholder="0,00"
                    />
                  </Grid>
                ) : (
                  <Grid item xs={12}>
                    <FormControl
                      fullWidth
                      variant="outlined"
                      margin="dense"
                      required
                    >
                      <InputLabel>{i18n.t("finalizacaoVendaModal.noSaleReason")}</InputLabel>
                      <Select
                        value={motivoNaoVenda}
                        onChange={(e) => setMotivoNaoVenda(e.target.value)}
                        label={i18n.t("finalizacaoVendaModal.noSaleReason")}
                      >
                        <MenuItem value="">
                          <em>{i18n.t("finalizacaoVendaModal.selectReason")}</em>
                        </MenuItem>
                        {motivosFinalizacao.map((motivo) => (
                          <MenuItem key={motivo.id} value={motivo.name}>
                            {motivo.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                )}
              </>
            ) : (
              <Grid item xs={12}>
                <FormControl
                  fullWidth
                  variant="outlined"
                  margin="dense"
                  required
                >
                  <InputLabel>{i18n.t("finalizacaoVendaModal.finalizationReason")}</InputLabel>
                  <Select
                    value={motivoFinalizacao}
                    onChange={(e) => setMotivoFinalizacao(e.target.value)}
                    label={i18n.t("finalizacaoVendaModal.finalizationReason")}
                  >
                    <MenuItem value="">
                      <em>{i18n.t("finalizacaoVendaModal.selectReason")}</em>
                    </MenuItem>
                    {motivosFinalizacao.map((motivo) => (
                      <MenuItem key={motivo.id} value={motivo.name}>
                        {motivo.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}
          </Grid>
        </DialogContent>
      )}
      <DialogActions>
        <Button onClick={handleClose} color="secondary" disabled={loading}>
          {i18n.t("finalizacaoVendaModal.cancel")}
        </Button>
        <Button
          onClick={handleSubmit}
          color="primary"
          variant="contained"
          disabled={loading || loadingConfig}
        >
          {loading ? i18n.t("finalizacaoVendaModal.finalizing") : i18n.t("finalizacaoVendaModal.finalize")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FinalizacaoVendaModal;
