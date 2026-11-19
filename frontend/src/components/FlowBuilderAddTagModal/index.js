import React, { useState, useEffect, useRef } from "react";

import * as Yup from "yup";

import { toast } from "react-toastify";
import Select from "@material-ui/core/Select";
import InputLabel from "@material-ui/core/InputLabel";
import MenuItem from "@material-ui/core/MenuItem";
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
import { Grid, Stack } from "@mui/material";

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

const FlowBuilderTagModal = ({ open, onSave, data, onUpdate, close }) => {
  const classes = useStyles();
  const isMounted = useRef(true);

  const initialState = {
    queue: "",
    user: "",
  };

  const [activeModal, setActiveModal] = useState(false);

  const [tags, setTags] = useState([]);
  const [selectedTag, setSelectedTag] = useState();

  useEffect(() => {
    if (open === "edit") {
      (async () => {
        try {
          const tag = data.data.tag
          const { data: result } = await api.get("/tags/list");
          setSelectedTag(tag.id);
          setTags(result);
          setActiveModal(true);
        } catch (error) {
        }
      })();
    } else if (open === "create") {
      (async () => {
        try {
          const { data } = await api.get("/tags/list");
          setSelectedTag("");
          setTags(data);
          setActiveModal(true);
        } catch (error) {
        }
      })();
    }
    return () => {
      isMounted.current = false;
    };
  }, [open]);

  const fetchTags = async () => {
    try {
      const response = await api.get("/tags/kanban");
      const fetchedTags = response.data.lista || [];

      setTags(fetchedTags);
    } catch (error) {
    }
  };

  const handleClose = () => {
    close(null);
    setActiveModal(false);
  };

  const handleSaveContact = () => {
    if (!selectedTag) {
      return toast.error(i18n.t("flowBuilderTag.addTagError"));
    }
    if (open === "edit") {
      const tag = tags.find((item) => item.id === selectedTag);

      onUpdate({
        ...data,
        data: {
          tag: tag ? tag : "",
        },
      });
    } else if (open === "create") {
      const tag = tags.find((item) => item.id === selectedTag);

      onSave({
        tag: tag ? tag : "",
      });
    }
    handleClose();
  };

  return (
    <div className={classes.root}>
      <Dialog
        open={activeModal}
        onClose={handleClose}
        fullWidth="md"
        scroll="paper"
      >
        <DialogTitle id="form-dialog-title">
          {open === "create" ? i18n.t("flowBuilderTag.addTitle") : i18n.t("flowBuilderTag.editTitle")}
        </DialogTitle>
        <Stack>
          <DialogContent dividers>
            <Grid style={{ width: "100%", marginTop: 40 }} container>
              <Typography>{i18n.t("flowBuilderTag.chooseTag")}</Typography>
              <Select
                labelId="demo-simple-select-label"
                id="demo-simple-select"
                //   onChange={handleChange}
                value={selectedTag}
                style={{ width: "95%" }}
                onChange={(e) => {
                  setSelectedTag(e.target.value);
                }}
                MenuProps={{
                  anchorOrigin: {
                    vertical: "bottom",
                    horizontal: "left",
                  },
                  transformOrigin: {
                    vertical: "top",
                    horizontal: "left",
                  },
                  getContentAnchorEl: null,
                }}
                renderValue={() => {
                  if (selectedTag === "") {
                    return i18n.t("flowBuilderTag.selectTag");
                  }
                  const tag = tags.find((t) => t.id === selectedTag);
                  if (tag === undefined) {
                    return i18n.t("flowBuilderTag.noTagSelected");
                  }
                  return tag.name;
                }}
              >
                {/* Adiciona a opção vazia */}
                <MenuItem value="">
                  <em>{i18n.t("flowBuilderTag.selectTag")}</em>
                </MenuItem>

                {/* Exibe a lista de usuários */}
                {tags.length > 0 &&
                  tags.map((tag, index) => (
                    <MenuItem dense key={index} value={tag.id}>
                      {tag.name}
                    </MenuItem>
                  ))}
              </Select>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose} color="secondary" variant="outlined">
              {i18n.t("contactModal.buttons.cancel")}
            </Button>
            <Button
              type="submit"
              color="primary"
              variant="contained"
              className={classes.btnWrapper}
              onClick={handleSaveContact}
            >
              {open === "create" ? i18n.t("flowBuilderTag.add") : i18n.t("flowBuilderTag.edit")}
            </Button>
          </DialogActions>
        </Stack>
      </Dialog>
    </div>
  );
};

export default FlowBuilderTagModal;
