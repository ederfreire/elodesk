package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"

	"fmt"
	"image"
	"image/color"
	"image/draw"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// normalizeOutgoingMediaMime garante que o mimetype anunciado no protobuf
// bate com o conteúdo real do arquivo. O WhatsApp (principalmente o Web e o
// Desktop) recusa renderizar mídia cujo mimetype é genérico
// ("application/octet-stream") ou inconsistente com o tipo da mensagem —
// exibindo "não é possível abrir esta mensagem aqui, verifique no telefone" e,
// em muitos casos, a mídia simplesmente não chega no aparelho do contato.
func normalizeOutgoingMediaMime(kind, mime string, data []byte) string {
	m := strings.ToLower(strings.TrimSpace(mime))
	generic := m == "" ||
		m == "application/octet-stream" ||
		m == "binary/octet-stream" ||
		m == "application/binary"

	sniffed := ""
	if len(data) > 0 {
		sniffed = strings.ToLower(strings.TrimSpace(http.DetectContentType(data)))
		if i := strings.Index(sniffed, ";"); i >= 0 {
			sniffed = strings.TrimSpace(sniffed[:i])
		}
		if sniffed == "application/octet-stream" {
			sniffed = ""
		}
	}

	switch strings.ToLower(kind) {
	case "image":
		if generic || !strings.HasPrefix(m, "image/") {
			if strings.HasPrefix(sniffed, "image/") {
				return sniffed
			}
			return "image/jpeg"
		}
		// image/jpg não é um mimetype válido para o WhatsApp.
		if m == "image/jpg" {
			return "image/jpeg"
		}
	case "sticker":
		return "image/webp"
	case "video":
		if generic || !strings.HasPrefix(m, "video/") {
			if strings.HasPrefix(sniffed, "video/") {
				return sniffed
			}
			return "video/mp4"
		}
	case "document":
		if generic && sniffed != "" {
			return sniffed
		}
		if m == "" {
			return "application/octet-stream"
		}
	}
	if m == "" && sniffed != "" {
		return sniffed
	}
	if m == "" {
		return "application/octet-stream"
	}
	return m
}

// imageDimensions devolve largura/altura da imagem quando decodificável.
func imageDimensions(data []byte) (uint32, uint32) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width <= 0 || cfg.Height <= 0 {
		return 0, 0
	}
	return uint32(cfg.Width), uint32(cfg.Height)
}

// jpegThumbnail gera a miniatura JPEG que o WhatsApp usa como preview enquanto
// baixa a mídia. Sem ela, clientes Web/Desktop frequentemente mostram um
// placeholder quebrado ou o aviso de "abrir no telefone".
func jpegThumbnail(data []byte, max int) []byte {
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil
	}
	b := src.Bounds()
	sw, sh := b.Dx(), b.Dy()
	if sw <= 0 || sh <= 0 {
		return nil
	}
	tw, th := sw, sh
	if sw > max || sh > max {
		if sw >= sh {
			tw = max
			th = sh * max / sw
		} else {
			th = max
			tw = sw * max / sh
		}
	}
	if tw < 1 {
		tw = 1
	}
	if th < 1 {
		th = 1
	}
	dst := image.NewRGBA(image.Rect(0, 0, tw, th))
	draw.Draw(dst, dst.Bounds(), &image.Uniform{color.White}, image.Point{}, draw.Src)
	// Escala nearest-neighbor (suficiente para um thumbnail de ~72px).
	for y := 0; y < th; y++ {
		sy := b.Min.Y + y*sh/th
		for x := 0; x < tw; x++ {
			sx := b.Min.X + x*sw/tw
			dst.Set(x, y, src.At(sx, sy))
		}
	}
	var out bytes.Buffer
	if err := jpeg.Encode(&out, dst, &jpeg.Options{Quality: 60}); err != nil {
		return nil
	}
	if out.Len() == 0 || out.Len() > 64*1024 {
		return nil
	}
	return out.Bytes()
}

type videoProbe struct {
	Width   uint32
	Height  uint32
	Seconds uint32
	Codec   string
	Audio   string
	Format  string
}

// writeTempMedia grava o buffer num arquivo temporário. ffprobe/ffmpeg leem
// MP4/MOV com seek (o átomo `moov` costuma ficar no fim do arquivo); via
// `pipe:0` a leitura falha silenciosamente e o resultado é vídeo sem duração
// (aparece 0:00 no WhatsApp) e sem thumbnail.
func writeTempMedia(data []byte, ext string) (string, func(), error) {
	if ext == "" {
		ext = ".bin"
	}
	f, err := os.CreateTemp("", "wacalls-media-*"+ext)
	if err != nil {
		return "", func() {}, err
	}
	name := f.Name()
	cleanup := func() { os.Remove(name) }
	if _, err := f.Write(data); err != nil {
		f.Close()
		cleanup()
		return "", func() {}, err
	}
	if err := f.Close(); err != nil {
		cleanup()
		return "", func() {}, err
	}
	return name, cleanup, nil
}

// probeVideo extrai dimensões/duração/codecs via ffprobe (best-effort).
func probeVideo(data []byte) videoProbe {
	var res videoProbe
	if len(data) == 0 {
		return res
	}
	bin, err := exec.LookPath("ffprobe")
	if err != nil || bin == "" {
		// Sem ffprobe ainda conseguimos a duração lendo os átomos do MP4.
		res.Seconds = mp4DurationSeconds(data)
		return res
	}

	path, cleanup, err := writeTempMedia(data, ".mp4")
	if err != nil {
		return res
	}
	defer cleanup()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin,
		"-v", "error",
		"-show_entries", "stream=index,codec_type,codec_name,width,height,duration:format=duration,format_name",
		"-of", "json",
		path,
	)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return res
	}
	var parsed struct {
		Streams []struct {
			CodecType string `json:"codec_type"`
			CodecName string `json:"codec_name"`
			Width     int    `json:"width"`
			Height    int    `json:"height"`
			Duration  string `json:"duration"`
		} `json:"streams"`
		Format struct {
			Duration   string `json:"duration"`
			FormatName string `json:"format_name"`
		} `json:"format"`
	}
	if err := json.Unmarshal(out.Bytes(), &parsed); err != nil {
		return res
	}
	res.Format = strings.ToLower(strings.TrimSpace(parsed.Format.FormatName))
	streamDuration := ""
	for _, st := range parsed.Streams {
		switch strings.ToLower(st.CodecType) {
		case "video":
			if res.Codec == "" {
				res.Codec = strings.ToLower(st.CodecName)
				if st.Width > 0 {
					res.Width = uint32(st.Width)
				}
				if st.Height > 0 {
					res.Height = uint32(st.Height)
				}
				if streamDuration == "" {
					streamDuration = st.Duration
				}
			}
		case "audio":
			if res.Audio == "" {
				res.Audio = strings.ToLower(st.CodecName)
			}
		}
	}
	for _, d := range []string{parsed.Format.Duration, streamDuration} {
		if res.Seconds > 0 {
			break
		}
		if d = strings.TrimSpace(d); d != "" && d != "N/A" {
			if secs, err := strconv.ParseFloat(d, 64); err == nil && secs > 0 {
				res.Seconds = uint32(secs + 0.5)
			}
		}
	}
	if res.Seconds == 0 {
		res.Seconds = mp4DurationSeconds(data)
	}
	return res
}

// mp4DurationSeconds lê a duração direto dos átomos MP4 (moov/mvhd, e
// moov/trak/mdia/mdhd como reserva). Serve para dois casos em que o vídeo
// chegava "0:00" no celular do contato: servidor sem ffprobe instalado e MP4
// cujo `format.duration` o ffprobe não consegue calcular.
func mp4DurationSeconds(data []byte) uint32 {
	if len(data) < 16 {
		return 0
	}
	var walk func(buf []byte, depth int) uint32
	walk = func(buf []byte, depth int) uint32 {
		if depth > 6 {
			return 0
		}
		for off := 0; off+8 <= len(buf); {
			size := int(binary.BigEndian.Uint32(buf[off : off+4]))
			name := string(buf[off+4 : off+8])
			header := 8
			if size == 1 {
				// tamanho de 64 bits
				if off+16 > len(buf) {
					return 0
				}
				size64 := binary.BigEndian.Uint64(buf[off+8 : off+16])
				if size64 > uint64(len(buf)-off) {
					size = len(buf) - off
				} else {
					size = int(size64)
				}
				header = 16
			} else if size == 0 {
				size = len(buf) - off
			}
			if size < header || off+size > len(buf) {
				return 0
			}
			payload := buf[off+header : off+size]
			switch name {
			case "moov", "trak", "mdia":
				if secs := walk(payload, depth+1); secs > 0 {
					return secs
				}
			case "mvhd", "mdhd":
				if len(payload) >= 4 {
					version := payload[0]
					var scale, dur uint64
					if version == 1 && len(payload) >= 32 {
						scale = uint64(binary.BigEndian.Uint32(payload[20:24]))
						dur = binary.BigEndian.Uint64(payload[24:32])
					} else if len(payload) >= 20 {
						scale = uint64(binary.BigEndian.Uint32(payload[12:16]))
						dur = uint64(binary.BigEndian.Uint32(payload[16:20]))
					}

					if scale > 0 && dur > 0 && dur != 0xFFFFFFFF {
						secs := float64(dur) / float64(scale)
						if secs > 0 {
							return uint32(secs + 0.5)
						}
					}
				}
			}
			off += size
		}
		return 0
	}
	return walk(data, 0)
}


// videoNeedsTranscode diz se o vídeo precisa ser reempacotado. O WhatsApp só
// entrega vídeo MP4 com H.264 + AAC; qualquer outra combinação (WebM/VP8/VP9
// do navegador, MOV/HEVC do iPhone, AV1) é aceita no upload mas nunca chega ao
// aparelho do contato — na plataforma a mensagem aparece enviada e no
// WhatsApp Web fica riscada/indisponível.
func videoNeedsTranscode(vp videoProbe) bool {
	if vp.Codec == "" {
		// Sem ffprobe/codec identificado é mais seguro reempacotar.
		return true
	}
	if vp.Codec != "h264" {
		return true
	}
	if !strings.Contains(vp.Format, "mp4") && !strings.Contains(vp.Format, "mov") {
		return true
	}
	if vp.Audio != "" && vp.Audio != "aac" {
		return true
	}
	return false
}

// transcodeVideoForWhatsApp converte o vídeo para MP4 (H.264 baseline + AAC,
// faststart) que é o único formato que o WhatsApp entrega de forma confiável
// em todos os clientes. Retorna (dados, mime, true) quando conseguiu.
func transcodeVideoForWhatsApp(ctx context.Context, data []byte) ([]byte, string, bool) {
	if len(data) == 0 {
		return nil, "", false
	}
	bin, err := exec.LookPath("ffmpeg")
	if err != nil || bin == "" {
		return nil, "", false
	}
	inPath, cleanIn, err := writeTempMedia(data, ".src")
	if err != nil {
		return nil, "", false
	}
	defer cleanIn()
	outPath, cleanOut, err := writeTempMedia(nil, ".mp4")
	if err != nil {
		return nil, "", false
	}
	defer cleanOut()

	runCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(runCtx, bin,
		"-hide_banner", "-loglevel", "error", "-y",
		"-fflags", "+genpts+igndts",
		"-i", inPath,
		"-c:v", "libx264",
		"-profile:v", "baseline",
		"-level", "3.1",
		"-pix_fmt", "yuv420p",
		// WhatsApp exige dimensões pares; limita a 720p pra não estourar tamanho.
		"-vf", "scale='min(1280,iw)':-2:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
		"-preset", "veryfast",
		"-crf", "28",
		"-c:a", "aac",
		"-b:a", "128k",
		"-ac", "2",
		"-ar", "44100",
		// +faststart move o `moov` (onde fica a duração) para o início e
		// -write_tmcd/-video_track_timescale ajudam clientes que leem a
		// duração da trilha em vez do container.
		"-movflags", "+faststart",
		"-video_track_timescale", "90000",
		"-f", "mp4",
		outPath,
	)
	var errBuf bytes.Buffer
	cmd.Stderr = &errBuf
	if err := cmd.Run(); err != nil {
		return nil, "", false
	}
	out, err := os.ReadFile(outPath)
	if err != nil || len(out) == 0 {
		return nil, "", false
	}
	return out, "video/mp4", true
}


// transcodeVideoCFR é o "último recurso" para vídeo sem duração: decodifica
// tudo e re-encoda com frame rate constante (-r 30) e timestamps zerados, o
// que força o ffmpeg a escrever mvhd/mdhd com a duração real.
func transcodeVideoCFR(ctx context.Context, data []byte) ([]byte, string, bool) {
	if len(data) == 0 {
		return nil, "", false
	}
	bin, err := exec.LookPath("ffmpeg")
	if err != nil || bin == "" {
		return nil, "", false
	}
	inPath, cleanIn, err := writeTempMedia(data, ".src")
	if err != nil {
		return nil, "", false
	}
	defer cleanIn()
	outPath, cleanOut, err := writeTempMedia(nil, ".mp4")
	if err != nil {
		return nil, "", false
	}
	defer cleanOut()

	runCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(runCtx, bin,
		"-hide_banner", "-loglevel", "error", "-y",
		"-fflags", "+genpts+igndts",
		"-i", inPath,
		"-map", "0:v:0",
		"-map", "0:a:0?",
		"-vsync", "cfr",
		"-r", "30",
		"-c:v", "libx264",
		"-profile:v", "baseline",
		"-level", "3.1",
		"-pix_fmt", "yuv420p",
		"-vf", "scale='min(1280,iw)':-2:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,setpts=N/FRAME_RATE/TB",
		"-preset", "veryfast",
		"-crf", "28",
		"-c:a", "aac",
		"-b:a", "128k",
		"-ac", "2",
		"-ar", "44100",
		"-avoid_negative_ts", "make_zero",
		"-movflags", "+faststart",
		"-video_track_timescale", "90000",
		"-f", "mp4",
		outPath,
	)
	var errBuf bytes.Buffer
	cmd.Stderr = &errBuf
	if err := cmd.Run(); err != nil {
		return nil, "", false
	}
	out, err := os.ReadFile(outPath)
	if err != nil || len(out) == 0 {
		return nil, "", false
	}
	return out, "video/mp4", true
}

// normalizeImageForWhatsApp garante que a imagem enviada seja um JPEG/PNG real.
// Fotos vindas de iPhone (HEIC/HEIF), navegador (WebP) ou GIF são aceitas no
// upload mas o telefone do contato não consegue abrir ("formato não
// suportado"), então convertemos para JPEG.
func normalizeImageForWhatsApp(data []byte, mime string) ([]byte, string, bool) {
	if len(data) == 0 {
		return nil, "", false
	}
	sniffed := strings.ToLower(http.DetectContentType(data))
	if i := strings.Index(sniffed, ";"); i >= 0 {
		sniffed = strings.TrimSpace(sniffed[:i])
	}
	if sniffed == "image/jpeg" || sniffed == "image/png" {
		return nil, "", false
	}
	// Tenta re-encodar em Go (jpeg/png/gif são suportados nativamente).
	if src, _, err := image.Decode(bytes.NewReader(data)); err == nil {
		b := src.Bounds()
		dst := image.NewRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
		draw.Draw(dst, dst.Bounds(), &image.Uniform{color.White}, image.Point{}, draw.Src)
		draw.Draw(dst, dst.Bounds(), src, b.Min, draw.Over)
		var out bytes.Buffer
		if err := jpeg.Encode(&out, dst, &jpeg.Options{Quality: 85}); err == nil && out.Len() > 0 {
			return out.Bytes(), "image/jpeg", true
		}
	}
	// Fallback via ffmpeg (cobre WebP/HEIC quando o build tem os decoders).
	bin, err := exec.LookPath("ffmpeg")
	if err != nil || bin == "" {
		return nil, "", false
	}
	inPath, cleanIn, err := writeTempMedia(data, ".img")
	if err != nil {
		return nil, "", false
	}
	defer cleanIn()
	outPath, cleanOut, err := writeTempMedia(nil, ".jpg")
	if err != nil {
		return nil, "", false
	}
	defer cleanOut()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin,
		"-hide_banner", "-loglevel", "error", "-y",
		"-i", inPath,
		"-frames:v", "1",
		"-q:v", "3",
		"-f", "image2",
		outPath,
	)
	if err := cmd.Run(); err != nil {
		return nil, "", false
	}
	out, err := os.ReadFile(outPath)
	if err != nil || len(out) == 0 {
		return nil, "", false
	}
	return out, "image/jpeg", true
}

// videoThumbnail extrai o primeiro frame do vídeo como JPEG (best-effort).
func videoThumbnail(data []byte) []byte {
	bin, err := exec.LookPath("ffmpeg")
	if err != nil || bin == "" {
		return nil
	}
	path, cleanup, err := writeTempMedia(data, ".mp4")
	if err != nil {
		return nil
	}
	defer cleanup()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin,
		"-hide_banner", "-loglevel", "error",
		"-i", path,
		"-frames:v", "1",
		"-vf", "scale=min(320\\,iw):-2",
		"-f", "mjpeg",
		"pipe:1",
	)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil || out.Len() == 0 {
		return nil
	}
	return jpegThumbnail(out.Bytes(), 72)
}

// prepareOutgoingMedia normaliza mídia antes do upload para o WhatsApp:
// vídeos vão sempre como MP4/H.264+AAC (senão não chegam no aparelho do
// contato) e fotos em formato exótico (HEIC/WebP/GIF) viram JPEG (senão o
// telefone não abre). Devolve dados/mime/filename possivelmente ajustados.
func prepareOutgoingMedia(ctx context.Context, kind string, data []byte, mime, filename string) ([]byte, string, string) {
	switch strings.ToLower(kind) {
	case "video":
		vp := probeVideo(data)
		// Além do codec, a DURAÇÃO conta: um MP4 gravado pelo celular/navegador
		// pode vir com `moov` incompleto (duração 0/N/A). O WhatsApp lê a
		// duração do próprio container e mostra "0:00" mesmo com Seconds no
		// protobuf — o vídeo abre e toca, mas sem tempo. Remuxar/transcodar
		// reescreve o container com a duração correta.
		if videoNeedsTranscode(vp) || vp.Seconds == 0 {
			if out, newMime, ok := transcodeVideoForWhatsApp(ctx, data); ok {
				data = out
				mime = newMime
				filename = swapMediaExt(filename, ".mp4", "video")
				vp = probeVideo(data)
			}
		}
		// Se depois do transcode o container AINDA não tem duração, o input
		// veio sem timestamps confiáveis (MediaRecorder do navegador, mp4
		// fragmentado). Um segundo passe com frame rate fixo reconstrói a
		// linha de tempo e é o que faz o celular parar de mostrar "0:00".
		if vp.Seconds == 0 {
			if out, newMime, ok := transcodeVideoCFR(ctx, data); ok {
				if p := probeVideo(out); p.Seconds > 0 {
					data = out
					mime = newMime
					filename = swapMediaExt(filename, ".mp4", "video")
				}
			}
		}

	case "image":
		if out, newMime, ok := normalizeImageForWhatsApp(data, mime); ok {
			data = out
			mime = newMime
			filename = swapMediaExt(filename, ".jpg", "imagem")
		}
	}
	return data, mime, filename
}

func swapMediaExt(filename, ext, fallbackBase string) string {
	base := strings.TrimSpace(filename)
	if base == "" {
		return fmt.Sprintf("%s-%d%s", fallbackBase, time.Now().UnixMilli(), ext)
	}
	if i := strings.LastIndex(base, "."); i > 0 {
		base = base[:i]
	}
	return base + ext
}
