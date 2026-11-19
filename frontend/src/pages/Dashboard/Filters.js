import React, { useState } from "react";
import {
  Button,
  Grid,
  Paper,
  TextField,
} from "@material-ui/core";

import Title from "./Title";
import { i18n } from "../../translate/i18n";

const Filters = ({
  classes,
  setDateStartTicket,
  setDateEndTicket,
  dateStartTicket,
  dateEndTicket,
  setQueueTicket,
  queueTicket,
  fetchData,
  setUserTicket,
  userTicket,
}) => {
  const [dateStart, setDateStart] = useState(dateStartTicket);
  const [dateEnd, setDateEnd] = useState(dateEndTicket);

  return (
    <Grid item xs={12}>
      <Paper className={classes.customFixedHeightPaperLg} elevation={6}>
        <Title>{i18n.t("dashboard.filters")} </Title>
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6} md={5}>
            <TextField
              fullWidth
              name="dateStart"
              label={i18n.t("dashboard.date.initialDate")}
              InputLabelProps={{ shrink: true }}
              type="date"
              defaultValue={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={5}>
            <TextField
              fullWidth
              name="dateEnd"
              label={i18n.t("dashboard.date.finalDate")}
              InputLabelProps={{ shrink: true }}
              type="date"
              defaultValue={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Button
              fullWidth
              variant="contained"
              color="primary"
              onClick={() => {
                setDateStartTicket(dateStart);
                setDateEndTicket(dateEnd);
                if (setUserTicket) setUserTicket("");
                fetchData((prev) => !prev);
              }}
            >
              {i18n.t("dashboard.filter")}
            </Button>
          </Grid>
        </Grid>
      </Paper>
    </Grid>
  );
};

export default Filters;
