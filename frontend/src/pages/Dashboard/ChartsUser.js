import React, { useEffect, useState, useContext } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import brLocale from 'date-fns/locale/pt-BR';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { Button, TextField, Box } from "@material-ui/core";
import Typography from "@material-ui/core/Typography";
import api from '../../services/api';
import format from "date-fns/format";
import { toast } from 'react-toastify';
import { makeStyles, useTheme } from "@material-ui/core/styles";
import { i18n } from '../../translate/i18n';
import { AuthContext } from "../../context/Auth/AuthContext";
import FilterList from "@material-ui/icons/FilterList";

const useStyles = makeStyles((theme) => ({
    headerRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: theme.spacing(1),
        marginBottom: theme.spacing(2),
    },
    filtersRow: {
        display: "flex",
        alignItems: "center",
        gap: theme.spacing(1.5),
        flexWrap: "wrap",
    },
    filterBtn: {
        borderRadius: 10,
        textTransform: "none",
        fontWeight: 600,
        padding: "6px 20px",
        boxShadow: "none",
        "&:hover": { boxShadow: "0 4px 12px rgba(0,0,0,0.15)" },
    },
}));

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ChartDataLabels);

export const ChatsUser = () => {
    const classes = useStyles();
    const theme = useTheme();
    const [initialDate, setInitialDate] = useState(new Date());
    const [finalDate, setFinalDate] = useState(new Date());
    const [ticketsData, setTicketsData] = useState({ data: [] });
    const { user } = useContext(AuthContext);
    const companyId = user.companyId;

    useEffect(() => {
        if (companyId) handleGetTicketsInformation();
    }, [companyId]);

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: { display: false },
            datalabels: {
                display: true,
                anchor: 'end',
                align: 'end',
                offset: 4,
                color: theme.palette.text.primary,
                font: { size: 13, weight: "bold", family: "'Plus Jakarta Sans', sans-serif" },
                formatter: (value) => value || '',
            },
            tooltip: {
                backgroundColor: theme.palette.mode === "dark" ? "#1e293b" : "#fff",
                titleColor: theme.palette.text.primary,
                bodyColor: theme.palette.text.secondary,
                borderColor: theme.palette.divider,
                borderWidth: 1,
                cornerRadius: 10,
                padding: 12,
                displayColors: true,
                boxPadding: 4,
            },
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: {
                    color: theme.palette.text.secondary,
                    font: { size: 11, family: "'Plus Jakarta Sans', sans-serif" },
                    maxRotation: 45,
                },
                border: { display: false },
            },
            y: {
                grid: {
                    color: theme.palette.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                    drawBorder: false,
                },
                ticks: {
                    color: theme.palette.text.secondary,
                    font: { size: 11 },
                    stepSize: 1,
                },
                border: { display: false },
                beginAtZero: true,
            },
        },
    };

    const dataCharts = {
        labels: ticketsData?.data?.length > 0 ? ticketsData.data.map((item) => item.nome === '__no_agent__' ? (i18n.t("dashboard.noAgent") !== "dashboard.noAgent" ? i18n.t("dashboard.noAgent") : "Sem atendente") : item.nome) : [],
        datasets: [{
            data: ticketsData?.data?.length > 0 ? ticketsData.data.map((item) => item.quantidade) : [],
            backgroundColor: ticketsData?.data?.map((_, i) => {
                const colors = [
                    'rgba(59, 130, 246, 0.85)',
                    'rgba(16, 185, 129, 0.85)',
                    'rgba(139, 92, 246, 0.85)',
                    'rgba(245, 158, 11, 0.85)',
                    'rgba(239, 68, 68, 0.85)',
                    'rgba(20, 184, 166, 0.85)',
                    'rgba(236, 72, 153, 0.85)',
                    'rgba(99, 102, 241, 0.85)',
                ];
                return colors[i % colors.length];
            }),
            borderRadius: 8,
            borderSkipped: false,
            maxBarThickness: 50,
        }],
    };

    const handleGetTicketsInformation = async () => {
        try {
            const { data } = await api.get(`/dashboard/ticketsUsers?initialDate=${format(initialDate, 'yyyy-MM-dd')}&finalDate=${format(finalDate, 'yyyy-MM-dd')}&companyId=${companyId}`);
            setTicketsData(data);
        } catch (error) {
            toast.error(i18n.t("dashboard.fetchError"));
        }
    };

    const totalTickets = ticketsData?.data?.reduce((acc, item) => acc + (item.quantidade || 0), 0) || 0;

    return (
        <>
            <Box className={classes.headerRow}>
                <Box>
                    <Typography style={{
                        fontSize: "1rem",
                        fontWeight: 700,
                        color: theme.palette.text.primary,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}>
                        {i18n.t("dashboard.users.totalCallsUser")}
                    </Typography>
                    <Typography style={{
                        fontSize: "0.8rem",
                        color: theme.palette.text.secondary,
                    }}>
                        {totalTickets} tickets
                    </Typography>
                </Box>
                <Box className={classes.filtersRow}>
                    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={brLocale}>
                        <DatePicker
                            value={initialDate}
                            onChange={(v) => setInitialDate(v)}
                            label={i18n.t("dashboard.date.initialDate")}
                            renderInput={(params) => <TextField size="small" {...params} sx={{ width: '16ch' }} />}
                        />
                    </LocalizationProvider>
                    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={brLocale}>
                        <DatePicker
                            value={finalDate}
                            onChange={(v) => setFinalDate(v)}
                            label={i18n.t("dashboard.date.finalDate")}
                            renderInput={(params) => <TextField size="small" {...params} sx={{ width: '16ch' }} />}
                        />
                    </LocalizationProvider>
                    <Button
                        className={classes.filterBtn}
                        onClick={handleGetTicketsInformation}
                        variant='contained'
                        color="primary"
                        startIcon={<FilterList />}
                    >
                        {i18n.t("dashboard.filter")}
                    </Button>
                </Box>
            </Box>
            <Box style={{ height: 300, position: 'relative' }}>
                <Bar options={chartOptions} data={dataCharts} />
            </Box>
        </>
    );
};
