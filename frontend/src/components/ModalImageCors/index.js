import React, { useState, useEffect, useCallback } from "react";
import { makeStyles } from "@material-ui/core/styles";
import { IconButton, Tooltip } from "@material-ui/core";
import ZoomInIcon from "@material-ui/icons/ZoomIn";
import ZoomOutIcon from "@material-ui/icons/ZoomOut";
import RotateLeftIcon from "@material-ui/icons/RotateLeft";
import RotateRightIcon from "@material-ui/icons/RotateRight";
import FileCopyIcon from "@material-ui/icons/FileCopy";
import GetAppIcon from "@material-ui/icons/GetApp";
import CloseIcon from "@material-ui/icons/Close";
import RestoreIcon from "@material-ui/icons/Restore";
import { toast } from "react-toastify";

import api from "../../services/api";

const useStyles = makeStyles(theme => ({
	messageMedia: {
		objectFit: "cover",
		width: "100%",
		maxWidth: 400,
		height: "auto",
		borderRadius: 8,
		cursor: "zoom-in",
		display: "block",
	},
	overlay: {
		position: "fixed",
		top: 0, left: 0, right: 0, bottom: 0,
		background: "rgba(0,0,0,0.85)",
		zIndex: 13000,
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
	},
	toolbar: {
		position: "absolute",
		top: 12,
		right: 12,
		display: "flex",
		gap: 4,
		background: "rgba(0,0,0,0.5)",
		borderRadius: 8,
		padding: 4,
		zIndex: 2,
	},
	toolbarBtn: {
		color: "#fff",
		padding: 6,
		"&:hover": { background: "rgba(255,255,255,0.15)" },
	},
	imgWrapper: {
		flex: 1,
		width: "100%",
		display: "flex",
		// "hidden" cortava a imagem assim que o zoom passava do tamanho da
		// área visível — não dava pra ver as bordas nem rolar até elas (o
		// problema relatado). Com "auto" a imagem ampliada pode ser
		// percorrida normalmente.
		overflow: "auto",
		padding: 16,
	},
	// Caixa com o tamanho REAL que a imagem ocupa depois do zoom (e já
	// considerando o giro). É ela que dá tamanho ao conteúdo rolável.
	//
	// O zoom era feito com transform: scale(). Transform é só pintura: não
	// altera o tamanho do elemento no layout, então o container nunca ficava
	// maior que a tela, nunca aparecia barra de rolagem, e o que passava da
	// borda era simplesmente cortado — sem como chegar até lá. Agora o zoom
	// muda width/height de verdade e a rolagem alcança a imagem inteira.
	zoomBox: {
		position: "relative",
		margin: "auto",
		flexShrink: 0,
		transition: "width 0.2s ease, height 0.2s ease",
	},
	zoomImg: {
		position: "absolute",
		left: "50%",
		top: "50%",
		userSelect: "none",
		transition: "transform 0.2s ease",
		transformOrigin: "center center",
	},
}));

const ModalImageCors = ({ imageUrl }) => {
	const classes = useStyles();
	const [fetching, setFetching] = useState(true);
	const [blobUrl, setBlobUrl] = useState("");
	const [fetchFailed, setFetchFailed] = useState(false);
	const [open, setOpen] = useState(false);
	const [zoom, setZoom] = useState(1);
	const [rotation, setRotation] = useState(0);
	// Tamanho natural do arquivo. Sem ele não dá para calcular quanto a
	// imagem deve ocupar em cada nível de zoom.
	const [natural, setNatural] = useState({ largura: 0, altura: 0 });
	// Redimensionar a janela muda o tamanho base em que a imagem cabe.
	const [tela, setTela] = useState({ largura: 0, altura: 0 });

	useEffect(() => {
		if (!imageUrl) return;
		setFetching(true);
		setFetchFailed(false);
		setBlobUrl("");

		const fetchImage = async () => {
			try {
				let normalizedUrl = imageUrl;
				if (normalizedUrl.startsWith("http://") || normalizedUrl.startsWith("https://")) {
					try {
						const urlObj = new URL(normalizedUrl);
						normalizedUrl = urlObj.pathname;
					} catch (e) {}
				} else if (!normalizedUrl.startsWith("/")) {
					normalizedUrl = `/${normalizedUrl}`;
				}
				const { data, headers } = await api.get(normalizedUrl, { responseType: "blob" });
				const url = window.URL.createObjectURL(
					new Blob([data], { type: headers["content-type"] })
				);
				setBlobUrl(url);
				setFetching(false);
			} catch (error) {
				setFetchFailed(true);
				setFetching(false);
			}
		};
		fetchImage();
	}, [imageUrl]);

	const displayUrl = fetching ? imageUrl : (blobUrl || (fetchFailed ? imageUrl : ""));

	const handleOpen = () => {
		setZoom(1);
		setRotation(0);
		setTela({ largura: window.innerWidth, altura: window.innerHeight });
		setOpen(true);
	};
	const handleClose = useCallback(() => setOpen(false), []);

	useEffect(() => {
		if (!open) return;
		const onKey = (e) => {
			if (e.key === "Escape") handleClose();
			else if (e.key === "+" || e.key === "=") setZoom(z => Math.min(z + 0.25, 5));
			else if (e.key === "-") setZoom(z => Math.max(z - 0.25, 0.25));
		};
		const aoRedimensionar = () =>
			setTela({ largura: window.innerWidth, altura: window.innerHeight });

		window.addEventListener("keydown", onKey);
		window.addEventListener("resize", aoRedimensionar);
		return () => {
			window.removeEventListener("keydown", onKey);
			window.removeEventListener("resize", aoRedimensionar);
		};
	}, [open, handleClose]);

	const handleWheel = (e) => {
		e.preventDefault();
		setZoom(z => {
			const next = e.deltaY < 0 ? z + 0.15 : z - 0.15;
			return Math.min(Math.max(next, 0.25), 5);
		});
	};

	const blobToPng = (srcBlob) =>
		new Promise((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = "anonymous";
			const objUrl = URL.createObjectURL(srcBlob);
			img.onload = () => {
				try {
					const canvas = document.createElement("canvas");
					canvas.width = img.naturalWidth;
					canvas.height = img.naturalHeight;
					const ctx = canvas.getContext("2d");
					ctx.drawImage(img, 0, 0);
					canvas.toBlob((b) => {
						URL.revokeObjectURL(objUrl);
						b ? resolve(b) : reject(new Error("toBlob failed"));
					}, "image/png");
				} catch (e) {
					URL.revokeObjectURL(objUrl);
					reject(e);
				}
			};
			img.onerror = (e) => {
				URL.revokeObjectURL(objUrl);
				reject(e);
			};
			img.src = objUrl;
		});

	const handleCopy = async () => {
		if (!navigator.clipboard || !window.ClipboardItem) {
			try {
				await navigator.clipboard.writeText(displayUrl);
				toast.success("Link copiado (navegador sem suporte a imagem)");
			} catch {
				toast.error("Navegador não suporta cópia");
			}
			return;
		}
		try {
			// Safari requires ClipboardItem to be created synchronously inside the
			// user gesture — pass a Promise<Blob> instead of awaiting first.
			const pngPromise = (async () => {
				const res = await fetch(displayUrl);
				const blob = await res.blob();
				if (blob.type === "image/png") return blob;
				return await blobToPng(blob);
			})();
			await navigator.clipboard.write([
				new window.ClipboardItem({ "image/png": pngPromise }),
			]);
			toast.success("Imagem copiada — cole onde quiser");
		} catch (err) {
			console.warn("[ModalImageCors] copy image failed:", err);
			try {
				await navigator.clipboard.writeText(displayUrl);
				toast.info("Não foi possível copiar a imagem, link copiado");
			} catch {
				toast.error("Não foi possível copiar");
			}
		}
	};

	const handleDownload = () => {
		const a = document.createElement("a");
		a.href = displayUrl;
		a.download = "imagem";
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	};

	const stop = (e) => e.stopPropagation();

	// true quando a imagem está "deitada" (girada 90° ou 270°) — nesses
	// ângulos os limites de largura/altura precisam ser trocados pra ela não
	// estourar a tela. Normaliza o ângulo pra funcionar também com giros
	// negativos e acima de 360°.
	const isSideways = Math.abs(((rotation % 180) + 180) % 180) === 90;

	// Escala em que a imagem cabe inteira na tela, no giro atual. Nunca passa
	// de 1: imagem pequena não é esticada só porque sobra espaço.
	const escalaQueCabe = (() => {
		if (!natural.largura || !natural.altura) return 1;
		const larguraTela = tela.largura || window.innerWidth;
		const alturaTela = tela.altura || window.innerHeight;
		// Girada em 90°/270°, a LARGURA da imagem vira a altura ocupada na tela
		// e a ALTURA vira a largura. Cada dimensão precisa então respeitar o
		// limite do eixo em que ela realmente cai — junto com a folga daquele
		// eixo (90% na horizontal, 85% na vertical por causa da barra de
		// ferramentas).
		const limiteLargura = isSideways ? alturaTela * 0.85 : larguraTela * 0.9;
		const limiteAltura = isSideways ? larguraTela * 0.9 : alturaTela * 0.85;
		return Math.min(
			limiteLargura / natural.largura,
			limiteAltura / natural.altura,
			1
		);
	})();

	const escala = escalaQueCabe * zoom;
	const larguraFinal = Math.round(natural.largura * escala);
	const alturaFinal = Math.round(natural.altura * escala);
	// A caixa acompanha o giro: deitada, ela troca largura por altura.
	const caixaLargura = isSideways ? alturaFinal : larguraFinal;
	const caixaAltura = isSideways ? larguraFinal : alturaFinal;

	return (
		<>
			<img
				src={displayUrl}
				alt="image"
				className={classes.messageMedia}
				onClick={handleOpen}
			/>
			{open && (
				<div className={classes.overlay} onClick={handleClose}>
					<div className={classes.toolbar} onClick={stop}>
						<Tooltip title="Aumentar zoom">
							<IconButton className={classes.toolbarBtn} size="small" onClick={() => setZoom(z => Math.min(z + 0.25, 5))}>
								<ZoomInIcon />
							</IconButton>
						</Tooltip>
						<Tooltip title="Diminuir zoom">
							<IconButton className={classes.toolbarBtn} size="small" onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))}>
								<ZoomOutIcon />
							</IconButton>
						</Tooltip>
						<Tooltip title="Girar à esquerda">
							<IconButton className={classes.toolbarBtn} size="small" onClick={() => setRotation(r => r - 90)}>
								<RotateLeftIcon />
							</IconButton>
						</Tooltip>
						<Tooltip title="Girar à direita">
							<IconButton className={classes.toolbarBtn} size="small" onClick={() => setRotation(r => r + 90)}>
								<RotateRightIcon />
							</IconButton>
						</Tooltip>
						<Tooltip title="Resetar">
							<IconButton className={classes.toolbarBtn} size="small" onClick={() => { setZoom(1); setRotation(0); }}>
								<RestoreIcon />
							</IconButton>
						</Tooltip>
						<Tooltip title="Copiar imagem">
							<IconButton className={classes.toolbarBtn} size="small" onClick={handleCopy}>
								<FileCopyIcon />
							</IconButton>
						</Tooltip>
						<Tooltip title="Baixar">
							<IconButton className={classes.toolbarBtn} size="small" onClick={handleDownload}>
								<GetAppIcon />
							</IconButton>
						</Tooltip>
						<Tooltip title="Fechar (Esc)">
							<IconButton className={classes.toolbarBtn} size="small" onClick={handleClose}>
								<CloseIcon />
							</IconButton>
						</Tooltip>
					</div>
					<div className={classes.imgWrapper} onWheel={handleWheel} onClick={stop}>
						<div
							className={classes.zoomBox}
							style={
								natural.largura
									? { width: caixaLargura, height: caixaAltura }
									: undefined
							}
						>
							<img
								src={displayUrl}
								alt="image"
								className={classes.zoomImg}
								style={{
									width: natural.largura ? larguraFinal : "auto",
									height: natural.altura ? alturaFinal : "auto",
									maxWidth: "none",
									maxHeight: "none",
									// translate(-50%,-50%) centraliza dentro da caixa; o giro
									// acontece em torno do próprio centro, então a imagem
									// continua encaixada na caixa em qualquer ângulo.
									transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
								}}
								onLoad={e =>
									setNatural({
										largura: e.target.naturalWidth,
										altura: e.target.naturalHeight,
									})
								}
								onDoubleClick={() => setZoom(z => (z === 1 ? 2 : 1))}
								draggable={false}
							/>
						</div>
					</div>
				</div>
			)}
		</>
	);
};

export default ModalImageCors;
