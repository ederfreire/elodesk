/* eslint-disable no-unused-vars */

import React, { useState, useEffect, useReducer, useContext } from "react";
import { toast } from "react-toastify";

import { useHistory } from "react-router-dom";

import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import Button from "@material-ui/core/Button";
import IconButton from "@material-ui/core/IconButton";
import Typography from "@material-ui/core/Typography";

import DeleteOutlineIcon from "@material-ui/icons/DeleteOutline";
import EditIcon from "@material-ui/icons/Edit";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";

import api from "../../services/api";
import { i18n } from "../../translate/i18n";
import ConfirmationModal from "../../components/ConfirmationModal";
import toastError from "../../errors/toastError";
import { isArray } from "lodash";
import { AuthContext } from "../../context/Auth/AuthContext";
import CampaignModalPhrase from "../../components/CampaignModalPhrase";
import AddCircle from "@mui/icons-material/AddCircle";
import TextFields from "@mui/icons-material/TextFields";
import { CircularProgress, Grid, Stack, Chip, Box, Tooltip } from "@mui/material";
import { Can } from "../../components/Can";

const reducer = (state, action) => {
  if (action.type === "LOAD_CAMPAIGNS") {
    const campaigns = action.payload;
    const newCampaigns = [];

    if (isArray(campaigns)) {
      campaigns.forEach((campaign) => {
        const campaignIndex = state.findIndex((u) => u.id === campaign.id);
        if (campaignIndex !== -1) {
          state[campaignIndex] = campaign;
        } else {
          newCampaigns.push(campaign);
        }
      });
    }

    return [...state, ...newCampaigns];
  }

  if (action.type === "UPDATE_CAMPAIGNS") {
    const campaign = action.payload;
    const campaignIndex = state.findIndex((u) => u.id === campaign.id);

    if (campaignIndex !== -1) {
      state[campaignIndex] = campaign;
      return [...state];
    } else {
      return [campaign, ...state];
    }
  }

  if (action.type === "DELETE_CAMPAIGN") {
    const campaignId = action.payload;

    const campaignIndex = state.findIndex((u) => u.id === campaignId);
    if (campaignIndex !== -1) {
      state.splice(campaignIndex, 1);
    }
    return [...state];
  }

  if (action.type === "RESET") {
    return [];
  }
};

const useStyles = makeStyles((theme) => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(2),
    overflowY: "auto",
    ...theme.scrollbarStyles,
    backgroundColor: "transparent",
    boxShadow: "none",
    border: "none",
  },
  flowCard: {
    backgroundColor: theme.palette.background.paper,
    borderRadius: 12,
    border: `1px solid ${theme.palette.divider}`,
    padding: theme.spacing(1.5),
    transition: "all 0.25s ease",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    "&:hover": {
      transform: "translateY(-2px)",
      boxShadow: theme.shadows[4],
      borderColor: theme.palette.primary.light,
    },
  },
  flowIcon: {
    width: 32,
    height: 32,
    backgroundColor: theme.palette.primary.main,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginRight: theme.spacing(1.25),
    color: theme.palette.primary.contrastText,
    flexShrink: 0,
  },
  flowName: {
    fontSize: "0.875rem",
    fontWeight: 600,
    color: theme.palette.text.primary,
    lineHeight: 1.3,
  },
  flowSubtitle: {
    fontSize: "0.75rem",
    color: theme.palette.text.secondary,
    marginTop: 2,
  },
  whatsappChip: {
    margin: "2px",
    fontSize: "0.75rem",
    height: "20px"
  },
  connectionContainer: {
    display: "flex",
    flexWrap: "wrap",
    gap: "4px",
    alignItems: "center"
  }
}));

const CampaignsPhrase = () => {
  const classes = useStyles();
  const history = useHistory();
  const { user } = useContext(AuthContext);

  const [loading, setLoading] = useState(true);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [deletingContact, setDeletingContact] = useState(null);

  // Estados das campanhas
  const [campaignflows, setCampaignFlows] = useState([]);
  const [ModalOpenPhrase, setModalOpenPhrase] = useState(false);
  const [campaignflowSelected, setCampaignFlowSelected] = useState();

  // Estado para lista de WhatsApps (para exibir nomes)
  const [whatsApps, setWhatsApps] = useState([]);

  const handleDeleteCampaign = async (campaignId) => {
    try {
      await api.delete(`/flowcampaign/${campaignId}`);
      toast.success(i18n.t("hardcoded.campaignDeleted"));
      getCampaigns();
    } catch (err) {
      toastError(err);
    }
    setConfirmModalOpen(false);
    setDeletingContact(null);
  };

  // Buscar lista de WhatsApps para mostrar nomes
  const getWhatsApps = async () => {
    try {
      const response = await api.get("/whatsapp");
      setWhatsApps(response.data || []);
    } catch (error) {
      console.error('Erro ao buscar WhatsApps:', error);
    }
  };

  const getCampaigns = async () => {
    try {
      setLoading(true);
      const response = await api.get("/flowcampaign");
      
      
      
      // Verificar diferentes estruturas de resposta possíveis
      let flowData = [];
      
      if (response.data) {
        if (Array.isArray(response.data.flow)) {
          flowData = response.data.flow;
        }
        else if (response.data.data && Array.isArray(response.data.data.flow)) {
          flowData = response.data.data.flow;
        }
        else if (Array.isArray(response.data.data)) {
          flowData = response.data.data;
        }
        else if (Array.isArray(response.data)) {
          flowData = response.data;
        }
        else {
          const dataKeys = Object.keys(response.data);
          for (const key of dataKeys) {
            if (Array.isArray(response.data[key])) {
              flowData = response.data[key];
              break;
            }
          }
        }
      }
      
      
      setCampaignFlows(flowData);
      
    } catch (error) {
      console.error('Erro ao buscar campanhas:', error);
      toastError(error);
      setCampaignFlows([]);
    } finally {
      setLoading(false);
    }
  };

  const onSaveModal = () => {
    getCampaigns();
  };

  // NOVA FUNÇÃO: Renderizar chips das conexões
  const renderWhatsAppConnections = (whatsappIds) => {
    if (!whatsappIds || !Array.isArray(whatsappIds) || whatsappIds.length === 0) {
      return <Typography variant="body2" color="textSecondary">Nenhuma conexão</Typography>;
    }

    // Se há muitas conexões, mostrar resumo
    if (whatsappIds.length > 3) {
      const firstTwo = whatsappIds.slice(0, 2);
      const remaining = whatsappIds.length - 2;

      return (
        <Box className={classes.connectionContainer}>
          {firstTwo.map((whatsappId) => {
            const whatsapp = whatsApps.find(w => w.id === whatsappId);
            return (
              <Tooltip key={whatsappId} title={whatsapp ? `${whatsapp.name} (${whatsapp.status})` : `ID: ${whatsappId}`}>
                <Chip 
                  label={whatsapp ? whatsapp.name : `ID: ${whatsappId}`}
                  className={classes.whatsappChip}
                  size="small"
                  color={whatsapp?.status === "CONNECTED" ? "success" : "default"}
                  variant="outlined"
                />
              </Tooltip>
            );
          })}
          <Tooltip title={`Mais ${remaining} conexão(ões)`}>
            <Chip 
              label={`+${remaining}`}
              className={classes.whatsappChip}
              size="small"
              color="primary"
              variant="outlined"
            />
          </Tooltip>
        </Box>
      );
    }

    // Mostrar todas as conexões se forem poucas
    return (
      <Box className={classes.connectionContainer}>
        {whatsappIds.map((whatsappId) => {
          const whatsapp = whatsApps.find(w => w.id === whatsappId);
          return (
            <Tooltip key={whatsappId} title={whatsapp ? `${whatsapp.name} (${whatsapp.status})` : `ID: ${whatsappId}`}>
              <Chip 
                label={whatsapp ? whatsapp.name : `ID: ${whatsappId}`}
                className={classes.whatsappChip}
                size="small"
                color={whatsapp?.status === "CONNECTED" ? "success" : "default"}
                variant="outlined"
              />
            </Tooltip>
          );
        })}
      </Box>
    );
  };

  useEffect(() => {
    getCampaigns();
    getWhatsApps(); // Carregar lista de WhatsApps
  }, []);

  return (
    <MainContainer>
      <ConfirmationModal
        title={
          deletingContact &&
          `${i18n.t("campaigns.confirmationModal.deleteTitle")} ${
            deletingContact.name
          }?`
        }
        open={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        onConfirm={() => handleDeleteCampaign(deletingContact.id)}
      >
        {i18n.t("campaigns.confirmationModal.deleteMessage")}
      </ConfirmationModal>
      <CampaignModalPhrase
        open={ModalOpenPhrase}
        onClose={() => setModalOpenPhrase(false)}
        FlowCampaignId={campaignflowSelected}
        onSave={onSaveModal}
      />
      <MainHeader>
        <Grid style={{ width: "99.6%" }} container>
          <Grid xs={12} sm={8} item>
            <Title>{i18n.t("campaignsPhrase.campaignsFlow")}</Title>
          </Grid>
          <Grid xs={12} sm={4} item>
            <Grid spacing={2} container>
              <Grid xs={6} sm={6} item>
                {/* Campo de busca comentado */}
              </Grid>
              <Grid xs={6} sm={6} item>
                <Button
                  fullWidth
                  variant="contained"
                  onClick={() => {
                    setCampaignFlowSelected(undefined);
                    setModalOpenPhrase(true);
                  }}
                  color="primary"
                  style={{ textTransform: "none" }}
                >
                  <Stack direction={"row"} gap={1}>
                    <AddCircle />
                    {i18n.t("campaignsPhrase.newCampaign")}
                  </Stack>
                </Button>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </MainHeader>
      <Paper
        className={classes.mainPaper}
        variant="outlined"
      >
        {loading ? (
            <Stack
              justifyContent={"center"}
              alignItems={"center"}
              minHeight={"50vh"}
            >
              <CircularProgress />
            </Stack>
          ) : (
            <>
              {campaignflows && Array.isArray(campaignflows) && campaignflows.length > 0 ? (
                <Grid container spacing={2}>
                  {campaignflows.map((flow) => (
                    <Grid item xs={12} sm={6} md={4} lg={3} xl={2} key={flow.id}>
                      <Box className={classes.flowCard}>
                        <Stack direction="row" alignItems="flex-start">
                          <Box className={classes.flowIcon}>
                            <TextFields fontSize="small" />
                          </Box>
                          <Box flex={1} minWidth={0}>
                            <Typography className={classes.flowName} noWrap>
                              {flow.name || i18n.t("campaignsPhrase.nameNotDefined")}
                            </Typography>
                            {flow.phrase && Array.isArray(flow.phrase) && (
                              <Typography className={classes.flowSubtitle}>
                                {flow.phrase.length} {i18n.t("campaignsPhrase.phrasesConfigured")}
                              </Typography>
                            )}
                          </Box>
                        </Stack>

                        <Box mt={1.5} mb={1} minHeight={28}>
                          {renderWhatsAppConnections(flow.whatsappIds)}
                        </Box>

                        <Box flex={1} />

                        <Stack direction="row" alignItems="center" justifyContent="space-between" mt={1}>
                          <Chip
                            label={flow.status ? i18n.t("campaignsPhrase.active") : i18n.t("campaignsPhrase.inactive")}
                            size="small"
                            color={flow.status ? "success" : "default"}
                            variant={flow.status ? "filled" : "outlined"}
                          />
                          <Stack direction="row">
                            <IconButton
                              size="small"
                              onClick={() => {
                                setCampaignFlowSelected(flow.id);
                                setModalOpenPhrase(true);
                              }}
                              title={i18n.t("campaignsPhrase.editCampaign")}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <Can
                              role={user.profile}
                              perform="contacts-page:deleteContact"
                              yes={() => (
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    setConfirmModalOpen(true);
                                    setDeletingContact(flow);
                                  }}
                                  title={i18n.t("campaignsPhrase.deleteCampaign")}
                                >
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              )}
                            />
                          </Stack>
                        </Stack>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <Stack
                  justifyContent={"center"}
                  alignItems={"center"}
                  minHeight={"20vh"}
                >
                  <Typography variant="body1">
                    {i18n.t("campaignsPhrase.noCampaigns")}
                  </Typography>
                  <Typography variant="body2" color="textSecondary" style={{ marginTop: "8px" }}>
                    {i18n.t("campaignsPhrase.clickNewCampaign")}
                  </Typography>
                </Stack>
              )}
            </>
          )}
      </Paper>
    </MainContainer>
  );
};

export default CampaignsPhrase;