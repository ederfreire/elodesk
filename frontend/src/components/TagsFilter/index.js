import { Chip, TextField } from "@material-ui/core";
import Autocomplete from "@material-ui/lab/Autocomplete";
import React, { useEffect, useState } from "react";
import toastError from "../../errors/toastError";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";

export function TagsFilter({ onFiltered }) {
  const [tags, setTags] = useState([]);
  const [selecteds, setSelecteds] = useState([]);

  useEffect(() => {
    async function fetchData() {
      await loadTags();
    }
    fetchData();
  }, []);

  const loadTags = async () => {
    try {
      const { data } = await api.get(`/tags/list`);
      setTags(data);
    } catch (err) {
      toastError(err);
    }
  };

  const onChange = async (value) => {
    setSelecteds(value);
    onFiltered(value);
  };

  return (
    <Autocomplete
      multiple
      size="small"
      options={tags}
      value={selecteds}
      onChange={(e, v, r) => onChange(v)}
      getOptionLabel={(option) => option.name}
      renderTags={(value, getTagProps) =>
        value.map((option, index) => (
          <Chip
            variant="outlined"
            style={{
              backgroundColor: option.color || "#10B981",
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
          placeholder={i18n.t("hardcoded.filterByTags")}
        />
      )}
    />
  );
}
