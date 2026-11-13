import { viewerMessages } from "./messages/viewer.js";
import { popupMessages } from "./messages/popup.js";

export const messages = {
  en: { ...viewerMessages.en, ...popupMessages.en },
  "zh-CN": { ...viewerMessages["zh-CN"], ...popupMessages["zh-CN"] }
};

export function normalizeLanguagePreference(value) {
  return value === "en" || value === "zh-CN" ? value : "auto";
}

export function getBrowserLanguage() {
  // Chrome's interface language, not the document's language or Accept-Language list.
  return globalThis.chrome?.i18n?.getUILanguage?.() || globalThis.navigator?.language || "en";
}

export function resolveLanguage(preference = "auto", browserLanguage = getBrowserLanguage()) {
  const language = normalizeLanguagePreference(preference);
  if (language !== "auto") return language;
  return typeof browserLanguage === "string" && /^zh(?:[-_]|$)/i.test(browserLanguage) ? "zh-CN" : "en";
}

export function createI18n(preference = "auto", browserLanguage = getBrowserLanguage()) {
  const locale = resolveLanguage(preference, browserLanguage);
  const t = (key, values = {}) => {
    const message = messages[locale][key] ?? messages.en[key] ?? key;
    return message.replace(/\{(\w+)\}/g, (placeholder, name) =>
      Object.hasOwn(values, name) ? String(values[name]) : placeholder);
  };
  return { locale, t };
}

// Translate UI annotations through textContent/attributes, never through HTML.
export function localize(root, t) {
  for (const [annotation, attribute] of [
    ["data-i18n", null],
    ["data-i18n-title", "title"],
    ["data-i18n-aria-label", "aria-label"]
  ]) {
    const elements = [...root.querySelectorAll(`[${annotation}]`)];
    if (root.matches?.(`[${annotation}]`)) elements.unshift(root);
    for (const element of elements) {
      const value = t(element.getAttribute(annotation));
      if (attribute) element.setAttribute(attribute, value);
      else element.textContent = value;
    }
  }
}
