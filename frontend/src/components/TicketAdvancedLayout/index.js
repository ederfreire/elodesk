import { styled } from '@material-ui/core/styles';
import Paper from '@material-ui/core/Paper';

const TicketAdvancedLayout = styled(Paper)(({ theme, hasTicket }) => ({
    height: `calc(100% - 48px)`,
    display: "grid",
    gridTemplateRows: "44px 1fr",
    overflow: "hidden",
    "@media (max-width: 960px)": {
        height: "calc(100vh - 56px)",
        height: "calc(100dvh - 56px)",
        gridTemplateRows: "1fr",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        maxHeight: "calc(100dvh - 56px)",
    },
}))

export default TicketAdvancedLayout;
