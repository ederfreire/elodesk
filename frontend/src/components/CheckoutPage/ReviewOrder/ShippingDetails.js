import React from 'react';
import { Typography, Grid } from '@material-ui/core';
import { useTheme } from '@material-ui/core/styles';
import { i18n } from "../../../translate/i18n";

function ShippingDetails(props) {
  const { formValues } = props;
  const { plan } = formValues;
  const theme = useTheme();

  const newPlan = JSON.parse(plan);
  const { users, connections, queues } = newPlan;

  const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: `1px solid ${theme.palette.divider}`,
  };

  return (
    <Grid item xs={12} sm={6}>
      <Typography
        variant="subtitle1"
        gutterBottom
        style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}
      >
        {i18n.t("checkout.planDetails")}
      </Typography>

      <div style={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 8, overflow: 'hidden' }}>
        <div style={rowStyle}>
          <span style={{ color: theme.palette.text.secondary, fontSize: 13 }}>{i18n.t("checkout.users")}</span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{users}</span>
        </div>
        <div style={rowStyle}>
          <span style={{ color: theme.palette.text.secondary, fontSize: 13 }}>{i18n.t("checkout.connection")}</span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{connections}</span>
        </div>
        <div style={rowStyle}>
          <span style={{ color: theme.palette.text.secondary, fontSize: 13 }}>{i18n.t("checkout.queues")}</span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{queues}</span>
        </div>
        <div style={{ ...rowStyle, borderBottom: 'none' }}>
          <span style={{ color: theme.palette.text.secondary, fontSize: 13 }}>{i18n.t("checkout.billing")}</span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{i18n.t("checkout.monthly")}</span>
        </div>
      </div>
    </Grid>
  );
}

export default ShippingDetails;
