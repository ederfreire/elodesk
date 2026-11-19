import React, { useEffect, useMemo } from 'react';
import toastError from "../../errors/toastError";
import { Button, Divider, Typography } from "@material-ui/core";
import RoomIcon from "@material-ui/icons/Room";
import { i18n } from "../../translate/i18n";

const LocationPreview = ({ image, link, description }) => {
	useEffect(() => { }, [image, link, description]);

	// Extrair coordenadas do link do Google Maps para exibir mapa inline
	const coords = useMemo(() => {
		if (!link) return null;
		const match = link.match(/[?&]q=([-\d.]+),([-\d.]+)/);
		if (match) return { lat: match[1], lng: match[2] };
		return null;
	}, [link]);

	const handleLocation = async () => {
		try {
			window.open(link);
		} catch (err) {
			toastError(err);
		}
	};

	const mapEmbedUrl = coords
		? `https://www.openstreetmap.org/export/embed.html?bbox=${coords.lng - 0.005},${coords.lat - 0.003},${Number(coords.lng) + 0.005},${Number(coords.lat) + 0.003}&layer=mapnik&marker=${coords.lat},${coords.lng}`
		: null;

	return (
		<div style={{ minWidth: "250px", maxWidth: "320px", borderRadius: 12, overflow: "hidden" }}>
			{/* Mapa inline via OpenStreetMap */}
			{mapEmbedUrl ? (
				<div
					style={{ position: "relative", width: "100%", height: "180px", cursor: "pointer", borderRadius: "12px 12px 0 0", overflow: "hidden" }}
					onClick={handleLocation}
				>
					<iframe
						title="location-map"
						width="100%"
						height="180"
						frameBorder="0"
						scrolling="no"
						src={mapEmbedUrl}
						style={{ border: 0, pointerEvents: "none" }}
					/>
					<div style={{
						position: "absolute",
						bottom: 8,
						right: 8,
						backgroundColor: "rgba(0,0,0,0.6)",
						color: "#fff",
						borderRadius: 6,
						padding: "2px 8px",
						fontSize: 11,
						fontWeight: 600,
					}}>
						<RoomIcon style={{ fontSize: 14, verticalAlign: "middle", marginRight: 2 }} />
						{coords.lat}, {coords.lng}
					</div>
				</div>
			) : image ? (
				<img src={image} alt="loc" onClick={handleLocation} style={{ width: "100%", cursor: "pointer", borderRadius: "12px 12px 0 0" }} />
			) : null}

			{/* Descrição */}
			{description && (
				<div style={{ padding: "8px 12px" }}>
					<Typography variant="body2" style={{ fontWeight: 500 }}>
						<div dangerouslySetInnerHTML={{ __html: description.replace(/\\n/g, '<br />') }} />
					</Typography>
				</div>
			)}

			<Divider />
			<Button
				fullWidth
				color="primary"
				onClick={handleLocation}
				disabled={!link}
				startIcon={<RoomIcon />}
				style={{ textTransform: "none", fontWeight: 600, padding: "8px" }}
			>
				{i18n.t("locationPreview.openInMaps")}
			</Button>
		</div>
	);
};

export default LocationPreview;
