export type Language = 'tr' | 'en' | 'fr' | 'nl';
export const SUPPORTED_LANGUAGES: readonly Language[] = ['tr', 'fr', 'nl', 'en'];
export const languageNames: Record<Language, string> = {
  tr: 'Türkçe', fr: 'Français', nl: 'Nederlands', en: 'English',
};
const STORAGE_KEY = 'stockflow.language';
const locales: Record<Language, string> = {
  tr: 'tr-TR', en: 'en-GB', fr: 'fr-BE', nl: 'nl-BE',
};

export function readLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED_LANGUAGES.includes(saved as Language)) return saved as Language;
  } catch { /* Browser storage may be disabled. */ }
  return 'tr';
}
let currentLanguage: Language = readLanguage();
export function getLanguage() { return currentLanguage; }
export function getLocale() { return locales[currentLanguage]; }
export function updateLanguage(language: Language) {
  currentLanguage = language;
  try { localStorage.setItem(STORAGE_KEY, language); } catch { /* Private browsing */ }
  if (typeof document !== 'undefined') document.documentElement.lang = language;
}
