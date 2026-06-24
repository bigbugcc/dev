/**
 * Locale fallback, text lookup, and recent-message deduplication.
 */

(function() {
  "use strict";

  function normalizeLocale(locale) {
    const value = String(locale || "").trim().replace(/_/g, "-");
    if (!value) return "en";
    const [language, region] = value.split("-");
    if (language.toLowerCase() === "zh") return region ? `zh-${region.toUpperCase()}` : "zh-CN";
    return region ? `${language.toLowerCase()}-${region.toUpperCase()}` : language.toLowerCase();
  }

  function normalizeLocales(locales) {
    const normalized = (Array.isArray(locales) ? locales : [locales])
      .map((locale) => String(locale || "").trim())
      .filter(Boolean)
      .map(normalizeLocale);
    const unique = [...new Set(normalized)];
    return unique.length > 0 ? unique : ["en"];
  }

  function getByPath(value, path) {
    return String(path || "")
      .split(".")
      .filter(Boolean)
      .reduce(
        (current, key) =>
          current && Object.prototype.hasOwnProperty.call(current, key) ? current[key] : undefined,
        value
      );
  }

  function hasContent(value) {
    if (typeof value === "string") return Boolean(value.trim());
    if (Array.isArray(value)) return value.some(hasContent);
    return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);
  }

  class TextManager {
    constructor(locale, fallbackLocale = "en", historyLimit = 5) {
      this.locale = Array.isArray(locale) ? normalizeLocales(locale) : normalizeLocale(locale);
      this.fallbackLocale = normalizeLocale(fallbackLocale);
      this.historyLimit = historyLimit;
      this.data = null;
      this.localeKeys = [];
      this.history = [];
    }

    setData(data) {
      this.data = data || null;
      this.localeKeys = Object.keys((this.data && this.data.locales) || {});
    }

    getLocaleCandidates() {
      const preferredLocales = normalizeLocales(this.locale);
      const requested = [
        ...preferredLocales.flatMap((locale) => [locale, locale.split("-")[0]]),
        this.fallbackLocale,
        this.fallbackLocale.split("-")[0],
        "en",
      ];
      const resolved = [];

      requested.forEach((candidate) => {
        const exact = this.localeKeys.find((key) => normalizeLocale(key) === candidate);
        const base = !candidate.includes("-")
          ? this.localeKeys.find((key) => normalizeLocale(key).split("-")[0] === candidate)
          : null;
        const match = exact || base;
        if (match && !resolved.includes(match)) resolved.push(match);
      });

      return resolved;
    }

    getText(key) {
      if (!key || !this.data) return undefined;

      for (const locale of this.getLocaleCandidates()) {
        const value = getByPath(this.data.locales[locale], key);
        if (hasContent(value)) return value;
      }

      if (key.startsWith("models.") && !key.startsWith("models.default.")) {
        const fallbackKey = key.endsWith(".welcome") ? "models.default.welcome" : "models.default.touch";
        for (const locale of this.getLocaleCandidates()) {
          const value = getByPath(this.data.locales[locale], fallbackKey);
          if (hasContent(value)) return value;
        }
      }

      return undefined;
    }

    localizeLegacy(value) {
      if (!value || Array.isArray(value) || typeof value !== "object") return value;
      const keys = Object.keys(value);
      for (const locale of this.getLocaleCandidates()) {
        const match = keys.find((key) => normalizeLocale(key) === normalizeLocale(locale));
        if (match) return value[match];
      }
      return value[keys[0]];
    }

    pick(value, rand) {
      const localized = this.localizeLegacy(value);
      const messages = (Array.isArray(localized) ? localized : [localized]).filter(
        (message) => typeof message === "string" && message.trim()
      );
      const fresh = messages.filter((message) => !this.history.includes(message));
      return fresh.length > 0 ? rand(fresh) : null;
    }

    remember(message) {
      this.history.push(message);
      if (this.history.length > this.historyLimit) this.history.shift();
    }
  }

  window.Live2DModules = window.Live2DModules || {};
  window.Live2DModules.normalizeLocale = normalizeLocale;
  window.Live2DModules.normalizeLocales = normalizeLocales;
  window.Live2DModules.TextManager = TextManager;
})();
