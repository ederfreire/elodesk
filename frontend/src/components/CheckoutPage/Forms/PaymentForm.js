import React, { useEffect, useContext } from 'react';
import Button from '@material-ui/core/Button';
import Card from '@material-ui/core/Card';
import CardActions from '@material-ui/core/CardActions';
import CardContent from '@material-ui/core/CardContent';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import { makeStyles } from '@material-ui/core/styles';
import IconButton from '@material-ui/core/IconButton';
import MinimizeIcon from '@material-ui/icons/Minimize';
import AddIcon from '@material-ui/icons/Add';
import usePlans from "../../../hooks/usePlans";
import { formatCurrency } from '../../../helpers/currencyHelper';
import { AuthContext } from "../../../context/Auth/AuthContext";
import { i18n } from "../../../translate/i18n";

const useStyles = makeStyles((theme) => ({
  planCard: {
    borderRadius: 12,
    border: `1px solid ${theme.palette.divider}`,
    boxShadow: 'none',
    overflow: 'hidden',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    '&:hover': {
      borderColor: theme.palette.primary.main,
      boxShadow: `0 0 0 1px ${theme.palette.primary.main}`,
    },
  },
  cardHeaderBar: {
    height: 3,
    backgroundColor: theme.palette.primary.main,
  },
  cardContent: {
    padding: theme.spacing(3),
    textAlign: 'center',
  },
  planName: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: theme.spacing(1.5),
    color: theme.palette.text.primary,
  },
  priceContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'baseline',
    marginBottom: theme.spacing(2),
    gap: 4,
  },
  price: {
    fontSize: 32,
    fontWeight: 800,
    color: theme.palette.primary.main,
    lineHeight: 1.1,
  },
  perMonth: {
    fontSize: 13,
    color: theme.palette.text.secondary,
    fontWeight: 500,
  },
  featureItem: {
    fontSize: 13,
    color: theme.palette.text.secondary,
    padding: '3px 0',
    fontWeight: 500,
  },
  selectButton: {
    borderRadius: 8,
    padding: '10px 0',
    fontWeight: 700,
    fontSize: 13,
    textTransform: 'uppercase',
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText || '#fff',
    border: 'none',
    letterSpacing: '0.5px',
    '&:hover': {
      backgroundColor: theme.palette.primary.dark,
    },
  },
  customCard: {
    display: "flex",
    marginTop: 12,
    alignItems: "center",
    flexDirection: "column",
    gap: 4,
  },
  custom: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  counterBtn: {
    width: 30,
    height: 30,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 6,
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
}));

export default function Pricing(props) {
  const {
    setFieldValue,
    setActiveStep,
    activeStep,
  } = props;

  const classes = useStyles();
  const [usersPlans, setUsersPlans] = React.useState(3);
  const [connectionsPlans, setConnectionsPlans] = React.useState(3);
  const [storagePlans, setStoragePlans] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const { user } = useContext(AuthContext);

  const { getPlanCompany } = usePlans();

  useEffect(() => {
    async function fetchData() {
      await loadPlans();
    }
    fetchData();
  }, []);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const companyId = user.companyId;
      const _planList = await getPlanCompany(undefined, companyId);
      const planList = _planList.plan;

      const plans = [];
      plans.push({
        title: planList.name,
        planId: planList.id,
        price: planList.amount,
        description: [
          `${planList.users} ${i18n.t("checkout.users")}`,
          `${planList.connections} ${i18n.t("checkout.connection")}`,
          `${planList.queues} ${i18n.t("checkout.queues")}`
        ],
        users: planList.users,
        connections: planList.connections,
        queues: planList.queues,
        buttonText: i18n.t("checkout.select"),
        buttonVariant: 'outlined',
      });

      setStoragePlans(plans);
    } catch (e) {
      // silent
    }
    setLoading(false);
  };

  const [customValuePlans, setCustomValuePlans] = React.useState(49.00);

  const handleChangeAdd = (event, newValue) => {
    if (newValue < 3) return;
    setUsersPlans(newValue);
    setCustomValuePlans(customValuePlans + 11.00);
  };

  const handleChangeMin = (event, newValue) => {
    if (newValue < 3) return;
    setUsersPlans(newValue);
    setCustomValuePlans(customValuePlans - 11);
  };

  const handleChangeConnectionsAdd = (event, newValue) => {
    if (newValue < 3) return;
    setConnectionsPlans(newValue);
    setCustomValuePlans(customValuePlans + 20.00);
  };

  const handleChangeConnectionsMin = (event, newValue) => {
    if (newValue < 3) return;
    setConnectionsPlans(newValue);
    setCustomValuePlans(customValuePlans - 20);
  };

  return (
    <Grid container spacing={3} justifyContent="center">
      {storagePlans?.map((tier) => (
        <Grid item key={tier.title} xs={12} sm={8} md={6}>
          <Card className={classes.planCard}>
            <div className={classes.cardHeaderBar} />
            <CardContent className={classes.cardContent}>
              <Typography className={classes.planName}>
                {tier.title}
              </Typography>

              <div className={classes.priceContainer}>
                <Typography className={classes.price}>
                  {tier.custom ? formatCurrency(customValuePlans) : formatCurrency(tier.price)}
                </Typography>
                <Typography className={classes.perMonth}>
                  {i18n.t("checkout.perMonth")}
                </Typography>
              </div>

              {tier.description.map((line) => (
                <Typography key={line} className={classes.featureItem}>
                  {line}
                </Typography>
              ))}

              {tier.custom && (
                <div className={classes.customCard}>
                  <div className={classes.custom}>
                    <IconButton className={classes.counterBtn} size="small"
                      onClick={e => handleChangeMin(e, usersPlans - 1)}>
                      <MinimizeIcon fontSize="small" />
                    </IconButton>
                    <Typography variant="body2" style={{ fontWeight: 600, minWidth: 80 }}>
                      {usersPlans} {i18n.t("checkout.users")}
                    </Typography>
                    <IconButton className={classes.counterBtn} size="small"
                      onClick={e => handleChangeAdd(e, usersPlans + 1)}>
                      <AddIcon fontSize="small" />
                    </IconButton>
                  </div>

                  <div className={classes.custom}>
                    <IconButton className={classes.counterBtn} size="small"
                      onClick={(e) => handleChangeConnectionsMin(e, connectionsPlans - 1)}>
                      <MinimizeIcon fontSize="small" />
                    </IconButton>
                    <Typography variant="body2" style={{ fontWeight: 600, minWidth: 80 }}>
                      {connectionsPlans} {i18n.t("checkout.connection")}
                    </Typography>
                    <IconButton className={classes.counterBtn} size="small"
                      onClick={(e) => handleChangeConnectionsAdd(e, connectionsPlans + 1)}>
                      <AddIcon fontSize="small" />
                    </IconButton>
                  </div>
                </div>
              )}
            </CardContent>

            <CardActions style={{ padding: '0 20px 20px' }}>
              <Button
                fullWidth
                className={classes.selectButton}
                onClick={() => {
                  if (tier.custom) {
                    setFieldValue("plan", JSON.stringify({
                      users: usersPlans,
                      connections: connectionsPlans,
                      price: customValuePlans
                    }));
                  } else {
                    setFieldValue("plan", JSON.stringify(tier));
                  }
                  setActiveStep(activeStep + 1);
                }}
              >
                {tier.buttonText}
              </Button>
            </CardActions>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}
