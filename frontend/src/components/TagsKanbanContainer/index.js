import { Chip, Select, MenuItem, InputLabel, FormControl, Dialog, DialogTitle, DialogContent, List, ListItem, ListItemText, useMediaQuery, Portal } from "@material-ui/core";
import { useTheme } from "@material-ui/core/styles";
import React, { useEffect, useRef, useState } from "react";

import toastError from "../../errors/toastError";
import api from "../../services/api";

import { makeStyles } from "@material-ui/core/styles";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles((theme) => ({
    menuListItem: {
        paddingTop: 0,
        paddingBottom: 0,
        border: "none",
    },
    menuItem: {
        maxHeight: 30,
    },

    chips: {
        display: "flex",
        flexWrap: "wrap",
    },
    chip: {
        margin: 2,
    },
}));
export function TagsKanbanContainer({ ticket }) {
    const classes = useStyles();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [tags, setTags] = useState([]);
    const [selected, setSelected] = useState(""); // Alterado de null para ""
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogPosition, setDialogPosition] = useState({ top: 0, left: 0, width: 0 });
    const fieldRef = useRef(null);
    
    

    useEffect(() => {
        let isMounted = true;
        loadTags(isMounted).then(() => {
            if (ticket.tags && ticket.tags.length > 0) {
                setSelected(ticket.tags[0].id); // Alterado para pegar o ID da primeira tag, se existir
            }
        });

        return () => {
            isMounted = false;
        };
    }, [ticket.tags]);

    const loadTags = async (isMounted) => {
        try {
            
            const { data } = await api.get(`/tags/list`, { params: { kanban: 1 } });
            
            if (isMounted) {
                setTags(data || []);
                
            }
        } catch (err) {
            console.error('[TagsKanbanContainer] Erro ao carregar tags:', err);
            toastError(err);
        }
    }

    const onChange = async (e) => {
        const value = e.target.value;
        
        setSelected(value); // Atualizar estado imediatamente para feedback visual
        
        try {
            if (ticket.tags && ticket.tags.length > 0) {
                await api.delete(`/ticket-tags/${ticket.id}`);
            }
            if (value && value !== "" && value !== null) {
                await api.put(`/ticket-tags/${ticket.id}/${value}`);
            }
        } catch (err) {
            toastError(err);
            // Reverter seleção em caso de erro
            if (ticket.tags && ticket.tags.length > 0) {
                setSelected(ticket.tags[0].id);
            } else {
                setSelected("");
            }
        }
    }
    
    const handleSelectClick = (e) => {
        
        e.stopPropagation();
    }

    const renderSelectedValue = () => {
        const selectedTag = tags.find(tag => tag.id === selected);
        if (!selectedTag) return null;

        return (
            <Chip
                style={{
                    backgroundColor: selectedTag.color,
                    color: "#FFF",
                    marginRight: 1,
                    padding: 1,
                    fontWeight: 'bold',
                    paddingLeft: 5,
                    paddingRight: 5,
                    borderRadius: 3,
                    fontSize: "0.8em",
                    whiteSpace: "nowrap"
                }}
                label={selectedTag.name}
                size="small"
            />
        );
    };

    
    
    const handleOpenDialog = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        if (!dialogOpen && fieldRef.current) {
            // Calcular posição do campo usando getBoundingClientRect (já considera scroll)
            const rect = fieldRef.current.getBoundingClientRect();
            
            setDialogPosition({
                top: rect.bottom + 4, // 4px de espaçamento abaixo do campo
                left: rect.left,
                width: rect.width
            });
            setDialogOpen(true);
        }
    };
    
    const handleCloseDialog = () => {
        
        setDialogOpen(false);
    };
    
    const handleSelectTag = (tagId) => {
        
        const fakeEvent = { target: { value: tagId } };
        onChange(fakeEvent);
        handleCloseDialog();
    };
    
    // No mobile, usar Dialog em vez de Select
    if (isMobile) {
        const selectedTag = tags.find(tag => tag.id === selected);
        return (
            <>
                <FormControl fullWidth margin="dense" variant="outlined" style={{ marginBottom: 8, zIndex: 10, position: 'relative' }}>
                    <InputLabel id="tag-kanban-id" shrink={true}>{i18n.t("tagsKanbanContainer.label")}</InputLabel>
                    <div
                        ref={fieldRef}
                        onClick={(e) => {
                            
                            e.preventDefault();
                            e.stopPropagation();
                            if (!dialogOpen) {
                                handleOpenDialog(e);
                            }
                        }}
                        onTouchStart={(e) => {
                            e.stopPropagation();
                        }}
                        style={{
                            border: '1px solid rgba(0, 0, 0, 0.23)',
                            borderRadius: 4,
                            padding: '16.5px 14px',
                            minHeight: 56,
                            cursor: 'pointer',
                            backgroundColor: 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            pointerEvents: 'auto',
                            zIndex: 10,
                            position: 'relative'
                        }}
                    >
                        <div style={{ flex: 1 }}>
                            {selectedTag ? (
                                <Chip
                                    style={{
                                        backgroundColor: selectedTag.color,
                                        color: "#FFF",
                                        fontWeight: 'bold',
                                        fontSize: "0.875rem",
                                    }}
                                    label={selectedTag.name}
                                    size="small"
                                />
                            ) : (
                                <span style={{ color: 'rgba(0, 0, 0, 0.54)' }}>{i18n.t("tagsKanbanContainer.selectStep")}</span>
                            )}
                        </div>
                        <span style={{ color: 'rgba(0, 0, 0, 0.54)' }}>▼</span>
                    </div>
                </FormControl>
                
                <Portal container={document.body}>
                    <Dialog 
                        open={dialogOpen} 
                        onClose={(event, reason) => {
                            
                            if (reason === 'backdropClick' || reason === 'escapeKeyDown') {
                                handleCloseDialog();
                            }
                        }}
                        fullWidth={isMobile}
                        maxWidth={isMobile ? false : "sm"}
                        disableEnforceFocus={true}
                        disableAutoFocus={true}
                        disableRestoreFocus={true}
                        PaperProps={{
                            style: {
                                zIndex: 10002,
                                position: 'fixed',
                                margin: 0,
                                maxHeight: isMobile ? '50vh' : '60vh',
                                width: isMobile ? `${Math.min(dialogPosition.width || 300, window.innerWidth - 16)}px` : `${Math.min(dialogPosition.width || 300, 400)}px`,
                                maxWidth: isMobile ? 'calc(100% - 16px)' : '400px',
                                top: `${dialogPosition.top}px`,
                                left: isMobile ? `${Math.max(8, Math.min(dialogPosition.left, window.innerWidth - (dialogPosition.width || 300) - 8))}px` : `${dialogPosition.left}px`,
                                transform: 'none',
                                backgroundColor: theme.palette.background.paper,
                                boxShadow: theme.shadows[8],
                                borderRadius: '4px',
                                marginTop: '4px'
                            }
                        }}
                        BackdropProps={{
                            style: {
                                zIndex: 10001,
                                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                                position: 'fixed'
                            },
                            onClick: (e) => {
                                
                                e.stopPropagation();
                                handleCloseDialog();
                            }
                        }}
                        aria-labelledby="kanban-dialog-title"
                        hideBackdrop={false}
                        style={{
                            zIndex: 10002,
                            position: 'fixed'
                        }}
                    >
                    <DialogTitle id="kanban-dialog-title" style={{ padding: isMobile ? '12px 16px' : '16px 24px', fontSize: isMobile ? '1rem' : '1.25rem' }}>
                        {i18n.t("tagsKanbanContainer.selectKanbanStep")}
                    </DialogTitle>
                    <DialogContent style={{ padding: 0, maxHeight: isMobile ? 'calc(60vh - 60px)' : 'calc(80vh - 100px)', overflow: 'auto' }}>
                        <List style={{ padding: 0 }}>
                            <ListItem 
                                button 
                                onClick={(e) => {
                                    
                                    e.stopPropagation();
                                    handleSelectTag("");
                                }}
                                selected={selected === ""}
                                style={{ 
                                    padding: isMobile ? '8px 16px' : '12px 24px',
                                    minHeight: isMobile ? '40px' : '48px'
                                }}
                            >
                                <ListItemText 
                                    primary={i18n.t("tagsKanbanContainer.none")} 
                                    primaryTypographyProps={{
                                        style: { fontSize: isMobile ? '0.9rem' : '1rem' }
                                    }}
                                />
                            </ListItem>
                            {tags.map(tag => (
                                <ListItem 
                                    key={tag.id} 
                                    button 
                                    onClick={(e) => {
                                        
                                        e.stopPropagation();
                                        handleSelectTag(tag.id);
                                    }}
                                    selected={selected === tag.id}
                                    style={{ 
                                        padding: isMobile ? '8px 16px' : '12px 24px',
                                        minHeight: isMobile ? '40px' : '48px',
                                        backgroundColor: selected === tag.id ? 'rgba(0, 0, 0, 0.08)' : 'transparent'
                                    }}
                                >
                                    <ListItemText 
                                        primary={tag.name}
                                        primaryTypographyProps={{
                                            style: { 
                                                fontSize: isMobile ? '0.9rem' : '1rem',
                                                color: selected === tag.id ? tag.color : 'inherit',
                                                fontWeight: selected === tag.id ? 600 : 400
                                            }
                                        }}
                                    />
                                </ListItem>
                            ))}
                        </List>
                    </DialogContent>
                    </Dialog>
                </Portal>
            </>
        );
    }
    
    // No desktop, usar Select normal
    return (
        <>
            <FormControl fullWidth margin="dense" variant="outlined" style={{ marginBottom: 8, zIndex: 10, position: 'relative' }}>
                <InputLabel id="tag-kanban-id" shrink={true}>{i18n.t("tagsKanbanContainer.label")}</InputLabel>
                <Select
                    labelWidth={100}
                    value={selected || ""}
                    labelId="tag-kanban-id"
                    label={i18n.t("tagsKanbanContainer.label")}
                    onChange={onChange}
                    onClick={(e) => {
                        
                        handleSelectClick(e);
                    }}
                    onOpen={(e) => {
                        
                        e.stopPropagation();
                    }}
                    onClose={() => {
                        
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
                        PaperProps: {
                            style: {
                                maxHeight: 300,
                                zIndex: 10001,
                                position: "fixed",
                                marginTop: 4,
                            },
                            onClick: (e) => {
                                
                                e.stopPropagation();
                            }
                        },
                        disablePortal: false,
                        disableScrollLock: true,
                        keepMounted: false,
                        disableAutoFocusItem: true,
                        transitionDuration: 0,
                    }}
                    renderValue={renderSelectedValue}
                    style={{ zIndex: 10, position: 'relative' }}
                    displayEmpty
                >
                    <MenuItem value="">
                        <em>{i18n.t("tagsKanbanContainer.selectStep")}</em>
                    </MenuItem>
                    {tags.length === 0 ? (
                        <MenuItem disabled>{i18n.t("tagsKanbanContainer.loadingSteps")}</MenuItem>
                    ) : (
                        tags.map(tag => (
                            <MenuItem 
                                key={tag.id} 
                                value={tag.id}
                                onClick={(e) => {
                                    e.stopPropagation();
                                }}
                            >
                                {tag.name}
                            </MenuItem>
                        ))
                    )}
                </Select>
            </FormControl>
        </>
    )
}
