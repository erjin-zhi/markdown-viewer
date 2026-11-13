import { createI18n, localize, normalizeLanguagePreference } from "./i18n.js";

const auto = document.querySelector("#auto");
const status = document.querySelector("#status");
const preview = document.querySelector("#preview");
const language = document.querySelector("#language");
let savedAuto = true;
let savedLanguage = "auto";
let i18n = createI18n(savedLanguage);
let statusKey = "popupReady";

function showStatus(key) {
  statusKey = key;
  status.textContent = i18n.t(key);
}

function renderLanguage() {
  i18n = createI18n(savedLanguage);
  document.documentElement.lang = i18n.locale;
  localize(document, i18n.t);
  language.value = savedLanguage;
  showStatus(statusKey);
}

async function initialize() {
  try {
    const settings = await chrome.storage.local.get({ autoPreview: true, language: "auto" });
    savedAuto = settings.autoPreview;
    savedLanguage = normalizeLanguagePreference(settings.language);
    auto.checked = savedAuto;
    auto.disabled = language.disabled = false;
  } catch {
    // Do not let an unknown stored setting be overwritten by an apparent default.
    statusKey = "popupSettingsLoadFailed";
  } finally {
    renderLanguage();
    preview.disabled = false;
    document.body.removeAttribute("data-loading");
  }
}

auto.addEventListener("change", async () => {
  const next = auto.checked;
  auto.disabled = true;
  try {
    await chrome.storage.local.set({ autoPreview: next });
    savedAuto = next;
    showStatus(next ? "popupAutoEnabled" : "popupAutoDisabled");
  } catch {
    auto.checked = savedAuto;
    showStatus("popupSettingsSaveFailed");
  } finally { auto.disabled = false; }
});

language.addEventListener("change", async () => {
  const next = normalizeLanguagePreference(language.value);
  language.disabled = true;
  try {
    await chrome.storage.local.set({ language: next });
    savedLanguage = next;
    statusKey = "popupLanguageSaved";
    renderLanguage();
  } catch {
    language.value = savedLanguage;
    showStatus("popupSettingsSaveFailed");
  } finally { language.disabled = false; }
});

preview.addEventListener("click", async () => {
  preview.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await chrome.tabs.sendMessage(tab.id, { type: "preview-now" });
    const reason = result?.reasonKey;
    showStatus(result?.ok ? "popupPreviewOpened" : reason && i18n.t(reason) !== reason ? reason : "popupCannotPreview");
  } catch {
    showStatus("popupPageUnavailable");
  } finally { preview.disabled = false; }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.autoPreview) {
    savedAuto = changes.autoPreview.newValue ?? true;
    auto.checked = savedAuto;
  }
  if (changes.language) {
    savedLanguage = normalizeLanguagePreference(changes.language.newValue);
    renderLanguage();
  }
});
window.addEventListener("languagechange", () => {
  if (savedLanguage === "auto") renderLanguage();
});
initialize();
