import React from "react";

import { makeStyles } from "@material-ui/core/styles";

const useStyles = makeStyles(theme => ({
	contactsHeader: {
		display: "flex",
		alignItems: "center",
		padding: "8px 6px 6px 6px",
		// Espaçamento entre título, botões e campos do cabeçalho. Sem isto, o
		// botão encostava no título em várias telas (Agentes Comerciais,
		// Cursos, etc.). Como é no MainHeader, vale para todas as páginas.
		gap: theme.spacing(2),
		// Em telas estreitas os itens quebram em vez de espremer/estourar.
		flexWrap: "wrap",
	},
}));

const MainHeader = ({ children }) => {
	const classes = useStyles();

	return <div className={classes.contactsHeader}>{children}</div>;
};

export default MainHeader;
