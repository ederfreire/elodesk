import { makeStyles } from '@material-ui/core/styles';
export default makeStyles(theme => ({
  root: {
    width: '100%',
    maxWidth: 480,
    margin: '0 auto',
  },
  stepper: {
    padding: theme.spacing(2, 0, 3),
    backgroundColor: 'transparent',
    '& .MuiStepLabel-label': {
      fontSize: 12,
      fontWeight: 600,
      color: theme.palette.text.secondary,
    },
    '& .MuiStepLabel-label.MuiStepLabel-active': {
      color: theme.palette.text.primary,
      fontWeight: 700,
    },
    '& .MuiStepLabel-label.MuiStepLabel-completed': {
      color: theme.palette.primary.main,
    },
    '& .MuiStepIcon-root': {
      width: 28,
      height: 28,
      color: theme.palette.action.disabled,
    },
    '& .MuiStepIcon-root.MuiStepIcon-active': {
      color: theme.palette.primary.main,
    },
    '& .MuiStepIcon-root.MuiStepIcon-completed': {
      color: theme.palette.primary.main,
    },
    '& .MuiStepConnector-line': {
      borderColor: theme.palette.divider,
      borderTopWidth: 2,
    },
  },
  buttons: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(1.5),
    marginTop: theme.spacing(3),
    paddingTop: theme.spacing(2),
    borderTop: `1px solid ${theme.palette.divider}`,
  },
  button: {
    borderRadius: 8,
    padding: '10px 32px',
    fontWeight: 600,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    boxShadow: 'none',
    '&:hover': {
      boxShadow: 'none',
    },
  },
  wrapper: {
    position: 'relative',
  },
  buttonProgress: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -12,
    marginLeft: -12,
  },
}));
