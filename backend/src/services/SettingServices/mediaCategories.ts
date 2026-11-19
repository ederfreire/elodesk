import path from "path";

/**
 * Categorias de mídia usadas pela limpeza da pasta public.
 *
 * A limpeza por idade deixou de ser "apaga tudo mais velho que X" — isso
 * levou embora áudios de atendimento (arquivos pequenos e insubstituíveis)
 * junto com os MP4 que realmente enchem o disco. Agora o admin escolhe
 * EXPLICITAMENTE quais categorias podem ser removidas por idade; o que não
 * estiver selecionado nunca é apagado.
 */
export type MediaCategory =
  | "audio"
  | "video"
  | "image"
  | "document"
  | "other";

export const MEDIA_CATEGORIES: MediaCategory[] = [
  "audio",
  "video",
  "image",
  "document",
  "other"
];

const EXT_BY_CATEGORY: Record<Exclude<MediaCategory, "other">, string[]> = {
  audio: [
    "mp3",
    "oga",
    "ogg",
    "opus",
    "m4a",
    "aac",
    "wav",
    "amr",
    "f4a",
    "weba",
    "flac"
  ],
  video: ["mp4", "f4v", "mov", "avi", "mkv", "webm", "3gp", "m4v", "mpeg"],
  image: ["jpg", "jpeg", "jfif", "png", "webp", "gif", "bmp", "heic", "svg"],
  document: [
    "pdf",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "txt",
    "csv",
    "rtf",
    "odt",
    "zip",
    "rar",
    "7z"
  ]
};

const CATEGORY_BY_EXT = new Map<string, MediaCategory>();
(Object.keys(EXT_BY_CATEGORY) as Array<Exclude<MediaCategory, "other">>).forEach(
  category => {
    EXT_BY_CATEGORY[category].forEach(ext =>
      CATEGORY_BY_EXT.set(ext, category)
    );
  }
);

export const categoryOfFile = (filename: string): MediaCategory => {
  const ext = path
    .extname(filename)
    .replace(/^\./, "")
    .toLowerCase();
  return CATEGORY_BY_EXT.get(ext) || "other";
};

/**
 * Normaliza a lista vinda do Setting/env/API ("video,image" ou array).
 * Valores inválidos são descartados. Lista vazia = nada é apagado por idade.
 */
export const parseMediaCategories = (value: any): MediaCategory[] => {
  const raw = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(",")
        .map(v => v.trim());

  const normalized = raw
    .map(v => String(v).trim().toLowerCase())
    .filter(Boolean);

  if (normalized.includes("all")) return [...MEDIA_CATEGORIES];
  if (normalized.includes("none")) return [];

  return MEDIA_CATEGORIES.filter(c => normalized.includes(c));
};

/**
 * Padrão do sistema quando a empresa não configurou nada.
 * Vazio de propósito: sem escolha explícita do admin, a limpeza por idade
 * não apaga mídia nenhuma (só a deduplicação roda, que é não destrutiva).
 */
export const getDefaultMediaCategories = (): MediaCategory[] =>
  parseMediaCategories(process.env.PUBLIC_FOLDER_CLEAN_TYPES || "");
