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
import { i18n } from '../../translate/i18n';
import { AuthContext } from "../../context/Auth/AuthContext";
import { useTheme } from '@material-ui/core';
import FilterList from "@material-ui/icons/FilterList";
import { makeStyles } from "@material-ui/core/styles";

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

export const ChartsDate = () => {
    const classes = useStyles();
    const theme = useTheme();
    const [initialDate, setInitialDate] = useState(new Date());
    const [finalDate, setFinalDate] = useState(new Date());
    const [ticketsData, setTicketsData] = useState({ data: [], count: 0 });
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
                display: (ctx) => ctx.dataset.data[ctx.dataIndex] > 0,
                anchor: 'end',
                align: 'end',
                offset: 4,
                color: theme.palette.text.primary,
                font: { size: 12, weight: "bold", family: "'Plus Jakarta Sans', sans-serif" },
            },
            tooltip: {
                backgroundColor: theme.palette.mode === "dark" ? "#1e293b" : "#fff",
                titleColor: theme.palette.text.primary,
                bodyColor: theme.palette.text.secondary,
                borderColor: theme.palette.divider,
                borderWidth: 1,
                cornerRadius: 10,
                padding: 12,
            },
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: {
                    color: theme.palette.text.secondary,
                    font: { size: 10, family: "'Plus Jakarta Sans', sans-serif" },
                    maxRotation: 60,
                    autoSkip: true,
                    maxTicksLimit: 12,
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
        labels: ticketsData?.data?.length > 0
            ? ticketsData.data.map((item) =>
                item.hasOwnProperty('horario')
                    ? `${item.horario}:00 - ${item.horario}:59`
                    : item.data
            )
            : [],
        datasets: [{
            data: ticketsData?.data?.length > 0 ? ticketsData.data.map((item) => item.total) : [],
            backgroundColor: (ctx) => {
                const chart = ctx.chart;
                const { ctx: canvasCtx, chartArea } = chart;
                if (!chartArea) return 'rgba(99, 102, 241, 0.8)';
                const gradient = canvasCtx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
                gradient.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
                gradient.addColorStop(1, 'rgba(99, 102, 241, 0.9)');
                return gradient;
            },
            borderRadius: 6,
            borderSkipped: false,
            maxBarThickness: 40,
        }],
    };

    const handleGetTicketsInformation = async () => {
        try {
            const { data } = await api.get(`/dashboard/ticketsDay?initialDate=${format(initialDate, 'yyyy-MM-dd')}&finalDate=${format(finalDate, 'yyyy-MM-dd')}&companyId=${companyId}`);
            setTicketsData(data);
        } catch (error) {
            toast.error(i18n.t("dashboard.fetchError"));
        }
    };

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
                        {i18n.t("dashboard.users.totalAttendances")}
                    </Typography>
                    <Typography style={{
                        fontSize: "0.8rem",
                        color: theme.palette.text.secondary,
                    }}>
                        {ticketsData?.count || 0} tickets
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
