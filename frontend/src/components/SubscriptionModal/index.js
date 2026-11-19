import React, { useEffect, useRef } from "react";

import { makeStyles } from "@material-ui/core/styles";
import Dialog from "@material-ui/core/Dialog";
import DialogContent from "@material-ui/core/DialogContent";
import CheckoutPage from "../CheckoutPage/";

const useStyles = makeStyles((theme) => ({
  root: {
    display: "flex",
    flexWrap: "wrap",
  },
  dialog: {
    '& .MuiDialog-container': {
      alignItems: 'center',
      justifyContent: 'center',
    },
    '& .MuiDialog-paper': {
      borderRadius: 12,
      overflow: 'hidden',
      width: '100%',
      maxWidth: 560,
      margin: theme.spacing(2),
    },
    '& .MuiDialogContent-root': {
      padding: theme.spacing(3),
      display: 'flex',
      justifyContent: 'center',
    },
  },
}));

const ContactModal = ({ open, onClose, Invoice, contactId, initialValues, onSave }) => {
  const classes = useStyles();
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleClose = () => {
    onClose();
  };

  return (
    <div className={classes.root}>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        scroll="paper"
        className={classes.dialog}
      >
        <DialogContent dividers>
          <CheckoutPage Invoice={Invoice} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContactModal;
