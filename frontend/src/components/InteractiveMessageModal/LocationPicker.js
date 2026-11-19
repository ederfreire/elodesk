import React, { useEffect, useRef, useState, useCallback } from "react";
import { Box, Button, TextField, CircularProgress, Typography, IconButton } from "@material-ui/core";
import MyLocation from "@material-ui/icons/MyLocation";
import Search from "@material-ui/icons/Search";
import { toast } from "react-toastify";
import { i18n } from "../../translate/i18n";

const LEAFLET_VERSION = "1.9.4";
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;

let leafletPromise = null;

const loadLeaflet = () => {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[data-leaflet="1"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      link.setAttribute("data-leaflet", "1");
      document.head.appendChild(link);
    }

    let script = document.querySelector(`script[data-leaflet="1"]`);
    if (script && window.L) {
      resolve(window.L);
      return;
    }
    if (!script) {
      script = document.createElement("script");
      script.src = LEAFLET_JS;
      script.async = true;
      script.setAttribute("data-leaflet", "1");
      document.body.appendChild(script);
    }
    script.addEventListener("load", () => resolve(window.L));
    script.addEventListener("error", reject);
  });

  return leafletPromise;
};

const DEFAULT_CENTER = [-23.5505, -46.6333]; // São Paulo

const LocationPicker = ({ latitude, longitude, onChange, onPlaceSelected }) => {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [searching, setSearching] = useState(false);

  const placeMarker = useCallback((L, lat, lng) => {
    if (!mapRef.current) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(mapRef.current);
      markerRef.current.on("dragend", () => {
        const pos = markerRef.current.getLatLng();
        onChange?.({ lat: pos.lat, lng: pos.lng });
      });
    }
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapElRef.current) return;

        // Corrige ícones padrão do Leaflet (imagens via CDN)
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/images/marker-icon-2x.png`,
          iconUrl: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/images/marker-icon.png`,
          shadowUrl: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/images/marker-shadow.png`,
        });

        const hasInitial = latitude && longitude;
        const center = hasInitial ? [parseFloat(latitude), parseFloat(longitude)] : DEFAULT_CENTER;

        const map = L.map(mapElRef.current).setView(center, hasInitial ? 15 : 11);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap",
        }).addTo(map);

        mapRef.current = map;
        if (hasInitial) placeMarker(L, center[0], center[1]);

        map.on("click", (e) => {
          placeMarker(L, e.latlng.lat, e.latlng.lng);
          onChange?.({ lat: e.latlng.lat, lng: e.latlng.lng });
        });

        // Garante render correto dentro do dialog
        setTimeout(() => map.invalidateSize(), 200);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          toast.error("Não foi possível carregar o mapa.");
        }
      });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async () => {
    const q = searchText.trim();
    if (!q) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(q)}`,
        { headers: { Accept: "application/json" } }
      );
      const data = await res.json();
      if (!data || !data.length) {
        toast.info("Endereço não encontrado.");
        return;
      }
      const place = data[0];
      const lat = parseFloat(place.lat);
      const lng = parseFloat(place.lon);
      const L = window.L;
      if (mapRef.current && L) {
        mapRef.current.setView([lat, lng], 16);
        placeMarker(L, lat, lng);
      }
      onChange?.({ lat, lng });
      onPlaceSelected?.({
        lat,
        lng,
        name: place.name || place.display_name?.split(",")[0] || "",
        address: place.display_name || "",
      });
    } catch (err) {
      toast.error("Erro ao buscar endereço.");
    } finally {
      setSearching(false);
    }
  };

  const handleMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocalização não suportada neste dispositivo.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const L = window.L;
        if (mapRef.current && L) {
          mapRef.current.setView([lat, lng], 16);
          placeMarker(L, lat, lng);
        }
        onChange?.({ lat, lng });
      },
      () => toast.error("Não foi possível obter sua localização."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <Box style={{ marginBottom: 12 }}>
      <Box display="flex" alignItems="center" style={{ gap: 8, marginBottom: 8 }}>
        <TextField
          fullWidth
          size="small"
          variant="outlined"
          placeholder={i18n.t("interactiveMessageModal.locationTab.searchPlaceholder")}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSearch();
            }
          }}
        />
        <Button
          variant="contained"
          color="primary"
          size="small"
          onClick={handleSearch}
          disabled={searching}
          style={{ minWidth: 44, height: 40 }}
        >
          {searching ? <CircularProgress size={18} color="inherit" /> : <Search fontSize="small" />}
        </Button>
        <IconButton size="small" title={i18n.t("interactiveMessageModal.locationTab.myLocation")} onClick={handleMyLocation}>
          <MyLocation fontSize="small" color="primary" />
        </IconButton>
      </Box>

      <div style={{ position: "relative", width: "100%", height: 240, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(0,0,0,0.12)" }}>
        {loading && (
          <Box
            display="flex"
            alignItems="center"
            justifyContent="center"
            style={{ position: "absolute", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.04)" }}
          >
            <CircularProgress size={28} />
          </Box>
        )}
        <div ref={mapElRef} style={{ width: "100%", height: "100%" }} />
      </div>
      <Typography variant="caption" color="textSecondary" style={{ display: "block", marginTop: 4 }}>
        {i18n.t("interactiveMessageModal.locationTab.mapHint")}
      </Typography>
    </Box>
  );
};

export default LocationPicker;
