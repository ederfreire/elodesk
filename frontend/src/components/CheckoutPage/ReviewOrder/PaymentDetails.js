import React, { useContext } from 'react';
import { Typography, Grid } from '@material-ui/core';
import { useTheme } from '@material-ui/core/styles';
import { AuthContext } from "../../../context/Auth/AuthContext";
import { formatCurrency } from '../../../helpers/currencyHelper';
import { i18n } from "../../../translate/i18n";

function PaymentDetails(props) {
  const { formValues } = props;
  const { firstName, zipcode, plan } = formValues;
  const { user } = useContext(AuthContext);
  const theme = useTheme();

  const newPlan = JSON.parse(plan);
  const { price } = newPlan;

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
        {i18n.t("checkout.paymentInfo")}
      </Typography>

      <div style={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 8, overflow: 'hidden' }}>
        <div style={rowStyle}>
          <span style={{ color: theme.palette.text.secondary, fontSize: 13 }}>{i18n.t("checkout.email")}</span>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{user.email}</span>
        </div>
        <div style={rowStyle}>
          <span style={{ color: theme.palette.text.secondary, fontSize: 13 }}>{i18n.t("checkout.name")}</span>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{firstName}</span>
        </div>
        <div style={rowStyle}>
          <span style={{ color: theme.palette.text.secondary, fontSize: 13 }}>{i18n.t("checkout.cpfCnpj")}</span>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{zipcode}</span>
        </div>
        <div style={{
          ...rowStyle,
          borderBottom: 'none',
          backgroundColor: theme.palette.primary.main + '0D',
        }}>
          <span style={{ color: theme.palette.primary.main, fontSize: 13, fontWeight: 700 }}>{i18n.t("checkout.total")}</span>
          <span style={{ fontWeight: 800, fontSize: 18, color: theme.palette.primary.main }}>{formatCurrency(price)}</span>
        </div>
      </div>
    </Grid>
  );
}

export default PaymentDetails;
