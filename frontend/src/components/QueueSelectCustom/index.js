import React, { useEffect, useState } from "react";
import Chip from "@material-ui/core/Chip";
import TextField from "@material-ui/core/TextField";
import Autocomplete from "@material-ui/lab/Autocomplete";
import toastError from "../../errors/toastError";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";

const QueueSelectCustom = ({ selectedQueueIds, onChange }) => {
	const [queues, setQueues] = useState([]);

	useEffect(() => {
		(async () => {
			try {
				const { data } = await api.get("/queue");
				setQueues(data);
			} catch (err) {
				toastError(err);
			}
		})();
	}, []);

	const selectedQueues = queues.filter(q => selectedQueueIds.includes(q.id));

	return (
		<Autocomplete
			multiple
			size="small"
			options={queues}
			value={selectedQueues}
			onChange={(e, v) => onChange(v.map(q => q.id))}
			getOptionLabel={(option) => option.name}
			getOptionSelected={(option, value) => option.id === value.id}
			renderTags={(value, getTagProps) =>
				value.map((option, index) => (
					<Chip
						variant="outlined"
						style={{
							backgroundColor: option.color || "#F59E0B",
							color: "white",
							fontWeight: 500,
							fontSize: "0.7rem",
							border: "none",
						}}
						label={option.name}
						{...getTagProps({ index })}
						size="small"
					/>
				))
			}
			renderInput={(params) => (
				<TextField
					{...params}
					variant="outlined"
					placeholder={i18n.t("queueSelect.inputLabel")}
				/>
			)}
		/>
	);
};

export default QueueSelectCustom;
