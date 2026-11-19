import React, { useContext, useEffect, useState } from "react";
import { Grid } from "@material-ui/core";
import { InputField, SelectField } from "../../FormFields";
import { AuthContext } from "../../../context/Auth/AuthContext";
import { i18n } from "../../../translate/i18n";

export default function AddressForm(props) {

  const { user, socket } = useContext(AuthContext);

  const [billingName, setBillingName] = useState(user.company.name);
  const [addressZipCode, setAddressZipCode] = useState(user.company.document);
  const [addressStreet, setAddressStreet] = useState(user.company.addressStreet);
  const [addressState, setAddressState] = useState(user.company.addressState);
  const [addressCity, setAddressCity] = useState(user.company.addressCity);

  const {
    formField: {
      firstName,
      address1,
      city,
      state,
      zipcode,
      country,
    },
    setFieldValue
  } = props;
  useEffect(() => {
    setFieldValue("firstName", billingName)
    setFieldValue("zipcode", addressZipCode)
    setFieldValue("address2", addressStreet)
    setFieldValue("state", addressState)
    setFieldValue("city", addressCity)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <React.Fragment>
  
      <Grid container spacing={3}>

        <Grid item xs={6} sm={6}>
          <InputField name={firstName.name} label={i18n.t("checkout.fullName")} fullWidth
            value={billingName}
            onChange={(e) => {
              setBillingName(e.target.value)
              setFieldValue("firstName", e.target.value)
            }}
          />
        </Grid>

        <Grid item xs={6} sm={6}>
          <InputField
            name={zipcode.name}
            label={i18n.t("checkout.cpfCnpjLabel")}
            fullWidth
            value={addressZipCode}
            onChange={(e) => {
              setAddressZipCode(e.target.value)
              setFieldValue("zipcode", e.target.value)
            }}
          />
        </Grid>
        

      </Grid>
    </React.Fragment>
  );
}