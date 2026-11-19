import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import { messages } from "./languages";

// Idiomas ativos: português (nativo), inglês e espanhol. Árabe e turco foram
// retirados das opções; os arquivos continuam em translate/languages caso
// voltem a ser usados. Quem tinha "ar"/"tr" salvo cai no português.
const supportedLngs = ["pt", "en", "es"];

// Map variants to base language
const langMap = { "pt-BR": "pt", "pt-br": "pt", "en-US": "en", "en-us": "en", "es-ES": "es", "es-MX": "es" };

function normalizeLanguage(lang) {
	if (!lang) return null;
	if (langMap[lang]) return langMap[lang];
	const base = lang.split("-")[0];
	if (supportedLngs.includes(base)) return base;
	return null;
}

function detectInitialLanguage() {
	const stored = localStorage.getItem("language") || localStorage.getItem("i18nextLng");
	const normalized = normalizeLanguage(stored);
	if (normalized) {
		// Fix stored value if it was a variant
		if (stored !== normalized) {
			localStorage.setItem("language", normalized);
			localStorage.setItem("i18nextLng", normalized);
		}
		return normalized;
	}

	// Detect from browser locale
	const browserLang = navigator.language || navigator.userLanguage || "";
	const browserNorm = normalizeLanguage(browserLang);
	if (browserNorm) return browserNorm;

	return "pt";
}

i18n.use(LanguageDetector).init({
	debug: false,
	defaultNS: ["translations"],
	fallbackLng: "pt",
	supportedLngs,
	lng: detectInitialLanguage(),
	ns: ["translations"],
	resources: messages,
});

export { i18n };
