import { Chip, TextField } from "@material-ui/core";
import Autocomplete from "@material-ui/lab/Autocomplete";
import React, { useEffect, useState } from "react";
import { i18n } from "../../translate/i18n";

const statusColors = {
  open: "#3B82F6",
  closed: "#10B981",
  pending: "#F59E0B",
  group: "#6366F1",
};

export function StatusFilter({ onFiltered }) {
  const [selecteds, setSelecteds] = useState([]);

  const onChange = async (value) => {
    setSelecteds(value);
    onFiltered(value);
  };

  const status = [
    { status: "open", name: `${i18n.t("tickets.search.filterConectionsOptions.open")}` },
    { status: "closed", name: `${i18n.t("tickets.search.filterConectionsOptions.closed")}` },
    { status: "pending", name: `${i18n.t("tickets.search.filterConectionsOptions.pending")}` },
    { status: "group", name: `${i18n.t("statusFilterExtra.groups")}` },
  ];

  return (
    <Autocomplete
      multiple
      size="small"
      options={status}
      value={selecteds}
      onChange={(e, v, r) => onChange(v)}
      getOptionLabel={(option) => option.name}
      renderTags={(value, getTagProps) =>
        value.map((option, index) => (
          <Chip
            variant="outlined"
            style={{
              backgroundColor: statusColors[option.status] || "#888",
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
          placeholder={i18n.t("statusFilter.statusFilter")}
        />
      )}
    />
  );
}
