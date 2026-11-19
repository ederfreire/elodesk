import React, { useState, useEffect, useRef } from "react";

import * as Yup from "yup";

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

import { i18n } from "../../translate/i18n";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { Stack } from "@mui/material";
import AddCircle from "@mui/icons-material/AddCircle";
import Delete from "@mui/icons-material/Delete";
import MessageVariablesPicker from "../MessageVariablesPicker";

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

const selectFieldStyles = {
  ".MuiOutlinedInput-notchedOutline": {
    borderColor: "#909090",
  },
  "&:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "#000000",
    borderWidth: "thin",
  },
  "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: "#9a00ed",
    borderWidth: "thin",
  },
};

const ContactSchema = Yup.object().shape({
  name: Yup.string()
    .min(2, i18n.t("flowBuilderValidation.tooShort"))
    .max(50, i18n.t("flowBuilderValidation.tooLong"))
    .required(i18n.t("flowBuilderValidation.enterName")),
  text: Yup.string()
    .min(2, i18n.t("flowBuilderValidation.tooShort"))
    .max(50, i18n.t("flowBuilderValidation.tooLong"))
    .required(i18n.t("flowBuilderValidation.enterMessage")),
});

const FlowBuilderMenuModal = ({ open, onSave, onUpdate, data, close }) => {
  const classes = useStyles();
  const isMounted = useRef(true);
  const textFieldRef = useRef(null);
  const [activeModal, setActiveModal] = useState(false);

  const [textDig, setTextDig] = useState();

  const [arrayOption, setArrayOption] = useState([]);

  const [labels, setLabels] = useState({
    title: i18n.t("flowBuilderMenu.addTitle"),
    btn: i18n.t("flowBuilderMenu.add"),
  });

  useEffect(() => {
    if (open === "edit") {
      setLabels({
        title: i18n.t("flowBuilderMenu.editTitle"),
        btn: i18n.t("flowBuilderMenu.save"),
      });
      setTextDig(data.data.message);
      setArrayOption(data.data.arrayOption);
      setActiveModal(true);
    } else if (open === "create") {
      setLabels({
        title: i18n.t("flowBuilderMenu.addTitle"),
        btn: i18n.t("flowBuilderMenu.add"),
      });
      setTextDig();
      setArrayOption([]);
      setActiveModal(true);
    } else {
      setActiveModal(false);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleClose = () => {
    close(null);
    setActiveModal(false);
  };

  const handleAddVariable = (value) => {
    const input = textFieldRef.current;
    if (input) {
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const currentText = textDig || "";
      const newText = currentText.substring(0, start) + value + currentText.substring(end);
      setTextDig(newText);
      setTimeout(() => {
        input.focus();
        input.setSelectionRange(start + value.length, start + value.length);
      }, 50);
    } else {
      setTextDig((prev) => (prev || "") + value);
    }
  };
  const handleSaveContact = async () => {
    if (open === "edit") {
      handleClose();
      onUpdate({
        ...data,
        data: {
          message: textDig,
          arrayOption: arrayOption,
          typeMenu: "number",
        },
      });
      return;
    } else if (open === "create") {
      handleClose();
      onSave({
        message: textDig,
        arrayOption: arrayOption,
        typeMenu: "number",
      });
    }
  };

  const removeOption = (number) => {
    setArrayOption((old) =>
      old
        .filter((item) => item.number !== number)
        .map((item, idx) => ({ ...item, number: idx + 1 }))
    );
  };

  return (
    <div className={classes.root}>
      <Dialog
        open={activeModal}
        onClose={handleClose}
        fullWidth="md"
        scroll="paper"
      >
        <DialogTitle id="form-dialog-title">{labels.title}</DialogTitle>
        <Stack>
          <Stack dividers style={{ gap: "8px", padding: "16px" }}>
            <MessageVariablesPicker
              onClick={handleAddVariable}
              disabled={false}
            />
            <TextField
              label={i18n.t("flowBuilderMenu.menuMessage")}
              rows={4}
              name="text"
              multiline
              variant="outlined"
              value={textDig}
              onChange={(e) => setTextDig(e.target.value)}
              className={classes.textField}
              style={{ width: "100%" }}
              inputRef={textFieldRef}
            />
            <Stack direction={"row"} justifyContent={"space-between"}>
              <Typography>{i18n.t("flowBuilderMenu.addOption")}</Typography>
              <Button
                onClick={() =>
                  setArrayOption((old) => [
                    ...old,
                    { number: old.length + 1, value: "" },
                  ])
                }
                color="primary"
                variant="contained"
              >
                <AddCircle />
              </Button>
            </Stack>
            {arrayOption.map((item, index) => (
              <Stack width={"100%"} key={`opt-${index}`}>
                <Typography>{i18n.t("flowBuilderMenu.digit")} {item.number}</Typography>
                <Stack direction={"row"} width={"100%"} style={{ gap: "8px" }}>
                  <TextField
                    placeholder={i18n.t("flowBuilderMenu.typeOption")}
                    variant="outlined"
                    value={item.value || ""}
                    style={{ width: "100%" }}
                    onChange={(event) => {
                      const newValue = event.target.value;
                      setArrayOption((old) =>
                        old.map((opt, i) =>
                          i === index ? { ...opt, value: newValue } : opt
                        )
                      );
                    }}
                  />
                  <IconButton onClick={() => removeOption(item.number)}>
                    <Delete />
                  </IconButton>
                </Stack>
              </Stack>
            ))}
          </Stack>
          <DialogActions>
            <Button onClick={handleClose} color="secondary" variant="outlined">
              {i18n.t("contactModal.buttons.cancel")}
            </Button>
            <Button
              type="submit"
              color="primary"
              variant="contained"
              className={classes.btnWrapper}
              onClick={() => handleSaveContact()}
            >
              {`${labels.btn}`}
            </Button>
          </DialogActions>
        </Stack>
      </Dialog>
    </div>
  );
};

export default FlowBuilderMenuModal;
