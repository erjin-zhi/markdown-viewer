import test from "node:test";
import assert from "node:assert/strict";
import { createI18n, getBrowserLanguage, messages, normalizeLanguagePreference, resolveLanguage } from "../src/i18n.js";

test("automatic language uses Chinese for Chinese variants and English for other browsers", () => {
  for (const locale of ["zh", "zh-CN", "zh-TW", "zh-HK", "zh-Hans", "zh-Hant-TW", "zh_CN", "ZH-cn"]) {
    assert.equal(resolveLanguage("auto", locale), "zh-CN", locale);
  }
  for (const locale of ["en", "en-GB", "fr-FR", "ja", "ko-KR", "de", "ar", "", null, "zho"]) {
    assert.equal(resolveLanguage("auto", locale), "en", String(locale));
  }
});

test("manual language overrides the browser and invalid saved preferences fall back to automatic", () => {
  assert.equal(resolveLanguage("en", "zh-CN"), "en");
  assert.equal(resolveLanguage("zh-CN", "fr-FR"), "zh-CN");
  for (const preference of [undefined, null, "", "fr", {}, "constructor"]) {
    assert.equal(normalizeLanguagePreference(preference), "auto");
    assert.equal(resolveLanguage(preference, "zh-TW"), "zh-CN");
    assert.equal(resolveLanguage(preference, "ja"), "en");
  }
});

test("automatic mode reads Chrome UI language", () => {
  const previous = globalThis.chrome;
  try {
    globalThis.chrome = { i18n: { getUILanguage: () => "zh-TW" } };
    assert.equal(getBrowserLanguage(), "zh-TW");
    assert.equal(createI18n().locale, "zh-CN");
    globalThis.chrome.i18n.getUILanguage = () => "fr-FR";
    assert.equal(createI18n().locale, "en");
  } finally {
    if (previous === undefined) delete globalThis.chrome;
    else globalThis.chrome = previous;
  }
});

test("both translations cover the same messages and interpolation fields", () => {
  const keys = Object.keys(messages.en).sort();
  assert.ok(keys.length > 50, "includes the popup and full viewer UI");
  assert.deepEqual(Object.keys(messages["zh-CN"]).sort(), keys);
  const fields = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const key of keys) {
    assert.ok(messages.en[key].trim(), `${key}: English is nonempty`);
    assert.ok(messages["zh-CN"][key].trim(), `${key}: Chinese is nonempty`);
    assert.deepEqual(fields(messages.en[key]), fields(messages["zh-CN"][key]), key);
    const values = Object.fromEntries(fields(messages.en[key]).map(name => [name, "$& <text> 3"]));
    for (const locale of ["en", "zh-CN"]) {
      const translated = createI18n(locale).t(key, values);
      assert.ok(!/\{\w+\}/.test(translated), `${key}: all fields substituted`);
      if (Object.keys(values).length) assert.ok(translated.includes("$& <text> 3"), "values remain literal text");
    }
  }
});
