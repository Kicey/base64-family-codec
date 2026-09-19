import { messages } from './messages.js';

export const LANGUAGE_KEY = 'base64-family-codec.language';
export const languageChoices = ['auto', 'en', 'zh-CN'];

/** Use the first supported browser preference; any Chinese locale uses Simplified Chinese. */
export function resolveLanguage(preference = 'auto', browserLanguages = []) {
  if (preference === 'en' || preference === 'zh-CN') return preference;
  for (const language of browserLanguages) {
    if (typeof language !== 'string') continue;
    if (/^zh(?:-|$)/i.test(language)) return 'zh-CN';
    if (/^en(?:-|$)/i.test(language)) return 'en';
  }
  return 'en';
}

// Accessing localStorage itself can throw, so obtain it inside the guarded block.
export function loadLanguagePreference(getStorage = () => globalThis.localStorage) {
  try {
    const value = getStorage()?.getItem(LANGUAGE_KEY);
    return languageChoices.includes(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveLanguagePreference(preference, getStorage = () => globalThis.localStorage) {
  if (!languageChoices.includes(preference)) return;
  try {
    const storage = getStorage();
    if (preference === 'auto') storage?.removeItem(LANGUAGE_KEY);
    else storage?.setItem(LANGUAGE_KEY, preference);
  } catch {
    // The switch still works for this page when storage is blocked or full.
  }
}

export function translate(language, key, params = {}, fallback = key) {
  const template = messages[language]?.[key] ?? messages.en[key] ?? fallback;
  return template.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(params, name) ? String(params[name]) : match);
}

export function formatCount(language, value, unit) {
  const plural = new Intl.PluralRules(language).select(value);
  return translate(language, `count.${unit}.${plural}`, { count: value.toLocaleString(language) });
}

export function translateError(language, error) {
  return translate(language, `error.${error.code}`, error.params, error.message);
}

export function translateVariant(language, variant, field) {
  return translate(language, `variant.${variant.id}.${field}`, {},
    variant[field] ?? (field === 'subtitle' ? translate(language, 'customVariant') : ''));
}

/** Translate text and accessible names without replacing controls or user data. */
export function translateDocument(language, root = document) {
  root.documentElement.lang = language;
  root.title = translate(language, 'pageTitle');
  root.querySelector('meta[name="description"]').content = translate(language, 'pageDescription');
  for (const element of root.querySelectorAll('[data-i18n]')) {
    element.textContent = translate(language, element.dataset.i18n);
  }
  for (const element of root.querySelectorAll('[data-i18n-aria-label]')) {
    element.setAttribute('aria-label', translate(language, element.dataset.i18nAriaLabel));
  }
}
