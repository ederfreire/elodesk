import React from "react";

import { makeStyles } from "@material-ui/core/styles";

const useStyles = makeStyles(theme => ({
	MainHeaderButtonsWrapper: {
		flex: "1 1 auto",
		marginLeft: "auto",
		display: "flex",
		flexWrap: "wrap",
		alignItems: "center",
		justifyContent: "flex-end",
		minWidth: 0,
		gap: theme.spacing(1),
		"& > *": {
			margin: 0,
		},
	},
}));

const MainHeaderButtonsWrapper = ({ children }) => {
	const classes = useStyles();

	return <div className={classes.MainHeaderButtonsWrapper}>{children}</div>;
};

export default MainHeaderButtonsWrapper;
