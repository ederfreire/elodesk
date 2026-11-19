import { messages as portugueseMessages } from "./pt.js";
import { messages as englishMessages } from "./en.js";
import { messages as spanishMessages } from "./es.js";
import { messages as arabicMessages } from "./ar.js";
import { messages as turkishMessages } from "./tr.js";

const deepMerge = (target, source) => {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      result[key] &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key]) &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
};

const normalizeLocaleMessages = (localeMessages) =>
  Object.fromEntries(
    Object.entries(localeMessages).map(([locale, config]) => {
      const { translations = {}, ...legacyNamespaces } = config || {};

      return [
        locale,
        {
          ...config,
          translations: deepMerge(translations, legacyNamespaces),
        },
      ];
    })
  );

const messages = {
  ...normalizeLocaleMessages(portugueseMessages),
  ...normalizeLocaleMessages(englishMessages),
  ...normalizeLocaleMessages(spanishMessages),
  ...normalizeLocaleMessages(arabicMessages),
  ...normalizeLocaleMessages(turkishMessages),
};

export { messages };
