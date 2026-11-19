import React, { useState, useEffect, useRef } from "react";

import * as Yup from "yup";
import { Formik, Form, Field } from "formik";
import { toast } from "react-toastify";

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
import Chip from "@material-ui/core/Chip";
import Box from "@material-ui/core/Box";
import Autocomplete from "@material-ui/lab/Autocomplete";

import { i18n } from "../../translate/i18n";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  root: {
    display: "flex",
    flexWrap: "wrap",
  },
  textField: {
    marginRight: theme.spacing(1),
    flex: 1,
  },

  extraAttr: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },

  btnWrapper: {
    position: "relative",
  },

  buttonProgress: {
    color: green[500],
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -12,
    marginLeft: -12,
  },
}));

const ContactSchema = Yup.object().shape({
  name: Yup.string()
    .min(2, i18n.t("flowBuilderValidation.tooShort"))
    .max(50, i18n.t("flowBuilderValidation.tooLong"))
    .required(i18n.t("flowBuilderValidation.enterName")),
});

const FlowBuilderModal = ({
  open,
  onClose,
  flowId,
  nameWebhook = "",
  initialValues,
  onSave,
}) => {
  const classes = useStyles();
  const isMounted = useRef(true);

  const [contact, setContact] = useState({
    name: nameWebhook,
    description: "",
    triggerType: "keyword",
    keywords: [],
    triggerConfig: {},
  });

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const fetchFlow = async () => {
      if (!flowId) {
        setContact({ name: nameWebhook || "", description: "", triggerType: "keyword", keywords: [], triggerConfig: {} });
        return;
      }
      try {
        const { data } = await api.get(`/flowbuilder/${flowId}`);
        const f = data?.flow || data;
        setContact({
          name: f?.name || nameWebhook || "",
          description: f?.description || "",
          triggerType: f?.triggerType || "keyword",
          keywords: Array.isArray(f?.keywords) ? f.keywords : [],
          triggerConfig: f?.triggerConfig || {},
        });
      } catch (err) {
        // fallback
        setContact({ name: nameWebhook || "", description: "", triggerType: "keyword", keywords: [], triggerConfig: {} });
      }
    };
    fetchFlow();
  }, [flowId, open, nameWebhook]);

  const handleClose = () => {
    onClose();
    setContact({ name: "", description: "", triggerType: "keyword", keywords: [], triggerConfig: {} });
  };

  const handleSaveContact = async (values) => {
    const keywords = Array.isArray(values.keywords)
      ? values.keywords.map((k) => String(k).trim()).filter(Boolean)
      : [];

    // Fluxo com gatilho de palavra-chave e nenhuma palavra cadastrada fica
    // Ativo na lista e nunca dispara — não há o que comparar. É uma armadilha
    // silenciosa: nada avisa, e a impressão é de que o gatilho está quebrado.
    if ((values.triggerType || "keyword") === "keyword" && keywords.length === 0) {
      toast.error(
        "Adicione pelo menos uma palavra-chave. Sem nenhuma, o fluxo nunca vai disparar."
      );
      return;
    }

    if (values.triggerType === "regex") {
      const padroes = Array.isArray(values.keywords) ? values.keywords : [];
      if (padroes.filter(Boolean).length === 0) {
        toast.error(
          "Informe pelo menos uma expressão regular para este gatilho."
        );
        return;
      }
    }
    const payload = {
      name: values.name,
      description: values.description || null,
      triggerType: values.triggerType || "keyword",
      keywords,
      triggerConfig: values.triggerConfig || {},
    };
    if (flowId) {
      try {
        await api.put("/flowbuilder", { ...payload, flowId });
        onSave(values.name);
        handleClose();
        toast.success(i18n.t("webhookModal.toasts.update"));
      } catch (err) {
        toastError(err);
      }
    } else {
      try {
        await api.post("/flowbuilder", payload);
        onSave(values.name);
        handleClose();
        toast.success(i18n.t("webhookModal.saveSuccess"));
      } catch (err) {
        toastError(err);
      }
    }
  };

  return (
    <div className={classes.root}>
      <Dialog open={open} onClose={handleClose} fullWidth="md" scroll="paper">
        <DialogTitle id="form-dialog-title">
          {flowId
            ? `${i18n.t("contacts.editFlow")}`
            : `${i18n.t("contacts.addFlow")}`}
        </DialogTitle>
        <Formik
          initialValues={contact}
          enableReinitialize={true}
          validationSchema={ContactSchema}
          onSubmit={(values, actions) => {
            setTimeout(() => {
              handleSaveContact(values);
              actions.setSubmitting(false);
            }, 400);
          }}
        >
          {({ values, errors, touched, isSubmitting, setFieldValue }) => (
            <Form>
              <DialogContent dividers>
                <Field
                  as={TextField}
                  label={i18n.t("contactModal.form.name")}
                  name="name"
                  autoFocus
                  error={Boolean(errors.name)}
                  helperText={errors.name}
                  variant="outlined"
                  margin="dense"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
                <Field
                  as={TextField}
                  label={i18n.t("flowFormModal.description")}
                  name="description"
                  variant="outlined"
                  margin="dense"
                  fullWidth
                  multiline
                  minRows={2}
                  InputLabelProps={{ shrink: true }}
                  InputProps={{ notched: true }}
                />
                <Field
                  as={TextField}
                  select
                  label={i18n.t("flowFormModal.triggerType")}
                  name="triggerType"
                  variant="outlined"
                  margin="dense"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                >
                  <MenuItem value="keyword">{i18n.t("flowPage.triggerTypes.keyword")}</MenuItem>
                  <MenuItem value="any_message">{i18n.t("flowPage.triggerTypes.anyMessage")}</MenuItem>
                  <MenuItem value="first_contact">{i18n.t("flowPage.triggerTypes.firstContact")}</MenuItem>
                  <MenuItem value="out_of_hours">{i18n.t("flowPage.triggerTypes.outOfHours")}</MenuItem>
                  <MenuItem value="regex">{i18n.t("flowPage.triggerTypes.regex")}</MenuItem>
                  <MenuItem value="integration">{i18n.t("flowPage.triggerTypes.integration")}</MenuItem>
                  <MenuItem value="manual">{i18n.t("flowPage.triggerTypes.manual")}</MenuItem>
                </Field>
                {values.triggerType === "keyword" && (
                  <Autocomplete
                    multiple
                    freeSolo
                    options={[]}
                    value={values.keywords || []}
                    onChange={(_, newValue) => {
                      const cleaned = newValue
                        .flatMap((v) => String(v).split(","))
                        .map((v) => v.trim())
                        .filter(Boolean);
                      const unique = Array.from(new Set(cleaned));
                      setFieldValue("keywords", unique);
                    }}
                    renderTags={(value, getTagProps) =>
                      value.map((option, index) => (
                        <Chip
                          variant="outlined"
                          label={option}
                          size="small"
                          {...getTagProps({ index })}
                          key={`${option}-${index}`}
                        />
                      ))
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        variant="outlined"
                        margin="dense"
                        label={i18n.t("flowFormModal.keywords")}
                        placeholder={i18n.t("flowFormModal.keywordsPlaceholder")}
                        helperText={i18n.t("flowFormModal.keywordsHelper")}
                      />
                    )}
                  />
                )}
                {values.triggerType === "any_message" && (
                  <Box mt={1}>
                    <Typography variant="caption" color="textSecondary">
                      {i18n.t("flowFormModal.anyMessageHelper")}
                    </Typography>
                  </Box>
                )}
                {values.triggerType === "first_contact" && (
                  <Box mt={1}>
                    <Typography variant="caption" color="textSecondary">
                      {i18n.t("flowFormModal.firstContactHelper")}
                    </Typography>
                  </Box>
                )}
                {values.triggerType === "out_of_hours" && (
                  <Box mt={1}>
                    <Typography variant="caption" color="textSecondary">
                      {i18n.t("flowFormModal.outOfHoursHelper")}
                    </Typography>
                  </Box>
                )}
                {values.triggerType === "regex" && (
                  <>
                    <TextField
                      label={i18n.t("flowFormModal.regexPattern")}
                      value={values.triggerConfig?.pattern || ""}
                      onChange={(e) =>
                        setFieldValue("triggerConfig", {
                          ...(values.triggerConfig || {}),
                          pattern: e.target.value,
                        })
                      }
                      placeholder={i18n.t("flowFormModal.regexPatternPlaceholder")}
                      helperText={i18n.t("flowFormModal.regexHelper")}
                      variant="outlined"
                      margin="dense"
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                      label={i18n.t("flowFormModal.regexFlags")}
                      value={values.triggerConfig?.flags || ""}
                      onChange={(e) =>
                        setFieldValue("triggerConfig", {
                          ...(values.triggerConfig || {}),
                          flags: e.target.value,
                        })
                      }
                      placeholder={i18n.t("flowFormModal.regexFlagsPlaceholder")}
                      variant="outlined"
                      margin="dense"
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                    />
                  </>
                )}
                {values.triggerType === "integration" && (
                  <>
                    <TextField
                      label={i18n.t("flowFormModal.webhookUrl")}
                      value={values.triggerConfig?.webhookUrl || ""}
                      onChange={(e) =>
                        setFieldValue("triggerConfig", {
                          ...(values.triggerConfig || {}),
                          webhookUrl: e.target.value,
                        })
                      }
                      placeholder={i18n.t("flowFormModal.webhookUrlPlaceholder")}
                      helperText={i18n.t("flowFormModal.webhookHelper")}
                      variant="outlined"
                      margin="dense"
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                      label={i18n.t("flowFormModal.integrationId")}
                      value={values.triggerConfig?.integrationId || ""}
                      onChange={(e) =>
                        setFieldValue("triggerConfig", {
                          ...(values.triggerConfig || {}),
                          integrationId: e.target.value,
                        })
                      }
                      variant="outlined"
                      margin="dense"
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                    />
                  </>
                )}
                {values.triggerType === "manual" && (
                  <>
                    <Box display="flex" alignItems="center" style={{ gap: 8 }}>
                      <TextField
                        label={i18n.t("flowFormModal.manualToken")}
                        value={values.triggerConfig?.apiToken || ""}
                        onChange={(e) =>
                          setFieldValue("triggerConfig", {
                            ...(values.triggerConfig || {}),
                            apiToken: e.target.value,
                          })
                        }
                        helperText={i18n.t("flowFormModal.manualTokenHelper")}
                        variant="outlined"
                        margin="dense"
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                      />
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          const token =
                            (typeof crypto !== "undefined" && crypto.randomUUID)
                              ? crypto.randomUUID().replace(/-/g, "")
                              : Math.random().toString(36).slice(2) +
                                Math.random().toString(36).slice(2);
                          setFieldValue("triggerConfig", {
                            ...(values.triggerConfig || {}),
                            apiToken: token,
                          });
                        }}
                      >
                        {i18n.t("flowFormModal.generateToken")}
                      </Button>
                    </Box>
                    <TextField
                      label={i18n.t("flowFormModal.manualEndpoint")}
                      value={`POST ${window.location.origin.replace(/\/$/, "")}/api/flowbuilder/trigger`}
                      variant="outlined"
                      margin="dense"
                      fullWidth
                      InputProps={{ readOnly: true }}
                      InputLabelProps={{ shrink: true }}
                    />
                  </>
                )}
              </DialogContent>
              <DialogActions>
                <Button
                  onClick={handleClose}
                  color="secondary"
                  disabled={isSubmitting}
                  variant="outlined"
                >
                  {i18n.t("contactModal.buttons.cancel")}
                </Button>
                <Button
                  type="submit"
                  color="primary"
                  disabled={isSubmitting}
                  variant="contained"
                  className={classes.btnWrapper}
                >
                  {flowId
                    ? `${i18n.t("contactModal.buttons.okEdit")}`
                    : `${i18n.t("contactModal.buttons.okAdd")}`}
                  {isSubmitting && (
                    <CircularProgress
                      size={24}
                      className={classes.buttonProgress}
                    />
                  )}
                </Button>
              </DialogActions>
            </Form>
          )}
        </Formik>
      </Dialog>
    </div>
  );
};

export default FlowBuilderModal;
