import React, { useState, useEffect, createContext } from "react";
import { useHistory } from "react-router-dom";

const TicketsContext = createContext();

const TicketsContextProvider = ({ children }) => {
	const [currentTicket, setCurrentTicket] = useState({ id: null, code: null });
	const [tabOpen, setTabOpenState] = useState(() => {
		return localStorage.getItem("tabOpen") || "open";
	});
	const [openCount, setOpenCount] = useState(0);
	const [pendingCount, setPendingCount] = useState(0);
	const [groupingCount, setGroupingCount] = useState(0);
	const history = useHistory();

	const setTabOpen = (value) => {
		setTabOpenState(value);
		localStorage.setItem("tabOpen", value);
	};

	useEffect(() => {
		if (currentTicket.id !== null) {
			history.push(`/tickets/${currentTicket.uuid}`);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentTicket])

	return (
		<TicketsContext.Provider
			value={{
				currentTicket,
				setCurrentTicket,
				tabOpen,
				setTabOpen,
				openCount,
				setOpenCount,
				pendingCount,
				setPendingCount,
				groupingCount,
				setGroupingCount,
			}}
		>
			{children}
		</TicketsContext.Provider>
	);
};

export { TicketsContext, TicketsContextProvider };
