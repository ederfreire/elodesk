import React, {useEffect, useRef, useState} from "react";
import {useDropzone} from "react-dropzone";
import makeStyles from "@material-ui/core/styles/makeStyles";
import {read, utils} from "xlsx";
import {
    Button,
    CircularProgress,
    FormControlLabel,
    FormGroup,
    MenuItem,
    Select,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
} from "@material-ui/core";
import api from "../../services/api";
import upload from "../../assets/upload.gif";
import {useHistory} from "react-router-dom";
import toastError from "../../errors/toastError";
import useWindowDimensions from "../../hooks/useWindowDimensions";
import {toast} from "react-toastify";
import { i18n } from "../../translate/i18n";
function WorksheetToDatagrid(ws) {
    /* create an array of arrays - mantendo formatação de células */
    const rows = utils.sheet_to_json(ws, {header: 1, defval: "", raw: false});

    /* create column array */
    const range = utils.decode_range(ws["!ref"] || "A1");
    const columns = Array.from({length: range.e.c + 1}, (_, i) => ({
        key: String(i), // RDG will access row["0"], row["1"], etc
        name: utils.encode_col(i), // the column labels will be A, B, etc
        //editor: textEditor // enable cell editing
    }));

    return {rows, columns}; // these can be fed to setRows / setColumns
}


const useStyles = makeStyles((theme) => ({
    xlsTable: {
        width: "100%",
    },
    tableContainer: {
        flex: 1,
        padding: 1,
        overflowX: "auto",
        overflowY: "scroll",
        ...theme.scrollbarStyles,
    },
    actions: {
        padding: 2,
        border: "1px solid #CCC",
        boxShadow: "1px 1px 5px #CCC",
        marginTop: 2,
        display: "flex",
        justifyContent: "center",
    },
    importOptions: {
        padding: 2,
        border: "1px solid #CCC",
        boxShadow: "1px 1px 5px #CCC",
        marginTop: 2,
        marginBottom: 2,
    },
    error: {
        color: "red",
        marginTop: 1,
    },
    buttonImport: {
        marginRight: 1,
    },
    select: {
        minWidth: 200,
    },
    backButtonContainer: {
        textAlign: "center",
        marginTop: 20,
    },
}));

const ContactImport = () => {
    const size = useWindowDimensions();

    const [rows, setRows] = useState(null);
    const [columns, setColumns] = useState(null);
    const classes = useStyles();
    const history = useHistory();
    const [contactFieldsAvailable, setContactFieldsAvailable] = useState([]);
    const [columnValue, setColumnValue] = useState({});
    const [selectedFields, setSelectedFields] = useState({}); // Para rastrear seleções únicas

    const [openingFile, setOpeningFile] = useState(false);
    const [selection, setSelection] = useState({});
    const [invalidFile, setInvalidFile] = useState(false);
    const [error, setError] = useState(null);
    const [countCreated, setCountCreated] = useState(0);
    const [countIgnored, setCountIgnored] = useState(0);
    const [uploading, setUploading] = useState(false);
    const [imported, setImported] = useState(false);
    const [selectedRows, setSelectedRows] = useState({});
    const [validateContact, setValidateContact] = useState(true);

    // Função para converter número serial do Excel para data JavaScript
    const excelSerialToDate = (serialNumber) => {
        if (!serialNumber || serialNumber < 0) return null;
        
        // Excel armazena datas desde 01/01/1900
        // Serial 1 = 01/01/1900
        // Serial 2 = 02/01/1900
        
        // Diferença em dias entre 01/01/1900 e 01/01/1970 (Unix epoch)
        const daysDifference = 25569;
        
        // Converter serial para Unix timestamp (millisegundos)
        const timestamp = (serialNumber - daysDifference) * 86400000;
        
        // Criar Date object
        const date = new Date(timestamp);
        
        // Verificar se é válido
        if (isNaN(date.getTime())) {
            console.warn('Invalid Excel serial:', serialNumber);
            return null;
        }
        
        return date;
    };

    // Função helper para detectar e corrigir formato de data MM/DD vs DD/MM
    const parseAndFixDateFormat = (dateStr) => {
        if (!dateStr || typeof dateStr !== 'string') return null;
        
        // Processar datas com formato MM/DD/YYYY (Excel americano) e inverter para DD/MM/YYYY
        if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                const first = parseInt(parts[0]);
                const second = parseInt(parts[1]);
                const year = parts[2];
                
                // Sempre assumir que é MM/DD/YYYY do Excel e converter para DD/MM/YYYY
                // Excel usa formato americano mesmo quando digitamos DD/MM
                
                // Retornar como DD/MM/YYYY (invertendo)
                return new Date(parseInt(year), first - 1, second);
            }
        }
        
        return new Date(dateStr);
    };
    const contactFields = [
        {id: "name", label: i18n.t("contactImport.fields.name"), required: true},
        {id: "number", label: i18n.t("contactImport.fields.number"), required: true},
        {id: "email", label: i18n.t("contactImport.fields.email"), required: false},
        {id: "birthDate", label: i18n.t("contactImport.fields.birthDate"), required: false},
        {id: "tags", label: i18n.t("contactImport.fields.tags"), required: false},
        {id: "carteira", label: i18n.t("contactImport.fields.wallet"), required: false},
    ];

    useEffect(() => {
        setContactFieldsAvailable(contactFields);
    }, []);

    const processImport = async () => {
        setUploading(true);
        setCountCreated(0);
        setCountIgnored(0);


        if (!selection.number) {
            toastError(i18n.t("contactImport.errors.noNumber"));
            setUploading(false);
            return;
        }

        if (!selection.name) {
            toastError(i18n.t("contactImport.errors.noName"));
            setUploading(false);
            return;
        }

        if (Object.keys(selectedRows).length === 0) {
            toastError(i18n.t("contactImport.errors.noSelection"));
            setUploading(false);
            return;
        }

        if (rows?.length > 1) {
            let importedCount = 0;
            let ignoredCount = 0;

            for (let index = 1; index < rows.length; index++) {
                if (selectedRows[index]) { // Importar apenas as linhas selecionadas
                    const item = rows[index];
                    const contactData = {};

                    for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
                        const column = columns[columnIndex];
                        const selectedField = columnValue[column.key];

                        if (selectedField) {
                            // Garantir que número seja sempre string
                            if (selectedField === 'number' && item[columnIndex]) {
                                contactData[selectedField] = String(item[columnIndex]).trim();
                            } else if (selectedField === 'birthDate' && item[columnIndex] !== null && item[columnIndex] !== undefined && item[columnIndex] !== '') {
                                // Processar data de nascimento
                                let dateValue = item[columnIndex];
                                let parsedDate = null;
                                
                                try {
                                    // Excel armazena datas como números seriais (dias desde 30/12/1899)
                                    if (typeof dateValue === 'number' && dateValue > 1 && dateValue < 100000) {
                                        // Converter número serial do Excel para JavaScript Date
                                        parsedDate = excelSerialToDate(dateValue);
                                    } else if (typeof dateValue === 'string') {
                                        // Processar strings de data
                                        // Usar função helper para detectar e corrigir formato
                                        parsedDate = parseAndFixDateFormat(dateValue);
                                    }
                                    
                                    // Validar e converter para formato YYYY-MM-DD
                                    if (parsedDate && !isNaN(parsedDate.getTime()) && parsedDate <= new Date()) {
                                        contactData[selectedField] = parsedDate.toISOString().split('T')[0];
                                    } else if (parsedDate) {
                                        console.warn('⚠️ Data de nascimento inválida ou futura:', dateValue);
                                    }
                                } catch (error) {
                                    console.warn('❌ Erro ao processar data de nascimento:', dateValue, error);
                                }
                            } else {
                                contactData[selectedField] = item[columnIndex];
                            }
                        }
                    }

                    // Verificar se os campos obrigatórios estão presentes
                    const missingRequiredFields = contactFields.some(field =>
                        field.required && (!contactData[field.id] || contactData[field.id] === '')
                    );

                    if (missingRequiredFields) {
                        ignoredCount++;
                        continue;
                    }

                    // Formatar número se necessário
                    if (contactData.number) {
                        // Remover caracteres não numéricos
                        contactData.number = contactData.number.toString().replace(/\D/g, '');
                    }

                    try {
                        const response = await api.post('/contactsImport', {
                            ...contactData,
                            validateContact: validateContact ? "true" : "false",
                        });


                        if (response.status === 200) {
                            importedCount++;
                        } else {
                            ignoredCount++;
                        }
                    } catch (error) {
                        console.error("Erro na importação:", error);
                        ignoredCount++;
                    }
                }
            }

            setCountCreated(importedCount);
            setCountIgnored(ignoredCount);
            setValidateContact(false);
            setSelectedRows({});
            setImported(true);
            setUploading(false);

            if (importedCount > 0) {
                if (ignoredCount === 0) {
                    toast.success(i18n.t("contactImport.results.successAll", { count: importedCount }));
                } else {
                    toast.warn(i18n.t("contactImport.results.successPartial", { created: importedCount, ignored: ignoredCount }));
                }
            } else {
                toast.error(i18n.t("contactImport.results.failed"));
            }
        }
    };

    const onChangeFile = (acceptedFiles) => {
        if (acceptedFiles.length === 0) return;
        setOpeningFile(true);
        setInvalidFile(false);
        setImported(false);
        setUploading(false);
        const file = acceptedFiles[0];
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const data = e.target.result;
                const wb = read(data);
                const ws = wb.Sheets[wb.SheetNames[0]];
                const {rows, columns} = WorksheetToDatagrid(ws);
                setRows(rows);
                setColumns(columns);
                setOpeningFile(false);
            } catch (e) {
                console.error(e);
                setInvalidFile(true);
                setOpeningFile(false);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleSelectChange = (event) => {
        const newValue = event.target.value;
        const columnKey = event.target.name;

        if (columnValue[columnKey]) {
            const oldValue = columnValue[columnKey];
            setSelectedFields((prevSelectedFields) => {
                const newSelectedFields = {...prevSelectedFields};
                delete newSelectedFields[oldValue];
                return newSelectedFields;
            });
        }

        if (newValue === "") {
            setColumnValue((prevColumnValue) => {
                const newColumnValue = {...prevColumnValue};
                delete newColumnValue[columnKey];
                return newColumnValue;
            });
            setSelection((prevSelection) => {
                const newSelection = {...prevSelection};
                Object.keys(newSelection).forEach((key) => {
                    if (newSelection[key] === columnKey) {
                        delete newSelection[key];
                    }
                });
                return newSelection;
            });
            return;
        }

        if (selectedFields[newValue]) {
            toastError(i18n.t("contactImport.errors.fieldAlreadySelected", { field: newValue }));
            return;
        }

        setSelection((selection) => ({...selection, [newValue]: columnKey}));
        setSelectedFields((prevSelectedFields) => ({...prevSelectedFields, [newValue]: columnKey}));
        setColumnValue((columnValue) => ({...columnValue, [columnKey]: newValue}));
    };


    const renderSelectbox = (column) => {
        return (
            <Select value={columnValue[column.key]} name={column.key} onChange={handleSelectChange}>
                <MenuItem value="">&nbsp;</MenuItem>
                {contactFieldsAvailable.map((contactField) => (
                    <MenuItem value={contactField.id}>{contactField.label}</MenuItem>
                ))}
            </Select>
        );
    };

    const renderXls = () => {
        return (
            <TableContainer className={classes.tableContainer} style={{height: size.height * 0.75}}>
                <Table stickyHeader>
                    <TableHead key={columns.length}>
                        <TableRow>
                            <TableCell>
                                <input
                                    type="checkbox"
                                    checked={Object.keys(selectedRows).length === rows.length - 1} // Se todas as linhas, exceto a primeira, estiverem marcadas
                                    onChange={(event) => {
                                        const isChecked = event.target.checked;
                                        const newSelectedRows = {};
                                        if (isChecked) {
                                            // Marcar todas as linhas, exceto a primeira
                                            for (let i = 1; i < rows.length; i++) {
                                                newSelectedRows[i] = true;
                                            }
                                        }
                                        setSelectedRows(newSelectedRows);
                                    }}
                                />
                            </TableCell>
                            {columns.map((column) => (
                                <TableCell key={column.key}>{column.name}</TableCell>
                            ))}
                        </TableRow>
                        <TableRow>
                            <TableCell></TableCell>
                            {columns.map((column) => (
                                <TableCell key={column.key}>{renderSelectbox(column)}</TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row, rowIndex) => (
                            <TableRow key={rowIndex}>
                                {rowIndex !== 0 && (
                                    <TableCell>
                                        <input
                                            type="checkbox"
                                            checked={!!selectedRows[rowIndex]}
                                            onChange={() => {
                                                setSelectedRows((prevSelectedRows) => ({
                                                    ...prevSelectedRows,
                                                    [rowIndex]: !prevSelectedRows[rowIndex],
                                                }));
                                            }}
                                        />
                                    </TableCell>
                                )}
                                {rowIndex !== 0 && (
                                    row.map((column, columnIndex) => {
                                        // Formatar data se a coluna é birthDate
                                        let cellValue = column;
                                        
                                        // Verificar se esta coluna foi mapeada como birthDate
                                        if (columnValue[columnIndex] === 'birthDate' && column) {
                                            try {
                                                // Se for número (Excel serial), converter
                                                if (typeof column === 'number' && column > 1 && column < 100000) {
                                                    const convertedDate = excelSerialToDate(column);
                                                    if (convertedDate && !isNaN(convertedDate.getTime())) {
                                                        // Formatar como DD/MM/YYYY
                                                        const day = String(convertedDate.getDate()).padStart(2, '0');
                                                        const month = String(convertedDate.getMonth() + 1).padStart(2, '0');
                                                        const year = convertedDate.getFullYear();
                                                        cellValue = `${day}/${month}/${year}`;
                                                    }
                                                } 
                                                // Se for string, formatar corretamente
                                                else if (typeof column === 'string' && column.includes('/')) {
                                                    const parts = column.split('/');
                                                    if (parts.length === 3) {
                                                        let first = parseInt(parts[0]);
                                                        let second = parseInt(parts[1]);
                                                        let third = parts[2];
                                                        
                                                        // Se first > 12, definitivamente é DD/MM
                                                        if (first > 12) {
                                                            // Já está DD/MM/YYYY - apenas formatar
                                                            cellValue = `${String(first).padStart(2, '0')}/${String(second).padStart(2, '0')}/${third.padStart(4, '0')}`;
                                                        } else {
                                                            // Ambigüidade: pode ser MM/DD ou DD/MM
                                                            // Converter para DD/MM/YYYY assumindo formato americano (MM/DD)
                                                            // e invertendo para brasileiro (DD/MM)
                                                            const year = third.length === 2 ? '19' + third : third.padStart(4, '0');
                                                            // Inverter: MM/DD -> DD/MM
                                                            cellValue = `${String(second).padStart(2, '0')}/${String(first).padStart(2, '0')}/${year}`;
                                                        }
                                                    }
                                                }
                                            } catch (error) {
                                                console.warn('Erro ao formatar data para visualização:', error);
                                            }
                                        }
                                        
                                        return <TableCell key={columnIndex}>{cellValue}</TableCell>;
                                    })
                                )}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        );
    };


    const handleCloseImport = async () => {
        try {
            history.push("/contacts");
        } catch (err) {
            toastError(err);
        }
    };

    const renderContent = () => {
        return (
            <div>
                <div className={classes.importOptions}>
                    <FormGroup row style={{width: '100%', display: 'flex', justifyContent: 'space-around'}}>
                        <FormControlLabel
                            control={
                                <Switch checked={validateContact} onChange={(event) => setValidateContact(event.target.checked)} color="primary"/>
                            }
                            label={i18n.t("contactImport.validateSwitch")}
                        />
                    </FormGroup>
                </div>
                {renderXls()}
                <div className={classes.actions}>
                    {uploading && <div>{i18n.t("contactImport.uploading")}</div>}
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={uploading}
                        className={classes.buttonImport}
                        onClick={() => processImport()}
                    >
                        {i18n.t("contactImport.importButton")}
                    </Button>
                    <Button
                        variant="contained"
                        color="secondary"
                        disabled={uploading}
                        onClick={() => {
                            setRows(null);
                            setColumns(null);
                        }}
                    >
                        {i18n.t("contactImport.cancel")}
                    </Button>
                    {error && <div className={classes.error}>{error}</div>}
                </div>
            </div>
        );
    };

    const {getRootProps, getInputProps} = useDropzone({
        onDrop: onChangeFile,
        maxFiles: 1,
        accept: {
            'application/vnd.ms-excel': ['.xls'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'text/csv': ['.csv'],
            'text/plain': ['.txt'],
        }
    });

    return (
        <div style={{alignContent: "center"}}>
            {imported && (
                <div style={{
                    padding: '15px',
                    margin: '15px auto',
                    maxWidth: '500px',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    backgroundColor: '#f9f9f9'
                }}>
                    <h3 style={{textAlign: 'center'}}>{i18n.t("contactImport.results.title")}</h3>
                    <ul style={{listStyle: 'none', padding: '10px'}}>
                        <li style={{
                            padding: '8px',
                            marginBottom: '5px',
                            backgroundColor: countCreated > 0 ? '#d4edda' : '#f8f9fa',
                            borderRadius: '4px',
                            color: countCreated > 0 ? '#155724' : '#6c757d'
                        }}>
                            {i18n.t("contactImport.results.created", { count: countCreated })}
                        </li>
                        <li style={{
                            padding: '8px',
                            backgroundColor: countIgnored > 0 ? '#fff3cd' : '#f8f9fa',
                            borderRadius: '4px',
                            color: countIgnored > 0 ? '#856404' : '#6c757d'
                        }}>
                            {i18n.t("contactImport.results.ignored", { count: countIgnored })}
                        </li>
                    </ul>
                    <div style={{textAlign: 'center', marginTop: '10px'}}>
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={() => {
                                setImported(false);
                                setRows(null);
                                setColumns(null);
                                setColumnValue({});
                                setSelectedFields({});
                            }}
                        >
                            {i18n.t("contactImport.results.importMore")}
                        </Button>
                    </div>
                </div>
            )}
            {openingFile && (
                <div style={{
                    textAlign: 'center',
                    padding: '20px',
                    margin: '20px auto',
                    maxWidth: '500px'
                }}>
                    <CircularProgress/>
                    <p>{i18n.t("contactImport.processing")}</p>
                </div>
            )}
            {invalidFile && (
                <div style={{
                    padding: '15px',
                    margin: '15px auto',
                    maxWidth: '500px',
                    border: '1px solid #f5c6cb',
                    borderRadius: '8px',
                    backgroundColor: '#f8d7da',
                    color: '#721c24',
                    textAlign: 'center'
                }}>
                     <h3>{i18n.t("contactImport.invalidFile")}</h3>
                     <p>{i18n.t("contactImport.invalidFileDesc")}</p>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={() => {
                            setInvalidFile(false);
                            setRows(null);
                            setColumns(null);
                        }}
                        style={{marginTop: '10px'}}
                    >
                        {i18n.t("contactImport.tryAgain")}
                    </Button>
                </div>
            )}
            {!imported && !invalidFile && rows && columns ? renderContent() : (
                !imported && !invalidFile && !openingFile && (
                    <>
                        <div
                            {...getRootProps()}
                            className="uploaderDrop"
                            style={{
                                borderRadius: 20,
                                maxWidth: 500,
                                margin: "20px auto",
                                border: "3px dotted #ddd",
                                padding: 20,
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                                flexDirection: "column",
                                cursor: "pointer",
                                transition: "all 0.3s ease",
                                backgroundColor: "#f9f9f9",
                                "&:hover": {
                                    backgroundColor: "#f0f0f0",
                                    borderColor: "#aaa",
                                }
                            }}
                        >
                            <img src={upload} height={200} alt="Upload"/>
                             <h5>{i18n.t("contactImport.dropzoneTitle")}</h5>
                             <p style={{color: "#e74c3c", fontWeight: "bold", textAlign: "center"}}>
                                 {i18n.t("contactImport.dropzoneFormats")}
                             </p>
                             <p style={{textAlign: "center", fontSize: "14px", marginTop: "10px", color: "#666"}}>
                                 {i18n.t("contactImport.dropzoneHelp")}
                            </p>
                        </div>

                        <input {...getInputProps()} />

                        <div className={classes.backButtonContainer}>
                             <Button variant="contained" color="secondary" disabled={uploading} onClick={handleCloseImport}>
                                 {i18n.t("contactImport.back")}
                            </Button>
                        </div>
                    </>
                )
            )}
        </div>
    );
};

export default ContactImport;
