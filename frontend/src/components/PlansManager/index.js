import React, { useState, useEffect } from "react";
import {
    makeStyles,
    Paper,
    Grid,
    TextField,
    Table,
    TableHead,
    TableBody,
    TableCell,
    TableRow,
    IconButton,
    FormControl,
    InputLabel,
    MenuItem,
    Select
} from "@material-ui/core";
import { Formik, Form, Field } from 'formik';
import ButtonWithSpinner from "../ButtonWithSpinner";
import ConfirmationModal from "../ConfirmationModal";

import EditIcon from "@material-ui/icons/Edit";

import { toast } from "react-toastify";
import usePlans from "../../hooks/usePlans";
import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import { formatCurrency } from "../../helpers/currencyHelper";
import { Skeleton } from "@material-ui/lab";
import useCompanyCurrency from "../../hooks/useCompanyCurrency";


const useStyles = makeStyles(theme => ({
    root: {
        width: '100%'
    },
    mainPaper: {
        width: '100%',
        flex: 1,
        padding: theme.spacing(2)
    },
    fullWidth: {
        width: '100%'
    },
    tableContainer: {
        width: '100%',
        overflowX: "scroll",
        ...theme.scrollbarStyles
    },
    textfield: {
        width: '100%'
    },
    textRight: {
        textAlign: 'right'
    },
    row: {
        paddingTop: theme.spacing(2),
        paddingBottom: theme.spacing(2)
    },
    control: {
        paddingRight: theme.spacing(1),
        paddingLeft: theme.spacing(1)
    },
    buttonContainer: {
        textAlign: 'right',
        padding: theme.spacing(1)
    }
}));

// Valores de um plano novo. Também é a lista de TODOS os campos do plano:
// ao editar, cada campo vem do plano salvo e só cai no padrão se faltar.
// Antes, "Campanha de voz", "WhatsApp Embedded Signup" e "Webchat" ficavam de
// fora ao abrir um plano para editar: o campo aparecia em branco, como se
// estivesse desligado, mesmo ligado no banco.
const PADRAO_DO_PLANO = {
    name: '',
    users: 0,
    connections: 0,
    queues: 0,
    amount: 0,
    useWhatsapp: true,
    useFacebook: true,
    useInstagram: true,
    useCampaigns: true,
    useSchedules: true,
    useInternalChat: true,
    useExternalApi: true,
    useKanban: true,
    useOpenAi: true,
    useIntegrations: true,
    isPublic: true,
    useWhatsappOfficial: false,
    trial: false,
    trialDays: 3,
    recurrence: 'monthly',
    wavoip: false,
    useFlows: true,
    useContacts: true,
    useDashboard: true,
    useRealTime: true,
    useTelegram: false,
    useZapi: false,
    useWhatsappEmbeddedSignup: false,
    useWebchat: true,
    useWacalls: true,
    // Recurso de custo alto (ocupa chamada simultânea e arrisca bloqueio do
    // número): entra desligado por padrão.
    useVoiceCampaign: false,
    useUtmLinks: true,
    useSalesAgents: true
};

export function PlanManagerForm(props) {
    const { onSubmit, onDelete, onCancel, initialValue, loading } = props;
    const classes = useStyles()

    const [record, setRecord] = useState({ ...PADRAO_DO_PLANO });

    useEffect(() => {
        setRecord(initialValue)
    }, [initialValue])

    const handleSubmit = async (data) => {
        onSubmit(data)
    }

    return (
        <Formik
            enableReinitialize
            className={classes.fullWidth}
            initialValues={record}
            onSubmit={(values, { resetForm }) =>
                setTimeout(() => {
                    handleSubmit(values)
                    resetForm()
                }, 500)
            }
        >
            {(values) => (
                <Form className={classes.fullWidth}>
                    <Grid spacing={1} justifyContent="flex-start" container>

                        {/* PUBLICO */}
                        <Grid xs={12} sm={6} md={1} xl={1} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="status-selection">{i18n.t("plans.form.public")}</InputLabel>
                                <Field
                                    as={Select}
                                    id="status-selection"
                                    label={i18n.t("plans.form.public")}
                                    labelId="status-selection-label"
                                    name="isPublic"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>Sim</MenuItem>
                                    <MenuItem value={false}>Não</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        {/* TRIAL */}
                        <Grid xs={12} sm={6} md={1} xl={1} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="trial-selection">Trial</InputLabel>
                                <Field
                                    as={Select}
                                    id="trial-selection"
                                    label="Trial"
                                    labelId="trial-selection-label"
                                    name="trial"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>Sim</MenuItem>
                                    <MenuItem value={false}>Não</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        {/* TRIAL DAYS */}
                        <Grid xs={12} sm={6} md={1} xl={1} item>
                            <Field
                                as={TextField}
                                label={i18n.t("plans.form.trialDays")}
                                name="trialDays"
                                variant="outlined"
                                className={classes.fullWidth}
                                margin="dense"
                                type="number"
                                inputProps={{ min: 1 }}
                                disabled={!values.values.trial}
                            />
                        </Grid>

                        {/* NOME */}
                        <Grid xs={12} sm={6} md={3} xl={3} item>
                            <Field
                                as={TextField}
                                label={i18n.t("plans.form.name")}
                                name="name"
                                variant="outlined"
                                className={classes.fullWidth}
                                margin="dense"
                            />
                        </Grid>

                        {/* USUARIOS */}
                        <Grid xs={12} sm={6} md={1} item>
                            <Field
                                as={TextField}
                                label={i18n.t("plans.form.users")}
                                name="users"
                                variant="outlined"
                                className={classes.fullWidth}
                                margin="dense"
                                type="number"
                            />
                        </Grid>

                        {/* CONEXOES */}
                        <Grid xs={12} sm={6} md={1} item>
                            <Field
                                as={TextField}
                                label={i18n.t("plans.form.connections")}
                                name="connections"
                                variant="outlined"
                                className={classes.fullWidth}
                                margin="dense"
                                type="number"
                            />
                        </Grid>

                        {/* FILAS */}
                        <Grid xs={12} sm={6} md={1} item>
                            <Field
                                as={TextField}
                                label={i18n.t("plans.form.queues")}
                                name="queues"
                                variant="outlined"
                                className={classes.fullWidth}
                                margin="dense"
                                type="number"
                            />
                        </Grid>

                        {/* VALOR */}
                        <Grid xs={12} sm={6} md={1} item>
                            <Field
                                as={TextField}
                                label={i18n.t("plans.form.amount")}
                                name="amount"
                                variant="outlined"
                                className={classes.fullWidth}
                                margin="dense"
                                type="text"
                            />
                        </Grid>

                        {/* WHATSAPP */}
                        <Grid xs={12} sm={6} md={2} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="useWhatsapp-selection">Whatsapp</InputLabel>
                                <Field
                                    as={Select}
                                    id="useWhatsapp-selection"
                                    label="Whatsapp"
                                    labelId="useWhatsapp-selection-label"
                                    name="useWhatsapp"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>{i18n.t("plans.form.enabled")}</MenuItem>
                                    <MenuItem value={false}>{i18n.t("plans.form.disabled")}</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        {/* WHATSAPP OFICIAL */}
                        <Grid xs={12} sm={6} md={2} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="useWhatsappOfficial-selection">Whatsapp Oficial</InputLabel>
                                <Field
                                    as={Select}
                                    id="useWhatsappOfficial-selection"
                                    label="Whatsapp Oficial"
                                    labelId="useWhatsappOfficial-selection-label"
                                    name="useWhatsappOfficial"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>{i18n.t("plans.form.enabled")}</MenuItem>
                                    <MenuItem value={false}>{i18n.t("plans.form.disabled")}</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        {/* FACEBOOK */}
                        <Grid xs={12} sm={6} md={2} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="useFacebook-selection">Facebook</InputLabel>
                                <Field
                                    as={Select}
                                    id="useFacebook-selection"
                                    label="Facebook"
                                    labelId="useFacebook-selection-label"
                                    name="useFacebook"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>{i18n.t("plans.form.enabled")}</MenuItem>
                                    <MenuItem value={false}>{i18n.t("plans.form.disabled")}</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        {/* INSTAGRAM */}
                        <Grid xs={12} sm={6} md={2} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="useInstagram-selection">Instagram</InputLabel>
                                <Field
                                    as={Select}
                                    id="useInstagram-selection"
                                    label="Instagram"
                                    labelId="useInstagram-selection-label"
                                    name="useInstagram"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>{i18n.t("plans.form.enabled")}</MenuItem>
                                    <MenuItem value={false}>{i18n.t("plans.form.disabled")}</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        {/* CAMPANHAS */}
                        <Grid xs={12} sm={6} md={2} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="useCampaigns-selection">{i18n.t("plans.form.campaigns")}</InputLabel>
                                <Field
                                    as={Select}
                                    id="useCampaigns-selection"
                                    label={i18n.t("plans.form.campaigns")}
                                    labelId="useCampaigns-selection-label"
                                    name="useCampaigns"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>{i18n.t("plans.form.enabled")}</MenuItem>
                                    <MenuItem value={false}>{i18n.t("plans.form.disabled")}</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        {/* AGENDAMENTOS */}
                        <Grid xs={12} sm={8} md={2} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="useSchedules-selection">{i18n.t("plans.form.schedules")}</InputLabel>
                                <Field
                                    as={Select}
                                    id="useSchedules-selection"
                                    label={i18n.t("plans.form.schedules")}
                                    labelId="useSchedules-selection-label"
                                    name="useSchedules"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>{i18n.t("plans.form.enabled")}</MenuItem>
                                    <MenuItem value={false}>{i18n.t("plans.form.disabled")}</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        {/* CHAT INTERNO */}
                        <Grid xs={12} sm={8} md={2} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="useInternalChat-selection">{i18n.t("plans.form.internalChat")}</InputLabel>
                                <Field
                                    as={Select}
                                    id="useInternalChat-selection"
                                    label={i18n.t("plans.form.internalChat")}
                                    labelId="useInternalChat-selection-label"
                                    name="useInternalChat"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>{i18n.t("plans.form.enabled")}</MenuItem>
                                    <MenuItem value={false}>{i18n.t("plans.form.disabled")}</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        {/* API Externa */}
                        <Grid xs={12} sm={8} md={2} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="useExternalApi-selection">{i18n.t("plans.form.externalApi")}</InputLabel>
                                <Field
                                    as={Select}
                                    id="useExternalApi-selection"
                                    label={i18n.t("plans.form.externalApi")}
                                    labelId="useExternalApi-selection-label"
                                    name="useExternalApi"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>{i18n.t("plans.form.enabled")}</MenuItem>
                                    <MenuItem value={false}>{i18n.t("plans.form.disabled")}</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        {/* KANBAN */}
                        <Grid xs={12} sm={8} md={2} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="useKanban-selection">{i18n.t("plans.form.kanban")}</InputLabel>
                                <Field
                                    as={Select}
                                    id="useKanban-selection"
                                    label={i18n.t("plans.form.kanban")}
                                    labelId="useKanban-selection-label"
                                    name="useKanban"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>{i18n.t("plans.form.enabled")}</MenuItem>
                                    <MenuItem value={false}>{i18n.t("plans.form.disabled")}</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        {/* OPENAI */}
                        <Grid xs={12} sm={8} md={2} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="useOpenAi-selection">{i18n.t("plans.form.openAi")}</InputLabel>
                                <Field
                                    as={Select}
                                    id="useOpenAi-selection"
                                    label={i18n.t("plans.form.openAi")}
                                    labelId="useOpenAi-selection-label"
                                    name="useOpenAi"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>{i18n.t("plans.form.enabled")}</MenuItem>
                                    <MenuItem value={false}>{i18n.t("plans.form.disabled")}</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        {/* INTEGRACOES */}
                        <Grid xs={12} sm={8} md={2} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="useIntegrations-selection">{i18n.t("plans.form.integrations")}</InputLabel>
                                <Field
                                    as={Select}
                                    id="useIntegrations-selection"
                                    label={i18n.t("plans.form.integrations")}
                                    labelId="useIntegrations-selection-label"
                                    name="useIntegrations"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>{i18n.t("plans.form.enabled")}</MenuItem>
                                    <MenuItem value={false}>{i18n.t("plans.form.disabled")}</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        {/* WAVOIP */}
                        <Grid xs={12} sm={8} md={2} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="wavoip-selection">Wavoip</InputLabel>
                                <Field
                                    as={Select}
                                    id="wavoip-selection"
                                    label="Wavoip"
                                    labelId="wavoip-selection-label"
                                    name="wavoip"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>{i18n.t("plans.form.enabled")}</MenuItem>
                                    <MenuItem value={false}>{i18n.t("plans.form.disabled")}</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        {/* FLUXOS */}
                        <Grid xs={12} sm={8} md={2} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="useFlows-selection">{i18n.t("plans.form.flows")}</InputLabel>
                                <Field
                                    as={Select}
                                    id="useFlows-selection"
                                    label={i18n.t("plans.form.flows")}
                                    labelId="useFlows-selection-label"
                                    name="useFlows"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>{i18n.t("plans.form.enabled")}</MenuItem>
                                    <MenuItem value={false}>{i18n.t("plans.form.disabled")}</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        {/* CONTATOS */}
                        <Grid xs={12} sm={8} md={2} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="useContacts-selection">{i18n.t("plans.form.contacts")}</InputLabel>
                                <Field
                                    as={Select}
                                    id="useContacts-selection"
                                    label={i18n.t("plans.form.contacts")}
                                    labelId="useContacts-selection-label"
                                    name="useContacts"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>{i18n.t("plans.form.enabled")}</MenuItem>
                                    <MenuItem value={false}>{i18n.t("plans.form.disabled")}</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        {/* DASHBOARD */}
                        <Grid xs={12} sm={8} md={2} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="useDashboard-selection">{i18n.t("plans.form.dashboard")}</InputLabel>
                                <Field
                                    as={Select}
                                    id="useDashboard-selection"
                                    label={i18n.t("plans.form.dashboard")}
                                    labelId="useDashboard-selection-label"
                                    name="useDashboard"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>{i18n.t("plans.form.enabled")}</MenuItem>
                                    <MenuItem value={false}>{i18n.t("plans.form.disabled")}</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        {/* TEMPO REAL */}
                        <Grid xs={12} sm={8} md={2} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="useRealTime-selection">{i18n.t("plans.form.realTime")}</InputLabel>
                                <Field
                                    as={Select}
                                    id="useRealTime-selection"
                                    label={i18n.t("plans.form.realTime")}
                                    labelId="useRealTime-selection-label"
                                    name="useRealTime"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>{i18n.t("plans.form.enabled")}</MenuItem>
                                    <MenuItem value={false}>{i18n.t("plans.form.disabled")}</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        {/* TELEGRAM */}
                        <Grid xs={12} sm={6} md={2} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="useTelegram-selection">Telegram</InputLabel>
                                <Field
                                    as={Select}
                                    id="useTelegram-selection"
                                    label="Telegram"
                                    labelId="useTelegram-selection-label"
                                    name="useTelegram"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>{i18n.t("plans.form.enabled")}</MenuItem>
                                    <MenuItem value={false}>{i18n.t("plans.form.disabled")}</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        {/* Z-API */}
                        <Grid xs={12} sm={6} md={2} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="useZapi-selection">Z-API</InputLabel>
                                <Field
                                    as={Select}
                                    id="useZapi-selection"
                                    label="Z-API"
                                    labelId="useZapi-selection-label"
                                    name="useZapi"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>{i18n.t("plans.form.enabled")}</MenuItem>
                                    <MenuItem value={false}>{i18n.t("plans.form.disabled")}</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        {/* WHATSAPP EMBEDDED SIGNUP */}
                        <Grid xs={12} sm={6} md={2} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="useWhatsappEmbeddedSignup-selection">WhatsApp Embedded Signup</InputLabel>
                                <Field
                                    as={Select}
                                    id="useWhatsappEmbeddedSignup-selection"
                                    label="WhatsApp Embedded Signup"
                                    labelId="useWhatsappEmbeddedSignup-selection-label"
                                    name="useWhatsappEmbeddedSignup"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>{i18n.t("plans.form.enabled")}</MenuItem>
                                    <MenuItem value={false}>{i18n.t("plans.form.disabled")}</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        {/* WEBCHAT (chat no site) */}
                        <Grid xs={12} sm={6} md={2} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="useWebchat-selection">Webchat</InputLabel>
                                <Field
                                    as={Select}
                                    id="useWebchat-selection"
                                    label="Webchat"
                                    labelId="useWebchat-selection-label"
                                    name="useWebchat"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>{i18n.t("plans.form.enabled")}</MenuItem>
                                    <MenuItem value={false}>{i18n.t("plans.form.disabled")}</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        {/* WHATSAPP PLUS - VOZ + MSG (wacalls) */}
                        <Grid xs={12} sm={6} md={2} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="useWacalls-selection">WhatsApp Plus - Voz + Msg</InputLabel>
                                <Field
                                    as={Select}
                                    id="useWacalls-selection"
                                    label="WhatsApp Plus - Voz + Msg"
                                    labelId="useWacalls-selection-label"
                                    name="useWacalls"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>{i18n.t("plans.form.enabled")}</MenuItem>
                                    <MenuItem value={false}>{i18n.t("plans.form.disabled")}</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        {/* CAMPANHA DE VOZ */}
                        <Grid xs={12} sm={6} md={2} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="useVoiceCampaign-selection">Campanha de voz</InputLabel>
                                <Field
                                    as={Select}
                                    id="useVoiceCampaign-selection"
                                    label="Campanha de voz"
                                    labelId="useVoiceCampaign-selection-label"
                                    name="useVoiceCampaign"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>{i18n.t("plans.form.enabled")}</MenuItem>
                                    <MenuItem value={false}>{i18n.t("plans.form.disabled")}</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        {/* LINKS UTM e AGENTES COMERCIAIS: opções próprias, sem depender de Campanhas */}
                        <Grid xs={12} sm={6} md={2} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="useUtmLinks-selection">{i18n.t("plans.form.utmLinks")}</InputLabel>
                                <Field
                                    as={Select}
                                    id="useUtmLinks-selection"
                                    label={i18n.t("plans.form.utmLinks")}
                                    labelId="useUtmLinks-selection-label"
                                    name="useUtmLinks"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>{i18n.t("plans.form.enabled")}</MenuItem>
                                    <MenuItem value={false}>{i18n.t("plans.form.disabled")}</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                        <Grid xs={12} sm={6} md={2} item>
                            <FormControl margin="dense" variant="outlined" fullWidth>
                                <InputLabel htmlFor="useSalesAgents-selection">{i18n.t("plans.form.salesAgents")}</InputLabel>
                                <Field
                                    as={Select}
                                    id="useSalesAgents-selection"
                                    label={i18n.t("plans.form.salesAgents")}
                                    labelId="useSalesAgents-selection-label"
                                    name="useSalesAgents"
                                    margin="dense"
                                >
                                    <MenuItem value={true}>{i18n.t("plans.form.enabled")}</MenuItem>
                                    <MenuItem value={false}>{i18n.t("plans.form.disabled")}</MenuItem>
                                </Field>
                            </FormControl>
                        </Grid>

                    </Grid>
                    <Grid spacing={2} justifyContent="flex-end" container>

                        <Grid sm={3} md={2} item>
                            <ButtonWithSpinner className={classes.fullWidth} loading={loading} onClick={() => onCancel()} variant="contained">
                                {i18n.t("plans.form.clear")}
                            </ButtonWithSpinner>
                        </Grid>
                        {record.id !== undefined ? (
                            <Grid sm={3} md={2} item>
                                <ButtonWithSpinner className={classes.fullWidth} loading={loading} onClick={() => onDelete(record)} variant="contained" color="secondary">
                                    {i18n.t("plans.form.delete")}
                                </ButtonWithSpinner>
                            </Grid>
                        ) : null}
                        <Grid sm={3} md={2} item>
                            <ButtonWithSpinner className={classes.fullWidth} loading={loading} type="submit" variant="contained" color="primary">
                                {i18n.t("plans.form.save")}
                            </ButtonWithSpinner>
                        </Grid>
                    </Grid>
                </Form>
            )}
        </Formik>
    )
}

export function PlansManagerGrid(props) {
    const { records, onSelect } = props
    const classes = useStyles()

    /**
     * Lista de recursos do plano em etiquetas, mostrando SÓ o que está
     * habilitado. Substitui as 20 colunas de "Sim/Não" que faziam a tabela
     * estourar a largura da tela.
     *
     * Cada recurso é `true` por padrão no cadastro (o código antigo tratava
     * apenas `=== false` como desabilitado), então a checagem aqui segue a
     * mesma regra pra não mudar o significado do que já está salvo.
     */
    const FEATURE_LIST = [
        { key: "useWhatsapp", label: "WhatsApp" },
        { key: "useWhatsappOfficial", label: "WhatsApp Oficial" },
        { key: "useWacalls", label: "WhatsApp Plus" },
        { key: "useVoiceCampaign", label: "Campanha de voz" },
        { key: "useFacebook", label: "Facebook" },
        { key: "useInstagram", label: "Instagram" },
        { key: "useTelegram", label: "Telegram" },
        { key: "useZapi", label: "Z-API" },
        // Atenção: este campo NÃO tem o prefixo "use" como os demais.
        { key: "wavoip", label: "Wavoip" },
        { key: "useCampaigns", label: i18n.t("plans.form.campaigns") },
        { key: "useUtmLinks", label: i18n.t("plans.form.utmLinks") },
        { key: "useSalesAgents", label: i18n.t("plans.form.salesAgents") },
        { key: "useSchedules", label: i18n.t("plans.form.schedules") },
        { key: "useInternalChat", label: i18n.t("plans.form.internalChat") },
        { key: "useExternalApi", label: i18n.t("plans.form.externalApi") },
        { key: "useKanban", label: i18n.t("plans.form.kanban") },
        { key: "useOpenAi", label: i18n.t("plans.form.openAi") },
        { key: "useIntegrations", label: i18n.t("plans.form.integrations") },
        { key: "useFlows", label: i18n.t("plans.form.flows") },
        { key: "useContacts", label: i18n.t("plans.form.contacts") },
        { key: "useDashboard", label: i18n.t("plans.form.dashboard") },
        { key: "useRealTime", label: i18n.t("plans.form.realTime") }
    ];

    const renderFeatureChips = (row) => {
        const enabled = FEATURE_LIST.filter(f => row[f.key] !== false);

        if (enabled.length === 0) {
            return <span style={{ color: "#9ca3af", fontSize: 12 }}>—</span>;
        }

        return (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxWidth: 620 }}>
                {enabled.map(f => (
                    <span
                        key={f.key}
                        style={{
                            fontSize: 11,
                            lineHeight: "18px",
                            padding: "0 8px",
                            borderRadius: 10,
                            background: "rgba(78,147,255,0.12)",
                            color: "#2563eb",
                            whiteSpace: "nowrap"
                        }}
                    >
                        {f.label}
                    </span>
                ))}
            </div>
        );
    };

    const renderWhatsapp = (row) => {
        return row.useWhatsapp === false ? `${i18n.t("plans.form.no")}` : `${i18n.t("plans.form.yes")}`;
    };

    const renderWhatsappOfficial = (row) => {
        return row.useWhatsappOfficial === false ? `${i18n.t("plans.form.no")}` : `${i18n.t("plans.form.yes")}`;
    };

    const renderFacebook = (row) => {
        return row.useFacebook === false ? `${i18n.t("plans.form.no")}` : `${i18n.t("plans.form.yes")}`;
    };

    const renderInstagram = (row) => {
        return row.useInstagram === false ? `${i18n.t("plans.form.no")}` : `${i18n.t("plans.form.yes")}`;
    };

    const renderCampaigns = (row) => {
        return row.useCampaigns === false ? `${i18n.t("plans.form.no")}` : `${i18n.t("plans.form.yes")}`;
    };

    const renderSchedules = (row) => {
        return row.useSchedules === false ? `${i18n.t("plans.form.no")}` : `${i18n.t("plans.form.yes")}`;
    };

    const renderInternalChat = (row) => {
        return row.useInternalChat === false ? `${i18n.t("plans.form.no")}` : `${i18n.t("plans.form.yes")}`;
    };

    const renderExternalApi = (row) => {
        return row.useExternalApi === false ? `${i18n.t("plans.form.no")}` : `${i18n.t("plans.form.yes")}`;
    };

    const renderKanban = (row) => {
        return row.useKanban === false ? `${i18n.t("plans.form.no")}` : `${i18n.t("plans.form.yes")}`;
    };

    const renderOpenAi = (row) => {
        return row.useOpenAi === false ? `${i18n.t("plans.form.no")}` : `${i18n.t("plans.form.yes")}`;
    };

    const renderIntegrations = (row) => {
        return row.useIntegrations === false ? `${i18n.t("plans.form.no")}` : `${i18n.t("plans.form.yes")}`;
    };

    const renderWavoip = (row) => {
        return row.wavoip === false ? `${i18n.t("plans.form.no")}` : `${i18n.t("plans.form.yes")}`;
    };

    const renderFlows = (row) => {
        return row.useFlows === false ? `${i18n.t("plans.form.no")}` : `${i18n.t("plans.form.yes")}`;
    };

    const renderContacts = (row) => {
        return row.useContacts === false ? `${i18n.t("plans.form.no")}` : `${i18n.t("plans.form.yes")}`;
    };

    const renderDashboard = (row) => {
        return row.useDashboard === false ? `${i18n.t("plans.form.no")}` : `${i18n.t("plans.form.yes")}`;
    };

    const renderRealTime = (row) => {
        return row.useRealTime === false ? `${i18n.t("plans.form.no")}` : `${i18n.t("plans.form.yes")}`;
    };

    const renderTelegram = (row) => {
        return row.useTelegram === false ? `${i18n.t("plans.form.no")}` : `${i18n.t("plans.form.yes")}`;
    };

    const renderZapi = (row) => {
        return row.useZapi === false ? `${i18n.t("plans.form.no")}` : `${i18n.t("plans.form.yes")}`;
    };

    const renderWacalls = (row) => {
        return row.useWacalls === false ? `${i18n.t("plans.form.no")}` : `${i18n.t("plans.form.yes")}`;
    };

    return (
        <Paper className={classes.tableContainer}>
            <Table
                className={classes.fullWidth}
                // size="small"
                padding="none"
                aria-label="a dense table"
            >
                <TableHead>
                    <TableRow>
                        <TableCell align="center" style={{ width: '1%' }}>#</TableCell>
                        <TableCell align="left">{i18n.t("plans.form.name")}</TableCell>
                        <TableCell align="center">{i18n.t("plans.form.amount")}</TableCell>
                        <TableCell align="center">{i18n.t("plans.form.users")}</TableCell>
                        <TableCell align="center">{i18n.t("plans.form.connections")}</TableCell>
                        <TableCell align="center">{i18n.t("plans.form.queues")}</TableCell>
                        <TableCell align="center">{i18n.t("plans.form.public")}</TableCell>
                        <TableCell align="center">{i18n.t("plans.form.trial")}</TableCell>
                        {/* Antes existiam 20 colunas de "Sim/Não", uma por
                            recurso. Com 27 colunas no total a tabela não cabia
                            na tela: os títulos quebravam em várias linhas e se
                            sobrepunham, e era preciso rolar de lado pra ler
                            qualquer coisa. Agora os recursos viram etiquetas
                            numa coluna só, mostrando apenas o que está
                            HABILITADO — que é a informação que interessa. O que
                            está desabilitado simplesmente não aparece. */}
                        <TableCell align="left">{i18n.t("plans.form.features") !== "plans.form.features" ? i18n.t("plans.form.features") : "Recursos incluídos"}</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {records.map((row) => (
                        <TableRow key={row.id}>
                            <TableCell align="center" style={{ width: '1%' }}>
                                <IconButton onClick={() => onSelect(row)} aria-label="delete">
                                    <EditIcon />
                                </IconButton>
                            </TableCell>
                            <TableCell align="left" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{row.name || '-'}</TableCell>
                            <TableCell align="center" style={{ whiteSpace: "nowrap" }}>{props.currencyReady === false ? <Skeleton variant="text" width={70} style={{ display: "inline-block" }} /> : formatCurrency(row.amount || 0)}</TableCell>
                            <TableCell align="center">{row.users || '-'}</TableCell>
                            <TableCell align="center">{row.connections || '-'}</TableCell>
                            <TableCell align="center">{row.queues || '-'}</TableCell>
                            <TableCell align="center">{row.isPublic ? i18n.t("plans.form.yes") : i18n.t("plans.form.no")}</TableCell>
                            <TableCell align="center" style={{ whiteSpace: "nowrap" }}>
                                {row.useTrial ? `${row.trialDays || 0}d` : i18n.t("plans.form.no")}
                            </TableCell>
                            <TableCell align="left">{renderFeatureChips(row)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </Paper>
    )
}

export default function PlansManager() {
    const classes = useStyles()
    const { list, save, update, remove } = usePlans()

    const [showConfirmDialog, setShowConfirmDialog] = useState(false)
    const [loading, setLoading] = useState(false)
    const [records, setRecords] = useState([])
    const [record, setRecord] = useState({ id: undefined, ...PADRAO_DO_PLANO })

    const { currencyReady } = useCompanyCurrency(1);

    useEffect(() => {
        async function fetchData() {
            await loadPlans()
        }
        fetchData()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [record])

    const loadPlans = async () => {
        setLoading(true)
        try {
            const planList = await list()
            setRecords(planList)
        } catch (e) {
            toast.error(i18n.t("plans.toasts.errorList"))
        }
        setLoading(false)
    }

    const handleSubmit = async (data) => {
        setLoading(true)
        // Garantir que booleans sejam enviados corretamente
        const sanitizedData = {
            ...data,
            isPublic: data.isPublic === "true" ? true : data.isPublic === "false" ? false : Boolean(data.isPublic),
            trial: data.trial === "true" ? true : data.trial === "false" ? false : Boolean(data.trial),
        };
        try {
            if (sanitizedData.id !== undefined) {
                await update(sanitizedData)
            } else {
                await save(sanitizedData)
            }
            await loadPlans()
            handleCancel()
            toast.success(i18n.t("plans.toasts.success"))
        } catch (e) {
            toast.error(i18n.t("plans.toasts.errorSave"))
        }
        setLoading(false)
    }

    const handleDelete = async () => {
        setLoading(true)
        try {
            await remove(record.id)
            await loadPlans()
            handleCancel()
            toast.success(i18n.t("plans.toasts.success"))
        } catch (e) {
            toast.error(i18n.t("plans.toasts.errorDelete"))
        }
        setLoading(false)
    }

    const handleOpenDeleteDialog = () => {
        setShowConfirmDialog(true)
    }

    const handleCancel = () => {
        setRecord({ id: undefined, ...PADRAO_DO_PLANO })
    }

    const handleSelect = (data) => {
        // Cada campo sim/não vem do plano salvo; só usa o padrão se faltar.
        const campos = {}
        Object.keys(PADRAO_DO_PLANO).forEach((chave) => {
            const padrao = PADRAO_DO_PLANO[chave]
            if (typeof padrao === "boolean") {
                campos[chave] = typeof data[chave] === "boolean" ? data[chave] : padrao
            }
        })
        setRecord({
            ...campos,
            id: data.id,
            name: data.name || '',
            users: data.users || 0,
            connections: data.connections || 0,
            queues: data.queues || 0,
            amount: data.amount || 0,
            isPublic: data.isPublic,
            trial: data.trial,
            trialDays: data.trialDays,
            recurrence: data.recurrence,
        })
    }

    return (
        <Paper className={classes.mainPaper} elevation={0}>
            <Grid spacing={2} container>
                <Grid xs={12} item>
                    <PlanManagerForm
                        initialValue={record}
                        onDelete={handleOpenDeleteDialog}
                        onSubmit={handleSubmit}
                        onCancel={handleCancel}
                        loading={loading}
                    />
                </Grid>
                <Grid xs={12} item>
                    <PlansManagerGrid
                        records={records}
                        onSelect={handleSelect}
                        currencyReady={currencyReady}
                    />
                </Grid>
            </Grid>
            <ConfirmationModal
                title={i18n.t("plans.confirmationModal.deleteTitle")}
                open={showConfirmDialog}
                onClose={() => setShowConfirmDialog(false)}
                onConfirm={() => handleDelete()}
            >
                {i18n.t("plans.confirmationModal.deleteMessage")}
            </ConfirmationModal>
        </Paper>
    )
}