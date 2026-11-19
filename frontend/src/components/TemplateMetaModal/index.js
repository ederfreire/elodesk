import React, { useState } from 'react';
import { Dialog, DialogContent, DialogActions, Box, TextField, Typography, IconButton, Button, InputAdornment, Chip } from "@material-ui/core";
import SearchIcon from '@material-ui/icons/Search';
import CloseIcon from '@material-ui/icons/Close';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import SendIcon from '@material-ui/icons/Send';
import { makeStyles } from '@material-ui/core/styles';
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles((theme) => ({
    dialogPaper: {
        borderRadius: 12,
        maxHeight: '85vh',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: theme.spacing(1.5, 2),
        borderBottom: `1px solid ${theme.palette.divider}`,
    },
    headerTitle: {
        fontWeight: 600,
        fontSize: '1rem',
    },
    content: {
        padding: theme.spacing(2),
        background: theme.palette.background.default,
    },
    searchField: {
        marginBottom: theme.spacing(1.5),
        background: theme.palette.background.paper,
        borderRadius: 8,
        '& .MuiOutlinedInput-root': {
            borderRadius: 8,
        },
        '& .MuiOutlinedInput-input': {
            padding: '10px 12px',
        },
    },
    templateList: {
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing(1),
        maxHeight: '55vh',
        overflowY: 'auto',
        paddingRight: 4,
    },
    templateCard: {
        background: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 8,
        padding: theme.spacing(1.25, 1.5),
        cursor: 'pointer',
        transition: 'all .15s ease',
        '&:hover': {
            borderColor: theme.palette.primary.main,
            boxShadow: `0 2px 8px rgba(0,0,0,0.06)`,
        },
    },
    cardTopRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: theme.spacing(1),
    },
    templateName: {
        fontWeight: 600,
        fontSize: '.92rem',
        color: theme.palette.text.primary,
    },
    templateBody: {
        fontSize: '.8rem',
        color: theme.palette.text.secondary,
        marginTop: 2,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
    },
    metaRow: {
        display: 'flex',
        gap: theme.spacing(0.5),
        marginTop: theme.spacing(0.75),
        flexWrap: 'wrap',
    },
    chip: {
        height: 20,
        fontSize: '.68rem',
        fontWeight: 500,
    },
    emptyState: {
        textAlign: 'center',
        padding: theme.spacing(4),
        color: theme.palette.text.secondary,
        fontSize: '.85rem',
    },
    detailsBox: {
        background: theme.palette.background.paper,
        borderRadius: 8,
        padding: theme.spacing(1.5),
        border: `1px solid ${theme.palette.divider}`,
    },
    detailsContent: {
        background: theme.palette.background.default,
        borderRadius: 6,
        padding: theme.spacing(1.25),
        marginTop: theme.spacing(1),
        fontSize: '.85rem',
        whiteSpace: 'pre-wrap',
        maxHeight: 160,
        overflowY: 'auto',
    },
    sectionLabel: {
        fontSize: '.72rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '.5px',
        color: theme.palette.text.secondary,
        marginTop: theme.spacing(1.5),
        marginBottom: theme.spacing(0.5),
    },
    actions: {
        padding: theme.spacing(1.5, 2),
        borderTop: `1px solid ${theme.palette.divider}`,
    },
}));

const TemplateModal = ({ open, handleClose, templates, onSelectTemplate }) => {
    const classes = useStyles();
    const [search, setSearch] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [variables, setVariables] = useState([]);
    const [variableValues, setVariableValues] = useState({});
    const [renderedContent, setRenderedContent] = useState('');

    const handleSearchChange = (event) => {
        setSearch(event.target.value);
    };

    const extractVariablesByComponent = (components) => {
        const regex = /{{(\d+)}}/g;
        let variables = { header: [], body: [], footer: [], buttons: [] };

        components.forEach((component) => {
            let match;
            const type = component.type?.toLowerCase();
            const text = component.text || '';

            if (type === 'header' && ['IMAGE', 'VIDEO'].includes(component?.format)) {
                variables[type].push({ type: `${component?.format.toLowerCase()}`, prompt: component?.format.toLowerCase() === 'image' ? 'Insira a URL da imagem' : 'Insira a URL do vídeo' });
            }
            if (type === 'buttons') {
                const buttons = JSON.parse(component.buttons);
                buttons.forEach((button, index) => {
                    if (button.example) {
                        variables[type].push({ type: button.type, prompt: button.example, index: index });
                    } else if (variables[type]) {
                        while ((match = regex.exec(text)) !== null) {
                            variables[type].push(match[0]);
                        }
                    }
                });
            } else if (variables[type]) {
                while ((match = regex.exec(text)) !== null) {
                    variables[type].push({ type: 'text', prompt: match[0] });
                }
            }
        });
        return variables;
    };

    const handleSelectTemplate = (template) => {
        const components = template?.components || [];
        const extractedVariables = extractVariablesByComponent(components);
        setSelectedTemplate(template);
        setVariables(extractedVariables);
        setRenderedContent(components.map((c) => c?.text).filter(Boolean).join(`\n`));
    };

    const generateBodyToSave = (content, variables) => {
        let bodyToSave = content;
        Object.keys(variables).forEach((componentType) => {
            const componentVariables = variables[componentType];
            if (Array.isArray(componentVariables)) {
                componentVariables.forEach((variable, index) => {
                    const placeholder = `{{${index + 1}}}`;
                    const value = variable?.value || '';
                    bodyToSave = bodyToSave.replace(placeholder, value);
                });
            } else if (typeof componentVariables === 'object') {
                if (componentType === 'header') {
                    Object.keys(componentVariables).forEach((key, index) => {
                        const value = componentVariables[key]?.value || '';
                        if (value.startsWith("http")) {
                            bodyToSave = `${value} \n ${bodyToSave}`;
                        } else {
                            const placeholder = `{{${index + 1}}}`;
                            bodyToSave = bodyToSave.replace(placeholder, value);
                        }
                    });
                } else {
                    Object.keys(componentVariables).forEach((key, index) => {
                        const placeholder = `{{${index + 1}}}`;
                        const value = componentVariables[key]?.value || '';
                        bodyToSave = bodyToSave.replace(placeholder, value);
                    });
                }
            }
        });
        return bodyToSave;
    };

    const handleSendTemplate = () => {
        let hasEmpty = false;
        let emptyFields = [];
        Object.keys(variables).forEach((componentType) => {
            variables[componentType].forEach((variable, index) => {
                const val = variableValues[componentType]?.[index]?.value;
                if (!val || val.trim() === '') {
                    hasEmpty = true;
                    emptyFields.push(`${componentType.toUpperCase()} - ${variable?.prompt || `Variável ${index + 1}`}`);
                }
            });
        });

        if (hasEmpty) {
            alert(`⚠️ Preencha todas as variáveis antes de enviar:\n\n${emptyFields.join('\n')}`);
            return;
        }

        const bodyToSave = generateBodyToSave(renderedContent, variableValues);
        const templateWithVariables = {
            ...selectedTemplate,
            variables: variableValues,
            bodyToSave
        };
        onSelectTemplate(templateWithVariables);
    };

    const handleVariableChange = (componentType, index, value, buttonIndex) => {
        const newComponentValues = { ...variableValues[componentType], [index]: { value, buttonIndex } };
        setVariableValues({ ...variableValues, [componentType]: newComponentValues });
    };

    const handleBack = () => {
        setSelectedTemplate(null);
        setVariableValues({});
        setRenderedContent('');
    };

    const onClose = () => {
        handleBack();
        setSearch('');
        handleClose();
    };

    const filteredTemplates = templates.filter((template) =>
        template?.shortcode?.toLowerCase().includes(search?.toLowerCase())
    );

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            classes={{ paper: classes.dialogPaper }}
        >
            <Box className={classes.header}>
                <Box display="flex" alignItems="center" style={{ gap: 8 }}>
                    {selectedTemplate && (
                        <IconButton size="small" onClick={handleBack}>
                            <ArrowBackIcon fontSize="small" />
                        </IconButton>
                    )}
                    <Typography className={classes.headerTitle}>
                        {selectedTemplate
                            ? i18n.t("templateMetaModal.selectedDetails")
                            : i18n.t("templateMetaModal.title")}
                    </Typography>
                </Box>
                <IconButton size="small" onClick={onClose}>
                    <CloseIcon fontSize="small" />
                </IconButton>
            </Box>

            <DialogContent className={classes.content}>
                {!selectedTemplate && (
                    <>
                        <TextField
                            variant="outlined"
                            size="small"
                            fullWidth
                            placeholder={i18n.t("templateMetaModal.searchPlaceholder")}
                            value={search}
                            onChange={handleSearchChange}
                            className={classes.searchField}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon fontSize="small" />
                                    </InputAdornment>
                                ),
                            }}
                        />

                        <Box className={classes.templateList}>
                            {filteredTemplates.length === 0 && (
                                <div className={classes.emptyState}>
                                    {i18n.t("templateMetaModal.empty", "Nenhum template encontrado")}
                                </div>
                            )}
                            {filteredTemplates.map((template, index) => {
                                const bodyText = template?.components?.map(c => c?.text).filter(Boolean).join(' ') || '';
                                return (
                                    <Box
                                        key={index}
                                        className={classes.templateCard}
                                        onClick={() => handleSelectTemplate(template)}
                                    >
                                        <Box className={classes.cardTopRow}>
                                            <Typography className={classes.templateName}>
                                                {template.shortcode}
                                            </Typography>
                                            <Typography variant="caption" color="textSecondary">
                                                {template.language}
                                            </Typography>
                                        </Box>
                                        {bodyText && (
                                            <Typography className={classes.templateBody}>
                                                {bodyText}
                                            </Typography>
                                        )}
                                        <Box className={classes.metaRow}>
                                            {template.category && (
                                                <Chip
                                                    label={template.category}
                                                    size="small"
                                                    className={classes.chip}
                                                    color="primary"
                                                    variant="outlined"
                                                />
                                            )}
                                        </Box>
                                    </Box>
                                );
                            })}
                        </Box>
                    </>
                )}

                {selectedTemplate && (
                    <Box className={classes.detailsBox}>
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                            <Typography variant="subtitle2" style={{ fontWeight: 600 }}>
                                {selectedTemplate.name || selectedTemplate.shortcode}
                            </Typography>
                            <Box display="flex" style={{ gap: 6 }}>
                                {selectedTemplate.category && (
                                    <Chip label={selectedTemplate.category} size="small" className={classes.chip} />
                                )}
                                <Chip label={selectedTemplate.language} size="small" className={classes.chip} variant="outlined" />
                            </Box>
                        </Box>

                        <div className={classes.detailsContent}>
                            {renderedContent || '—'}
                        </div>

                        {Object.keys(variables).map((componentType) => (
                            variables[componentType].length > 0 && (
                                <div key={componentType}>
                                    <Typography className={classes.sectionLabel}>
                                        {componentType}
                                    </Typography>
                                    {variables[componentType].map((variable, index) => (
                                        <TextField
                                            key={`${componentType}-${index}`}
                                            label={variable?.prompt}
                                            placeholder={`${i18n.t("templateMetaModal.fillValue")} ${variable?.prompt}`}
                                            value={variableValues[componentType]?.[index]?.value || ''}
                                            onChange={(e) => handleVariableChange(componentType, index, e.target.value, variable?.index || 0)}
                                            fullWidth
                                            size="small"
                                            variant="outlined"
                                            margin="dense"
                                            required
                                            error={variableValues[componentType]?.[index]?.value === ''}
                                        />
                                    ))}
                                </div>
                            )
                        ))}
                    </Box>
                )}
            </DialogContent>

            {selectedTemplate && (
                <DialogActions className={classes.actions}>
                    <Button onClick={handleBack} size="small">
                        {i18n.t("templateMetaModal.back")}
                    </Button>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={handleSendTemplate}
                        size="small"
                        startIcon={<SendIcon fontSize="small" />}
                        disableElevation
                    >
                        {i18n.t("templateMetaModal.sendTemplate")}
                    </Button>
                </DialogActions>
            )}
        </Dialog>
    );
};

export default TemplateModal;
