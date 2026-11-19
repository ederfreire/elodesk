import React, { useState, useEffect } from 'react';
import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import List from '@material-ui/core/List';
import { makeStyles } from '@material-ui/core/styles';
import * as Yup from "yup";
import { Formik, Form } from "formik";

import ContactNotesDialogListItem from '../ContactNotesDialogListItem';
import ConfirmationModal from '../ConfirmationModal';
import ContactNotesEditModal from '../ContactNotesEditModal';

import { toast } from "react-toastify";

import { i18n } from "../../translate/i18n";

import ButtonWithSpinner from '../ButtonWithSpinner';

import useTicketNotes from '../../hooks/useTicketNotes';
import { Grid } from '@material-ui/core';

const useStyles = makeStyles((theme) => ({
    root: {
        '& .MuiTextField-root': {
            margin: theme.spacing(1),
            width: '350px',
        },
    },
    list: {
        width: '100%',
        maxWidth: '350px',
        maxHeight: '200px',
        backgroundColor: theme.palette.background.paper,
        overflow: 'auto'
    },
    inline: {
        width: '100%'
    }
}));

const NoteSchema = Yup.object().shape({
    note: Yup.string()
        .min(2, "Too Short!")
        .required("Required")
});
export function ContactNotes({ ticket, onCancel }) {
    const { id: ticketId, contactId } = ticket
    const classes = useStyles()
    const [newNote, setNewNote] = useState({ note: "" });
    const [loading, setLoading] = useState(false)
    const [showOnDeleteDialog, setShowOnDeleteDialog] = useState(false)
    const [selectedNote, setSelectedNote] = useState({})
    const [notes, setNotes] = useState([])
    const { saveNote, deleteNote, listNotes } = useTicketNotes()
    const [editingNote, setEditingNote] = useState(null);

    useEffect(() => {
        async function openAndFetchData() {
            handleResetState()
            await loadNotes()
        }
        openAndFetchData()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleResetState = () => {
        setNewNote({ note: "" })
        setLoading(false)
    }

    const handleChangeComment = (e) => {
        setNewNote({ note: e.target.value })
    }

    const handleEdit = (note) => {
        setEditingNote(note);
    };

    const handleSave = async values => {
        setLoading(true)
        try {
            await saveNote({
                ...values,
                ticketId,
                contactId
            })
            await loadNotes()
            setNewNote({ note: '' })
            toast.success(i18n.t('contactNotes.noteAdded'))
        } catch (e) {
            toast.error(e)
        }
        setLoading(false)
    }

    const handleOpenDialogDelete = (item) => {
        if (item) {
            setSelectedNote(item);
            setShowOnDeleteDialog(true);
        } else {
            console.error('[ContactNotes] Erro: item não definido em handleOpenDialogDelete');
        }
    }

    const handleDelete = async () => {
        setLoading(true)
        try {
            await deleteNote(selectedNote.id)
            await loadNotes()
            setSelectedNote({})
            toast.success(i18n.t('contactNotes.noteDeleted'))
        } catch (e) {
            toast.error(e)
        }
        setLoading(false)
    }

    const loadNotes = async () => {
        setLoading(true)
        try {
            const notes = await listNotes({ ticketId, contactId })
            setNotes(notes)
        } catch (e) {
            toast.error(e)
        }
        setLoading(false)
    }

    const renderNoteList = () => {
        return notes.map((note) => {
            return <ContactNotesDialogListItem
                note={note}
                key={note.id}
                deleteItem={handleOpenDialogDelete}
                editItem={() => handleEdit(note)}
            />
        })
    }

    return (
        <>
            <ContactNotesEditModal
                open={editingNote !== null}
                onClose={() => setEditingNote(null)}
                note={editingNote ? editingNote.note : ''}
                onSave={handleSave}
            />
            <ConfirmationModal
                title={i18n.t('contactNotes.deleteTitle')}
                open={showOnDeleteDialog}
                onClose={setShowOnDeleteDialog}
                onConfirm={handleDelete}
            >
                {i18n.t('contactNotes.deleteConfirm')}
            </ConfirmationModal>
            <Formik
                initialValues={newNote}
                enableReinitialize={true}
                validationSchema={NoteSchema}
                onSubmit={(values, actions) => {
                    setTimeout(() => {
                        handleSave(values);
                        actions.setSubmitting(false);
                    }, 400);
                }}
                validateOnChange={true}
                validateOnBlur={true}
            >

                {({ touched, errors, setErrors, setFieldValue, values, handleChange, handleBlur, handleSubmit, isSubmitting }) => (
                    <Form 
                        style={{ width: '100%', position: 'relative', zIndex: 1, pointerEvents: 'auto' }}
                        onSubmit={(e) => {
                            e.stopPropagation();
                            handleSubmit(e);
                        }}
                    >
                        <Grid container spacing={2}>
                            <Grid item xs={12}>
                                <div 
                                    style={{ 
                                        position: 'relative',
                                        zIndex: 100,
                                        pointerEvents: 'auto',
                                        width: '100%'
                                    }}
                                >
                                    <TextField
                                        name="note"
                                        rows={3}
                                        label={i18n.t("ticketOptionsMenu.appointmentsModal.textarea")}
                                        placeholder={i18n.t("ticketOptionsMenu.appointmentsModal.placeholder")}
                                        multiline={true}
                                        error={touched.note && Boolean(errors.note)}
                                        helperText={touched.note && errors.note}
                                        variant="outlined"
                                        disabled={false}
                                        readOnly={false}
                                        onChange={(e) => {
                                            const newValue = e.target.value;
                                            // Não fazer stopPropagation aqui para permitir que o evento seja processado
                                            handleChange(e);
                                            handleChangeComment(e);
                                            setFieldValue("note", newValue);
                                        }}
                                        onFocus={(e) => {
                                            // Não fazer stopPropagation para permitir foco
                                        }}
                                        onBlur={(e) => {
                                            handleBlur(e);
                                        }}
                                        onClick={(e) => {
                                            // Não fazer stopPropagation para permitir click
                                        }}
                                        onKeyDown={(e) => {
                                            // Não fazer stopPropagation aqui para permitir que a tecla seja processada
                                        }}
                                        onKeyUp={(e) => {
                                            // Forçar atualização do valor após cada tecla
                                            const textarea = e.target.closest('.MuiInputBase-root')?.querySelector('textarea');
                                            if (textarea && textarea.value !== values.note) {
                                                setFieldValue("note", textarea.value);
                                            }
                                        }}
                                        onInput={(e) => {
                                            const textarea = e.target.closest('.MuiInputBase-root')?.querySelector('textarea') || e.target;
                                            const newValue = textarea.value || '';
                                            if (newValue !== values.note) {
                                                setFieldValue("note", newValue);
                                            }
                                        }}
                                        onCompositionStart={(e) => {
                                        }}
                                        onCompositionEnd={(e) => {
                                            const textarea = e.target.closest('.MuiInputBase-root')?.querySelector('textarea') || e.target;
                                            setFieldValue("note", textarea.value);
                                        }}
                                        value={values.note || ""}
                                        fullWidth
                                        autoFocus={false}
                                        style={{ 
                                            pointerEvents: 'auto',
                                            zIndex: 100,
                                            WebkitUserSelect: 'text',
                                            userSelect: 'text',
                                            position: 'relative',
                                            backgroundColor: 'transparent',
                                            width: '100%'
                                        }}
                                        InputProps={{
                                            style: {
                                                pointerEvents: 'auto',
                                                WebkitUserSelect: 'text',
                                                userSelect: 'text',
                                                zIndex: 100
                                            }
                                        }}
                                        inputProps={{
                                            style: {
                                                pointerEvents: 'auto',
                                                WebkitUserSelect: 'text',
                                                userSelect: 'text',
                                                touchAction: 'manipulation',
                                                zIndex: 100
                                            }
                                        }}
                                    />
                                </div>
                            </Grid>
                            {notes.length > 0 && (
                                <Grid item xs={12}>
                                    <List 
                                        className={classes.list}
                                        style={{
                                            pointerEvents: 'auto',
                                            position: 'relative',
                                            zIndex: 1
                                        }}
                                    >
                                        {renderNoteList()}
                                    </List>
                                </Grid>
                            )}
                            <Grid item xs={12}>
                                <Grid container spacing={2}>
                                    <Grid item xs={6}>
                                        <Button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setNewNote({ note: "" });
                                                setFieldValue("note", "");
                                                setErrors({});
                                                // Limpar também o estado local
                                                handleChangeComment({ target: { value: "" } });
                                             if (typeof onCancel === "function") {
                                                 onCancel();
                                             }
                                            }}
                                            color="primary"
                                            variant="outlined"
                                            fullWidth
                                            style={{ 
                                                pointerEvents: 'auto',
                                                zIndex: 100,
                                                touchAction: 'manipulation',
                                                position: 'relative'
                                            }}
                                         >
                                             {i18n.t('contactNotes.cancel')}
                                        </Button>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <ButtonWithSpinner 
                                            loading={loading || isSubmitting} 
                                            color="primary" 
                                            type="submit" 
                                            variant="contained" 
                                            fullWidth
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                // Forçar submit do form
                                                const form = e.target.closest('form');
                                                if (form) {
                                                    form.requestSubmit();
                                                }
                                            }}
                                            disabled={loading || isSubmitting}
                                            style={{ 
                                                pointerEvents: 'auto',
                                                zIndex: 100,
                                                touchAction: 'manipulation',
                                                position: 'relative'
                                            }}
                                        >
                                             {i18n.t('contactNotes.save')}
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