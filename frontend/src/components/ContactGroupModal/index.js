import React, { useState, useEffect, useContext, useCallback } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Table, TableBody, TableCell, TableHead, TableRow, Checkbox, InputAdornment, CircularProgress, Typography, Box, Chip, TablePagination } from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import SearchIcon from "@material-ui/icons/Search";
import GroupAddIcon from "@material-ui/icons/GroupAdd";
import { toast } from "react-toastify";
import api from "../../services/api";
import { AuthContext } from "../../context/Auth/AuthContext";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles((theme) => ({
  dialogContent: {
    padding: theme.spacing(1),
    minHeight: 400,
  },
  searchContainer: {
    display: "flex",
    gap: theme.spacing(1),
    marginBottom: theme.spacing(2),
    alignItems: "center",
  },
  selectedCount: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    padding: theme.spacing(1),
    backgroundColor: theme.palette.primary.light,
    color: theme.palette.primary.contrastText,
    borderRadius: 4,
    marginBottom: theme.spacing(1),
  },
  tableContainer: {
    maxHeight: 400,
    overflow: "auto",
  },
  groupNameField: {
    marginBottom: theme.spacing(2),
  },
}));

const ContactGroupModal = ({ open, onClose, onGroupCreated }) => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);

  const [contacts, setContacts] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [searchParam, setSearchParam] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [selectAll, setSelectAll] = useState(false);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/contacts/", {
        params: {
          searchParam,
          pageNumber: page + 1,
          pageSize: rowsPerPage,
        },
      });
      setContacts(data.contacts || []);
      setTotalCount(data.count || 0);
    } catch (err) {
      toastError(err);
    }
    setLoading(false);
  }, [searchParam, page, rowsPerPage]);

  useEffect(() => {
    if (open) {
      const delayDebounceFn = setTimeout(() => {
        fetchContacts();
      }, 300);
      return () => clearTimeout(delayDebounceFn);
    }
  }, [open, fetchContacts]);

  const handleToggleContact = (contact) => {
    setSelectedContacts((prev) => {
      const exists = prev.find((c) => c.id === contact.id);
      if (exists) {
        return prev.filter((c) => c.id !== contact.id);
      }
      return [...prev, contact];
    });
  };

  const handleToggleAll = () => {
    if (selectAll) {
      // Deselect all from current page
      const currentIds = contacts.map((c) => c.id);
      setSelectedContacts((prev) =>
        prev.filter((c) => !currentIds.includes(c.id))
      );
    } else {
      // Select all from current page
      const newSelected = [...selectedContacts];
      contacts.forEach((contact) => {
        if (!newSelected.find((c) => c.id === contact.id)) {
          newSelected.push(contact);
        }
      });
      setSelectedContacts(newSelected);
    }
    setSelectAll(!selectAll);
  };

  const isSelected = (contactId) =>
    selectedContacts.some((c) => c.id === contactId);

  const handleSaveGroup = async () => {
    if (!groupName.trim()) {
      toast.error(i18n.t("contactGroupModal.groupNameRequired"));
      return;
    }
    if (selectedContacts.length === 0) {
      toast.error(i18n.t("contactGroupModal.selectAtLeastOne"));
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.post("/contact-lists/from-contacts", {
        name: groupName,
        contactIds: selectedContacts.map((c) => c.id),
      });

      toast.success(
        i18n.t("contactGroupModal.groupCreated", { name: groupName, count: selectedContacts.length })
      );

      if (onGroupCreated) {
        onGroupCreated(data);
      }
      handleClose();
    } catch (err) {
      toastError(err);
    }
    setSaving(false);
  };

  const handleClose = () => {
    setSelectedContacts([]);
    setGroupName("");
    setSearchParam("");
    setPage(0);
    setSelectAll(false);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md" scroll="paper">
      <DialogTitle>
        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
          <GroupAddIcon color="primary" />
          <span>{i18n.t("contactGroupModal.title")}</span>
        </Box>
      </DialogTitle>
      <DialogContent className={classes.dialogContent} dividers>
          <TextField
            className={classes.groupNameField}
            label={i18n.t("contactGroupModal.groupName")}
            variant="outlined"
            fullWidth
            size="small"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder={i18n.t("contactGroupModal.groupNamePlaceholder")}
          />

        <Box className={classes.searchContainer}>
          <TextField
            placeholder={i18n.t("contactGroupModal.searchPlaceholder")}
            variant="outlined"
            size="small"
            fullWidth
            value={searchParam}
            onChange={(e) => {
              setSearchParam(e.target.value);
              setPage(0);
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon style={{ color: "gray" }} />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {selectedContacts.length > 0 && (
          <Box className={classes.selectedCount}>
            <Chip
              label={i18n.t("contactGroupModal.selectedCount", { count: selectedContacts.length })}
              color="primary"
              size="small"
            />
            <Button
              size="small"
              variant="outlined"
              style={{ color: "white", borderColor: "white" }}
              onClick={() => setSelectedContacts([])}
            >
              {i18n.t("contactGroupModal.clearSelection")}
            </Button>
          </Box>
        )}

        <Box className={classes.tableContainer}>
          {loading ? (
            <Box display="flex" justifyContent="center" p={3}>
              <CircularProgress />
            </Box>
          ) : (
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={
                        contacts.some((c) => isSelected(c.id)) &&
                        !contacts.every((c) => isSelected(c.id))
                      }
                      checked={
                        contacts.length > 0 &&
                        contacts.every((c) => isSelected(c.id))
                      }
                      onChange={handleToggleAll}
                    />
                  </TableCell>
                  <TableCell>{i18n.t("contactGroupModal.name")}</TableCell>
                  <TableCell>{i18n.t("contactGroupModal.number")}</TableCell>
                  <TableCell>{i18n.t("contactGroupModal.email")}</TableCell>
                  <TableCell>{i18n.t("contactGroupModal.tags")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {contacts
                  .filter((c) => !c.isGroup)
                  .map((contact) => (
                    <TableRow
                      key={contact.id}
                      hover
                      onClick={() => handleToggleContact(contact)}
                      style={{ cursor: "pointer" }}
                      selected={isSelected(contact.id)}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox checked={isSelected(contact.id)} />
                      </TableCell>
                      <TableCell>{contact.name}</TableCell>
                      <TableCell>{contact.number}</TableCell>
                      <TableCell>{contact.email}</TableCell>
                      <TableCell>
                        {contact.tags &&
                          contact.tags.map((tag) => (
                            <Chip
                              key={tag.id}
                              label={tag.name}
                              size="small"
                              style={{
                                backgroundColor: tag.color || "#ccc",
                                color: "#fff",
                                marginRight: 4,
                                height: 20,
                                fontSize: "0.7rem",
                              }}
                            />
                          ))}
                      </TableCell>
                    </TableRow>
                  ))}
                {contacts.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      <Typography color="textSecondary">
                        {i18n.t("contactGroupModal.noContacts")}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </Box>

        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onChangePage={(e, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onChangeRowsPerPage={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[25, 50, 100]}
          labelRowsPerPage={i18n.t("contactGroupModal.perPage")}
          labelDisplayedRows={({ from, to, count }) =>
            i18n.t("contactGroupModal.displayedRows", { from, to, count })
          }
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="default">
          {i18n.t("contactGroupModal.cancel")}
        </Button>
        <Button
          onClick={handleSaveGroup}
          color="primary"
          variant="contained"
          disabled={saving || selectedContacts.length === 0 || !groupName.trim()}
          startIcon={saving ? <CircularProgress size={20} /> : <GroupAddIcon />}
        >
          {saving
            ? i18n.t("contactGroupModal.creating")
            : i18n.t("contactGroupModal.createGroup", { count: selectedContacts.length })}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ContactGroupModal;
