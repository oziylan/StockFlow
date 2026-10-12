import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import tr from './locales/tr.json';
import en from './locales/en.json';
import fr from './locales/fr.json';
import nl from './locales/nl.json';
import { getLanguage, languageNames, readLanguage, SUPPORTED_LANGUAGES, updateLanguage, type Language } from './language';

export { languageNames, SUPPORTED_LANGUAGES };
export type { Language };
const texts: Record<Language, Record<string,string>> = { tr, en, fr, nl };
export type Translator = (key: string) => string;
export function translate(key: string): string {
  return texts[getLanguage()][key] ?? texts.tr[key] ?? key;
}
const LanguageContext = createContext<{language: Language; setLanguage: (value: Language) => void; t: Translator} | undefined>(undefined);

export function LanguageProvider({ children }: {children: ReactNode}) {
  const [language, chooseLanguage] = useState<Language>(readLanguage);
  // Also update the HTML lang attribute for accessibility.
  useEffect(() => { updateLanguage(language); }, [language]);
  const value = useMemo(() => ({
    language,
    setLanguage: (next: Language) => { updateLanguage(next); chooseLanguage(next); },
    t: (key: string) => texts[language][key] ?? texts.tr[key] ?? key,
  }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('LanguageProvider is required');
  return context;
}
