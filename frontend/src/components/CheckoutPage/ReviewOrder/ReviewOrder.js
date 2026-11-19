import React from 'react';
import { useFormikContext } from 'formik';
import { Typography, Grid, Divider } from '@material-ui/core';
import ShippingDetails from './ShippingDetails';
import PaymentDetails from './PaymentDetails';
import { i18n } from "../../../translate/i18n";

export default function ReviewOrder() {
  const { values: formValues } = useFormikContext();
  return (
    <div style={{ padding: '8px 0' }}>
      <Typography
        variant="h6"
        gutterBottom
        style={{
          fontWeight: 800,
          fontSize: 18,
          letterSpacing: '-0.3px',
          marginBottom: 16,
        }}
      >
        {i18n.t("checkout.subscriptionSummary")}
      </Typography>
      <Grid container spacing={3}>
        <ShippingDetails formValues={formValues} />
        <Grid item xs={12}>
          <Divider style={{ margin: '4px 0' }} />
        </Grid>
        <PaymentDetails formValues={formValues} />
      </Grid>
    </div>
  );
}