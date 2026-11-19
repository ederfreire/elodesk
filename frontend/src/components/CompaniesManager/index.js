import React, { useState, useEffect, useContext } from "react";
import {
  makeStyles,
  Paper,
  Grid,
  FormControl,
  InputLabel,
  MenuItem,
  TextField,
  Table,
  TableHead,
  TableBody,
  TableCell,
  TableRow,
  IconButton,
  Select,
  InputAdornment,
} from "@material-ui/core";
import { Formik, Form, Field } from "formik";
import ButtonWithSpinner from "../ButtonWithSpinner";
import { TimezoneMenuItems } from "../TimezoneSelect";
import ConfirmationModal from "../ConfirmationModal";

import EditIcon from "@material-ui/icons/Edit";
import SearchIcon from "@material-ui/icons/Search";

import { toast } from "react-toastify";
import useCompanies from "../../hooks/useCompanies";
import usePlans from "../../hooks/usePlans";
import ModalUsers from "../ModalUsers";
import api from "../../services/api";
import { head, isArray, has } from "lodash";
import { useDate } from "../../hooks/useDate";
import { formatCurrency, getAvailableCurrencies, setCompanyCurrency } from "../../helpers/currencyHelper";
import ColorModeContext from "../../layout/themeContext";

import moment from "moment";
import { i18n } from "../../translate/i18n";
import { useTheme } from "@material-ui/core/styles";

const useStyles = makeStyles((theme) => ({
  root: {
    width: "100%",
    padding: "2px"
  },
  mainPaper: {
    width: "100%",
    flex: 1,
    // padding: theme.spacing(2), //comentado para retirar o scroll do Empresas
  },
  fullWidth: {
    width: "100%",
  },
  tableContainer: {
    width: "100%",
    // overflowX: "scroll",
    // ...theme.scrollbarStyles,
    padding: "2px",
  },
  textfield: {
    width: "100%",
  },
  textRight: {
    textAlign: "right",
  },
  row: {
    // paddingTop: theme.spacing(2),
    // paddingBottom: theme.spacing(2),
  },
  control: {
    // paddingRight: theme.spacing(1),
    // paddingLeft: theme.spacing(1),
  },
  buttonContainer: {
    textAlign: "right",
    // padding: theme.spacing(1),
  },
}));

export function CompanyForm(props) {
  const { onSubmit, onDelete, onCancel, initialValue, loading } = props;
  const classes = useStyles();
  const [plans, setPlans] = useState([]);
  const [modalUser, setModalUser] = useState(false);
  const [firstUser, setFirstUser] = useState({});
  const availableCurrencies = getAvailableCurrencies();

  const [record, setRecord] = useState({
    name: "",
    email: "",
    phone: "",
    planId: "",
    status: true,
    // campaignsEnabled: false,
    dueDate: "",
    recurrence: "",
    password: "",
    generateInvoice: true,
    currency: "BRL",
    timezone: "America/Sao_Paulo",
    ...initialValue,
  });

  const { list: listPlans } = usePlans();

  useEffect(() => {
    async function fetchData() {
      const list = await listPlans();
      setPlans(list);
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setRecord((prev) => {
      if (moment(initialValue).isValid()) {
        initialValue.dueDate = moment(initialValue.dueDate).format(
          "YYYY-MM-DD"
        );
      }
      return {
        ...prev,
        ...initialValue,
      };
    });
  }, [initialValue]);

  const handleSubmit = async (data) => {
    if (data.dueDate === "" || moment(data.dueDate).isValid() === false) {
      data.dueDate = null;
    }
    onSubmit(data);
    setRecord({ ...initialValue, dueDate: "", generateInvoice: true });
  };

  const handleOpenModalUsers = async () => {
    try {
      const { data } = await api.get("/users/list", {
        params: {
          companyId: initialValue.id,
        },
      });
      if (isArray(data) && data.length) {
        setFirstUser(head(data));
      }
      setModalUser(true);
    } catch (e) {
      toast.error(e);
    }
  };

  const handleCloseModalUsers = () => {
    setFirstUser({});
    setModalUser(false);
  };

  const incrementDueDate = () => {
    const data = { ...record };
    if (data.dueDate !== "" && data.dueDate !== null) {
      switch (data.recurrence) {
        case "MENSAL":
          data.dueDate = moment(data.dueDate)
            .add(1, "month")
            .format("YYYY-MM-DD");
          break;
        case "BIMESTRAL":
          data.dueDate = moment(data.dueDate)
            .add(2, "month")
            .format("YYYY-MM-DD");
          break;
        case "TRIMESTRAL":
          data.dueDate = moment(data.dueDate)
            .add(3, "month")
            .format("YYYY-MM-DD");
          break;
        case "SEMESTRAL":
          data.dueDate = moment(data.dueDate)
            .add(6, "month")
            .format("YYYY-MM-DD");
          break;
        case "ANUAL":
          data.dueDate = moment(data.dueDate)
            .add(12, "month")
            .format("YYYY-MM-DD");
          break;
        default:
          break;
      }
    }
    setRecord(data);
  };

  return (
    <>
      <ModalUsers
        userId={firstUser.id}
        companyId={initialValue.id}
        open={modalUser}
        onClose={handleCloseModalUsers}
      />
      <Formik
        enableReinitialize
        className={classes.fullWidth}
        initialValues={record}
        onSubmit={(values, { resetForm }) =>
          setTimeout(() => {
            handleSubmit(values);
            resetForm();
          }, 500)
        }
      >
        {({ values, setFieldValue }) => (
          <Form className={classes.fullWidth}>
            <Grid spacing={1} justifyContent="center" container>
              <Grid xs={12} sm={6} md={2} item>
                <Field
                  as={TextField}
                  label={i18n.t("compaies.table.name")}
                  name="name"
                  variant="outlined"
                  className={classes.fullWidth}
                  margin="dense"
                />
              </Grid>
              <Grid xs={12} sm={6} md={2} item>
                <Field
                  as={TextField}
                  label={i18n.t("compaies.table.email")}
                  name="email"
                  variant="outlined"
                  className={classes.fullWidth}
                  margin="dense"
                  required
                />
              </Grid>
              <Grid xs={12} sm={6} md={2} item>
                <Field
                  as={TextField}
                  label={i18n.t("compaies.table.password")}
                  name="password"
                  variant="outlined"
                  className={classes.fullWidth}
                  margin="dense"
                />
              </Grid>
              <Grid xs={12} sm={6} md={2} item>
                <Field
                  as={TextField}
                  label={i18n.t("compaies.table.phone")}
                  name="phone"
                  variant="outlined"
                  className={classes.fullWidth}
                  margin="dense"
                />
              </Grid>
              <Grid xs={12} sm={6} md={2} item>
                <FormControl margin="dense" variant="outlined" fullWidth>
                  <InputLabel htmlFor="plan-selection">{i18n.t("compaies.table.plan")}</InputLabel>
                  <Field
                    as={Select}
                    id="plan-selection"
                    label={i18n.t("compaies.table.plan")}
                    labelId="plan-selection-label"
                    name="planId"
                    margin="dense"
                    required
                  >
                    {plans.map((plan, key) => (
                      <MenuItem key={key} value={plan.id}>
                        {plan.name}
                      </MenuItem>
                    ))}
                  </Field>
                </FormControl>
              </Grid>
              <Grid xs={12} sm={6} md={2} item>
                <FormControl margin="dense" variant="outlined" fullWidth>
                  <InputLabel htmlFor="company-timezone-selection">
                    {i18n.t("compaies.table.timezone", "Fuso horário")}
                  </InputLabel>
                  <Field
                    as={Select}
                    id="company-timezone-selection"
                    label={i18n.t("compaies.table.timezone", "Fuso horário")}
                    labelId="company-timezone-label"
                    name="timezone"
                    margin="dense"
                  >
                    {TimezoneMenuItems()}
                  </Field>
                </FormControl>
              </Grid>
              <Grid xs={12} sm={6} md={1} item>
                <FormControl margin="dense" variant="outlined" fullWidth>
                  <InputLabel htmlFor="status-selection">{i18n.t("compaies.table.active")}</InputLabel>
                  <Field
                    as={Select}
                    id="status-selection"
                    label={i18n.t("compaies.table.active")}
                    labelId="status-selection-label"
                    name="status"
                    margin="dense"
                  >
                    <MenuItem value={true}>{i18n.t("compaies.table.yes")}</MenuItem>
                    <MenuItem value={false}>{i18n.t("compaies.table.no")}</MenuItem>
                  </Field>
                </FormControl>
              </Grid>              
              {/* <Grid xs={12} sm={6} md={3} item>
                <FormControl margin="dense" variant="outlined" fullWidth>
                  <InputLabel htmlFor="payment-method-selection">
                    Método de Pagamento
                  </InputLabel>
                  <Field
                    as={Select}
                    id="payment-method-selection"
                    label={i18n.t("companiesManager.paymentMethod") || "Payment Method"}
                    labelId="payment-method-selection-label"
                    name="paymentMethod"
                    margin="dense"
                  >
                    <MenuItem value={"pix"}>PIX</MenuItem>
                  </Field>
                </FormControl>
              </Grid> */}
              <Grid xs={12} sm={6} md={2} item>
                <Field
                  as={TextField}
                  label={i18n.t("compaies.table.document")}
                  name="document"
                  variant="outlined"
                  className={classes.fullWidth}
                  margin="dense"
                />
              </Grid>
              <Grid xs={12} sm={6} md={2} item>
                <FormControl margin="dense" variant="outlined" fullWidth>
                  <InputLabel htmlFor="currency-selection">{i18n.t("settingsOptions.currency")}</InputLabel>
                  <Field
                    as={Select}
                    id="currency-selection"
                    label={i18n.t("settingsOptions.currency")}
                    labelId="currency-selection-label"
                    name="currency"
                    margin="dense"
                    onChange={(e) => {
                      setFieldValue("currency", e.target.value);
                      setFieldValue("__currencyDirty", true);
                    }}
                  >
                    {availableCurrencies.map((currency) => (
                      <MenuItem key={currency.code} value={currency.code}>
                        {currency.symbol} — {currency.name} ({currency.code})
                      </MenuItem>
                    ))}
                  </Field>
                </FormControl>
              </Grid>
              {/* <Grid xs={12} sm={6} md={2} item>
                <FormControl margin="dense" variant="outlined" fullWidth>
                  <InputLabel htmlFor="status-selection">Campanhas</InputLabel>
                  <Field
                    as={Select}
                    id="campaigns-selection"
                    label={i18n.t("companiesManager.campaigns") || "Campaigns"}
                    labelId="campaigns-selection-label"
                    name="campaignsEnabled"
                    margin="dense"
                  >
                    <MenuItem value={true}>Habilitadas</MenuItem>
                    <MenuItem value={false}>Desabilitadas</MenuItem>
                  </Field>
                </FormControl>
              </Grid> */}
              <Grid xs={12} sm={6} md={2} item>
                <FormControl variant="outlined" fullWidth>
                  <Field
                    as={TextField}
                    label={i18n.t("compaies.table.dueDate")}
                    type="date"
                    name="dueDate"
                    InputLabelProps={{
                      shrink: true,
                    }}
                    variant="outlined"
                    fullWidth
                    margin="dense"
                  />
                </FormControl>
              </Grid>
              <Grid xs={12} sm={6} md={2} item>
                <FormControl margin="dense" variant="outlined" fullWidth>
                  <InputLabel htmlFor="recorrencia-selection">
                  {i18n.t("compaies.table.recurrence")}
                  </InputLabel>
                  <Field
                    as={Select}
                    label={i18n.t("companiesManager.recurrence") || "Recurrence"}
                    labelId="recorrencia-selection-label"
                    id="recurrence"
                    name="recurrence"
                    margin="dense"
                  >
                    <MenuItem value="MENSAL">{i18n.t("compaies.table.monthly")}</MenuItem>
                    <MenuItem value="BIMESTRAL">{i18n.t("compaies.table.bimonthly")}</MenuItem>
                    <MenuItem value="TRIMESTRAL">{i18n.t("compaies.table.quarterly")}</MenuItem>
                    <MenuItem value="SEMESTRAL">{i18n.t("compaies.table.semester")}</MenuItem>
                    <MenuItem value="ANUAL">{i18n.t("compaies.table.yearly")}</MenuItem>
                  </Field>
                </FormControl>
              </Grid>

              <Grid xs={12} sm={6} md={3} item>
                <FormControl margin="dense" variant="outlined" fullWidth>
                  <InputLabel htmlFor="generate-invoice-selection">
                    {i18n.t("companiesManager.generateInvoice")}
                  </InputLabel>
                  <Field
                    as={Select}
                    id="generate-invoice-selection"
                    label={i18n.t("companiesManager.generateInvoice")}
                    labelId="generate-invoice-selection-label"
                    name="generateInvoice"
                    margin="dense"
                  >
                    <MenuItem value={true}>{i18n.t("companiesManager.yes")}</MenuItem>
                    <MenuItem value={false}>{i18n.t("companiesManager.no")}</MenuItem>
                  </Field>
                </FormControl>
              </Grid>

              <Grid xs={12} item>
                <Grid justifyContent="flex-end" spacing={1} container>
                  <Grid xs={4} md={1} item>
                    <ButtonWithSpinner
                      className={classes.fullWidth}
                      style={{ marginTop: 7 }}
                      loading={loading}
                      onClick={() => onCancel()}
                      variant="contained"
                    >
                      {i18n.t("compaies.table.clear")}
                    </ButtonWithSpinner>
                  </Grid>
                  {record.id !== undefined ? (
                    <>
                      <Grid xs={6} md={1} item>
                        <ButtonWithSpinner
                          style={{ marginTop: 7 }}
                          className={classes.fullWidth}
                          loading={loading}
                          onClick={() => onDelete(record)}
                          variant="contained"
                          color="secondary"
                          disabled={record.id === 1}
                        >
                          {i18n.t("compaies.table.delete")}
                        </ButtonWithSpinner>
                      </Grid>
                      <Grid xs={6} md={2} item>
                        <ButtonWithSpinner
                          style={{ marginTop: 7 }}
                          className={classes.fullWidth}
                          loading={loading}
                          onClick={() => incrementDueDate()}
                          variant="contained"
                          color="primary"
                        >
                          {i18n.t("compaies.table.dueDate")}
                        </ButtonWithSpinner>
                      </Grid>
                      {/* <Grid xs={6} md={1} item>
                        <ButtonWithSpinner
                          style={{ marginTop: 7 }}
                          className={classes.fullWidth}
                          loading={loading}
                          onClick={() => handleOpenModalUsers()}
                          variant="contained"
                          color="primary"
                        >
                          {i18n.t("compaies.table.user")}
                        </ButtonWithSpinner>
                      </Grid> */}
                    </>
                  ) : null}
                  <Grid xs={6} md={1} item>
                    <ButtonWithSpinner
                      className={classes.fullWidth}
                      style={{ marginTop: 7 }}
                      loading={loading}
                      type="submit"
                      variant="contained"
                      color="primary"
                    >
                      {i18n.t("compaies.table.save")}
                    </ButtonWithSpinner>
                  </Grid>
                </Grid>
              </Grid>
            </Grid>
          </Form>
        )}
      </Formik>
    </>
  );
}

export function CompaniesManagerGrid(props) {
  const { records, onSelect } = props;
  const classes = useStyles();
  const { dateToClient, datetimeToClient } = useDate();
  const { mode } = useContext(ColorModeContext);
  const theme = useTheme();

  const renderStatus = (row) => {
    return row.status === false ? i18n.t("companiesManager.no") : i18n.t("companiesManager.yes");
  };

  const renderPlan = (row) => {
    return row.planId !== null ? row.plan.name : "-";
  };

  const renderPlanValue = (row) => {
    return row.planId !== null ? row.plan.amount ? formatCurrency(row.plan.amount) : formatCurrency(0) : "-";
  };

  // const renderCampaignsStatus = (row) => {
  //   if (
  //     has(row, "settings") &&
  //     isArray(row.settings) &&
  //     row.settings.length > 0
  //   ) {
  //     const setting = row.settings.find((s) => s.key === "campaignsEnabled");
  //     if (setting) {
  //       return setting.value === "true" ? "Habilitadas" : "Desabilitadas";
  //     }
  //   }
  //   return "Desabilitadas";
  // };

  const rowStyle = (record) => {
    if (moment(record.dueDate).isValid()) {
      const now = moment();
      const dueDate = moment(record.dueDate);
      const diff = dueDate.diff(now, "days");
      if (diff >= 1 && diff <= 5) {
        return { backgroundColor: "#fffead" };
      }
      if (diff <= 0) {
        return { backgroundColor: "#fa8c8c" };
      }
    }
    return {};
  };
  
  const cellStyle = (record) => {
    if (moment(record.dueDate).isValid()) {
      const now = moment();
      const dueDate = moment(record.dueDate);
      const diff = dueDate.diff(now, "days");
      if (diff >= 1 && diff <= 5) {
        return { color: "#000" }; // Texto preto para fundo amarelo
      }
      if (diff <= 0) {
        return { color: "#fff" }; // Texto branco para fundo vermelho
      }
    }
    return {};
  };

  const iconStyle = (record) => {
    if (moment(record.dueDate).isValid()) {
      const now = moment();
      const dueDate = moment(record.dueDate);
      const diff = dueDate.diff(now, "days");
      if (diff >= 1 && diff <= 5) {
        return { color: "#000" }; // Ícone preto para fundo amarelo
      }
    }
    return {};
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
            <TableCell align="center" style={{ width: "1%" }}>#</TableCell>
            <TableCell align="left">{i18n.t("compaies.table.name")}</TableCell>
            <TableCell align="left">{i18n.t("compaies.table.email")}</TableCell>
            <TableCell align="center">{i18n.t("compaies.table.phone")}</TableCell>
            <TableCell align="center">{i18n.t("compaies.table.plan")}</TableCell>
            <TableCell align="center">{i18n.t("compaies.table.value")}</TableCell>
            {/* <TableCell align="center">Campanhas</TableCell> */}
            <TableCell align="center">{i18n.t("compaies.table.active")}</TableCell>
            <TableCell align="center">{i18n.t("compaies.table.createdAt")}</TableCell>
            <TableCell align="center">{i18n.t("compaies.table.dueDate")}</TableCell>
            <TableCell align="center">{i18n.t("compaies.table.lastLogin")}</TableCell>
            <TableCell align="center">{i18n.t("compaies.table.generateInvoice")}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {records.map((row, key) => (
            <TableRow style={rowStyle(row)} key={key}>
              <TableCell style={{...cellStyle(row), width: "1%"}} align="center">
                <IconButton style={iconStyle(row)} onClick={() => onSelect(row)} aria-label="delete">
                  <EditIcon style={iconStyle(row)} />
                </IconButton>
              </TableCell>
              <TableCell style={cellStyle(row)} align="left">{row.name || "-"}</TableCell>
              <TableCell style={cellStyle(row)} align="left" size="small">{row.email || "-"}</TableCell>
              <TableCell style={cellStyle(row)} align="center">{row.phone || "-"}</TableCell>
              <TableCell style={cellStyle(row)} align="center">{renderPlan(row)}</TableCell>
              <TableCell style={cellStyle(row)} align="center">{renderPlanValue(row)}</TableCell>
              {/* <TableCell style={cellStyle(row)} align="center">{renderCampaignsStatus(row)}</TableCell> */}
              <TableCell style={cellStyle(row)} align="center">{renderStatus(row)}</TableCell>
              <TableCell style={cellStyle(row)} align="center">{dateToClient(row.createdAt)}</TableCell>
              <TableCell style={cellStyle(row)} align="center">{dateToClient(row.dueDate)}<br /><span>{row.recurrence}</span></TableCell>
              <TableCell style={cellStyle(row)} align="center">{datetimeToClient(row.lastLogin)}</TableCell>
              <TableCell style={cellStyle(row)} align="center">{row.generateInvoice ? i18n.t("compaies.table.yes") : i18n.t("compaies.table.no")}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}

export default function CompaniesManager() {
  const classes = useStyles();
  const { list, save, update, remove } = useCompanies();

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [searchParam, setSearchParam] = useState("");
  const [record, setRecord] = useState({
    name: "",
    email: "",
    phone: "",
    planId: "",
    status: true,
    // campaignsEnabled: false,
    dueDate: "",
    recurrence: "",
    password: "",
    document: "",
    paymentMethod: "",
    generateInvoice: true,
    timezone: "America/Sao_Paulo"
  });

  const [, setCurrencyTick] = useState(0);

  useEffect(() => {
    loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const loadCurrency = async () => {
      try {
        const { data } = await api.get("/companySettings");
        if (data?.currency) {
          setCompanyCurrency(data.currency);
          setCurrencyTick((t) => t + 1);
        }
      } catch {}
    };
    loadCurrency();
    const handler = () => setCurrencyTick((t) => t + 1);
    window.addEventListener("companyCurrencyChanged", handler);
    return () => window.removeEventListener("companyCurrencyChanged", handler);
  }, []);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const companyList = await list();
      setRecords(companyList);
    } catch (e) {
      toast.error(i18n.t("companiesManager.loadError"));
    }
    setLoading(false);
  };

  const handleSubmit = async (data) => {
    setLoading(true);
    try {
      const { currency = "BRL", __currencyDirty, ...companyPayload } = data;
      let savedCompany;
      if (data.id !== undefined) {
        savedCompany = await update(companyPayload);
      } else {
        savedCompany = await save(companyPayload);
      }
      // Só persistir moeda se o usuário tocou no dropdown OU se for criação nova
      const targetCompanyId = Number(data.id || savedCompany?.id || companyPayload?.id);
      const isNewCompany = data.id === undefined;
      if (targetCompanyId && (__currencyDirty || isNewCompany)) {
        await api.put("/companySettings/", {
          companyId: targetCompanyId,
          column: "currency",
          data: currency,
        });
        // Só atualizar cache local se for a empresa do próprio usuário logado
        try {
          const me = JSON.parse(localStorage.getItem("user") || "{}");
          if (me?.companyId && Number(me.companyId) === Number(targetCompanyId)) {
            setCompanyCurrency(currency);
          }
        } catch {}
        toast.success(
          `${i18n.t("settingsOptions.currency")}: ${currency} ✓`
        );
      }
      await loadPlans();
      handleCancel();
      toast.success(i18n.t("companiesManager.operationSuccess"));
    } catch (e) {
      toast.error(
        i18n.t("companiesManager.operationError")
      );
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await remove(record.id);
      await loadPlans();
      handleCancel();
      toast.success(i18n.t("companiesManager.operationSuccess"));
    } catch (e) {
      toast.error(i18n.t("companiesManager.deleteError"));
    }
    setLoading(false);
  };

  const handleOpenDeleteDialog = () => {
    setShowConfirmDialog(true);
  };

  const handleCancel = () => {
    setRecord((prev) => ({
      ...prev,
      name: "",
      email: "",
      phone: "",
      planId: "",
      status: true,
      // campaignsEnabled: false,
      dueDate: "",
      recurrence: "",
      password: "",
      document: "",
      paymentMethod: "",
      generateInvoice: true,
      currency: "BRL",
      __currencyDirty: false,
    }));
  };

  const handleSelect = async (data) => {
    // let campaignsEnabled = false;

    // const setting = data.settings.find(
    //   (s) => s.key.indexOf("campaignsEnabled") > -1
    // );
    // if (setting) {
    //   campaignsEnabled = setting.value === "true" || setting.value === "enabled";
    // }

    setLoading(true);
    let currency = "BRL";
    try {
      const { data: companySettings } = await api.get(`/companySettings/${data.id}`);
      currency = companySettings?.currency || "BRL";
    } catch {}
    setRecord((prev) => ({
      ...prev,
      id: data.id,
      name: data.name || "",
      phone: data.phone || "",
      email: data.email || "",
      planId: data.planId || "",
      status: data.status === false ? false : true,
      // campaignsEnabled,
      dueDate: data.dueDate || "",
      recurrence: data.recurrence || "",
      password: "",
      document: data.document || "",
      paymentMethod: data.paymentMethod || "",
      generateInvoice: data.generateInvoice !== undefined ? data.generateInvoice : true,
      currency,
      __currencyDirty: false,
    }));
    setLoading(false);
  };

  return (
    <Paper className={classes.mainPaper} elevation={0}>
      <Grid spacing={2} container>
        <Grid xs={12} item>
          <CompanyForm
            initialValue={record}
            onDelete={handleOpenDeleteDialog}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            loading={loading}
          />
        </Grid>
        <Grid xs={12} item>
          <TextField
            fullWidth
            variant="outlined"
            size="small"
            placeholder={i18n.t("contacts.searchPlaceholder") || "Pesquisar empresa por nome, e-mail ou telefone..."}
            value={searchParam}
            onChange={(e) => setSearchParam(e.target.value)}
            style={{ marginBottom: 12 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon style={{ color: "gray" }} />
                </InputAdornment>
              ),
            }}
          />
          <CompaniesManagerGrid
            records={(() => {
              const term = (searchParam || "").trim().toLowerCase();
              if (!term) return records;
              return records.filter((r) =>
                [r.name, r.email, r.phone, r.document]
                  .filter(Boolean)
                  .some((v) => String(v).toLowerCase().includes(term))
              );
            })()}
            onSelect={handleSelect}
          />
        </Grid>
      </Grid>
      <ConfirmationModal
        title={i18n.t("companies.confirmationModal.deleteTitle")}
        open={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={() => handleDelete()}
      >
        {i18n.t("companies.confirmationModal.deleteMessage")}
      </ConfirmationModal>
    </Paper>
  );
}
