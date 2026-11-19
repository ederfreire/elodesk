import React, { useState, useEffect, useRef, useCallback } from "react";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import {
  Avatar,
  Box,
  Chip,
  CircularProgress,
  FormControlLabel,
  Link,
  MenuItem,
  Select,
  Switch,
  Typography
} from "@mui/material";
import Autocomplete from "@mui/material/Autocomplete";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";

const MEDIA_TYPE_LABEL = {
  IMAGE: "POST",
  VIDEO: "REEL",
  CAROUSEL_ALBUM: "CARROSSEL",
  REELS: "REEL"
};

const truncate = (s, n = 60) => (!s ? "" : s.length > n ? s.slice(0, n) + "…" : s);

const FlowBuilderInstagramTriggerModal = ({ open, onSave, onUpdate, data, close }) => {
  const [active, setActive] = useState(false);
  const [mediaId, setMediaId] = useState("");
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [keywordsInput, setKeywordsInput] = useState("");
  const [keywords, setKeywords] = useState([]);
  const [matchAny, setMatchAny] = useState(true);
  const [showManual, setShowManual] = useState(false);

  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");

  const [options, setOptions] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const searchTimer = useRef(null);

  useEffect(() => {
    if (open === "edit") {
      setMediaId(data?.data?.mediaId || "");
      setSelectedMedia(data?.data?.mediaSnapshot || null);
      setKeywords(data?.data?.keywords || []);
      setMatchAny(data?.data?.matchAny ?? true);
      setShowManual(!!data?.data?.mediaId && !data?.data?.mediaSnapshot);
      setAccountId(data?.data?.accountId || "");
      setActive(true);
    } else if (open === "create") {
      setMediaId("");
      setSelectedMedia(null);
      setKeywords([]);
      setMatchAny(true);
      setShowManual(false);
      setAccountId("");
      setActive(true);
    } else {
      setActive(false);
    }
  }, [open, data]);

  useEffect(() => {
    if (!active) return;
    (async () => {
      try {
        const { data: list } = await api.get("/instagram/accounts");
        setAccounts(list || []);
        const savedId = data?.data?.accountId;
        const exists = savedId && list?.some(a => a.whatsappId === savedId);
        if (exists) {
          setAccountId(savedId);
        } else if (list?.length && !accountId) {
          setAccountId(list[0].whatsappId);
        }
      } catch (e) {
        // sem contas IG
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const fetchMedia = useCallback(
    async ({ append = false, after = null, q = "" } = {}) => {
      if (!accountId) return;
      setLoading(true);
      try {
        const params = { whatsappId: accountId, limit: 25 };
        if (after) params.after = after;
        if (q) params.q = q;
        const { data: res } = await api.get("/instagram/media", { params });
        setOptions(prev => (append ? [...prev, ...(res.items || [])] : res.items || []));
        setCursor(res.nextCursor || null);
      } catch (e) {
        if (!append) setOptions([]);
        setCursor(null);
      } finally {
        setLoading(false);
      }
    },
    [accountId]
  );

  useEffect(() => {
    if (active && accountId) fetchMedia({ append: false });
  }, [active, accountId, fetchMedia]);

  useEffect(() => {
    if (!active) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchMedia({ append: false, q: search });
    }, 350);
    return () => searchTimer.current && clearTimeout(searchTimer.current);
  }, [search, active, fetchMedia]);

  const handleScroll = e => {
    const el = e.target;
    if (cursor && !loading && el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
      fetchMedia({ append: true, after: cursor, q: search });
    }
  };

  const close_ = () => { close(null); setActive(false); };

  const addKeyword = () => {
    const v = keywordsInput.trim();
    if (v && !keywords.includes(v)) setKeywords([...keywords, v]);
    setKeywordsInput("");
  };

  const handleSave = () => {
    const payload = {
      mediaId,
      mediaSnapshot: selectedMedia || null,
      keywords,
      matchAny,
      accountId: accountId || null,
      accountName: accounts.find(a => a.whatsappId === accountId)?.name || null
    };
    if (open === "edit") onUpdate({ ...data, data: payload });
    else onSave(payload);
    close_();
  };

  const renderOption = (props, opt) => (
    <li {...props} key={opt.id}>
      <Box display="flex" alignItems="center" gap={1} width="100%">
        <Avatar variant="rounded" src={opt.thumbnail_url || opt.media_url} sx={{ width: 44, height: 44, bgcolor: "#eee" }} />
        <Box flex={1} minWidth={0}>
          <Box display="flex" alignItems="center" gap={0.5}>
            <Chip size="small" label={MEDIA_TYPE_LABEL[opt.media_product_type] || MEDIA_TYPE_LABEL[opt.media_type] || opt.media_type} sx={{ height: 18, fontSize: "0.65rem" }} />
            {opt.timestamp && (
              <Typography variant="caption" color="text.secondary">{new Date(opt.timestamp).toLocaleDateString()}</Typography>
            )}
          </Box>
          <Typography variant="body2" noWrap sx={{ mt: 0.3 }}>
            {truncate(opt.caption, 70) || <em style={{ color: "#999" }}>({i18n.t("flowBuilderInstagramTriggerModal.noCaption")})</em>}
          </Typography>
        </Box>
      </Box>
    </li>
  );

  return (
    <Dialog open={active} onClose={close_} fullWidth maxWidth="sm">
      <DialogTitle>{i18n.t("flowBuilderInstagramTriggerModal.title")}</DialogTitle>
      <DialogContent dividers>
        {accounts.length >= 1 && (
          <Box mb={2}>
            <Typography variant="caption" color="text.secondary">
              {i18n.t("flowBuilderInstagramTriggerModal.account")}
            </Typography>
            <Select fullWidth size="small" value={accountId} onChange={e => setAccountId(e.target.value)}>
              {accounts.map(a => (
                <MenuItem key={a.whatsappId} value={a.whatsappId}>{a.name}</MenuItem>
              ))}
            </Select>
          </Box>
        )}

        {!showManual ? (
          <>
            <Autocomplete
              options={options}
              loading={loading}
              filterOptions={x => x}
              getOptionLabel={opt => opt?.id ? `${truncate(opt.caption, 40) || `(${i18n.t("flowBuilderInstagramTriggerModal.noCaption")})`} — ${opt.id}` : ""}
              value={selectedMedia}
              onChange={(_, v) => { setSelectedMedia(v); setMediaId(v?.id || ""); }}
              onInputChange={(_, v, reason) => { if (reason === "input") setSearch(v); }}
              isOptionEqualToValue={(o, v) => o.id === v?.id}
              renderOption={renderOption}
              ListboxProps={{ onScroll: handleScroll, style: { maxHeight: 320 } }}
              noOptionsText={
                accounts.length === 0
                  ? i18n.t("flowBuilderInstagramTriggerModal.noAccounts")
                  : loading
                  ? i18n.t("flowBuilderInstagramTriggerModal.loading")
                  : i18n.t("flowBuilderInstagramTriggerModal.noResults")
              }
              renderInput={params => (
                <TextField
                  {...params}
                  label={i18n.t("flowBuilderInstagramTriggerModal.selectPost")}
                  placeholder={i18n.t("flowBuilderInstagramTriggerModal.searchPlaceholder")}
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loading && <CircularProgress size={18} />}
                        {params.InputProps.endAdornment}
                      </>
                    )
                  }}
                />
              )}
            />
            <Box mt={0.5} display="flex" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">
                {i18n.t("flowBuilderInstagramTriggerModal.emptyHint")}
              </Typography>
              <Link component="button" type="button" variant="caption" onClick={() => setShowManual(true)}>
                {i18n.t("flowBuilderInstagramTriggerModal.pasteIdManually")}
              </Link>
            </Box>
          </>
        ) : (
          <>
            <TextField
              label={i18n.t("flowBuilderInstagramTriggerModal.mediaId")}
              fullWidth
              value={mediaId}
              onChange={e => { setMediaId(e.target.value); setSelectedMedia(null); }}
              variant="outlined"
              margin="normal"
              placeholder={i18n.t("flowBuilderInstagramTriggerModal.mediaIdPlaceholder")}
            />
            <Box display="flex" justifyContent="flex-end">
              <Link component="button" type="button" variant="caption" onClick={() => setShowManual(false)}>
                {i18n.t("flowBuilderInstagramTriggerModal.chooseFromList")}
              </Link>
            </Box>
          </>
        )}

        <Box display="flex" gap={1} mt={2}>
          <TextField
            label={i18n.t("flowBuilderInstagramTriggerModal.keyword")}
            fullWidth
            value={keywordsInput}
            onChange={e => setKeywordsInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
            variant="outlined"
            size="small"
          />
          <Button variant="contained" onClick={addKeyword}>
            {i18n.t("flowBuilderInstagramTriggerModal.add")}
          </Button>
        </Box>
        <Box mt={1} display="flex" flexWrap="wrap" gap={0.5}>
          {keywords.map(k => (
            <Chip key={k} label={k} onDelete={() => setKeywords(keywords.filter(x => x !== k))} />
          ))}
        </Box>
        <FormControlLabel
          sx={{ mt: 2 }}
          control={<Switch checked={matchAny} onChange={e => setMatchAny(e.target.checked)} />}
          label={matchAny ? i18n.t("flowBuilderInstagramTriggerModal.matchAny") : i18n.t("flowBuilderInstagramTriggerModal.matchAll")}
        />
        <Typography variant="caption" display="block" sx={{ mt: 1, color: "text.secondary" }}>
          {i18n.t("flowBuilderInstagramTriggerModal.hint")}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={close_}>{i18n.t("flowBuilderInstagramTriggerModal.cancel")}</Button>
        <Button onClick={handleSave} variant="contained" color="primary">
          {i18n.t("flowBuilderInstagramTriggerModal.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FlowBuilderInstagramTriggerModal;
