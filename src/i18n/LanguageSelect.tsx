import { Languages } from 'lucide-react';
import { languageNames, SUPPORTED_LANGUAGES, useI18n, type Language } from './index';

export default function LanguageSelect({ compact = false }: { compact?: boolean }) {
  const {language, setLanguage, t} = useI18n();
  return <label className={`language-control ${compact ? 'language-control-compact' : ''}`}>
    <span><Languages size={18}/>{compact ? t('Uygulama dili') : t('Dil seçimi')}</span>
    <select aria-label={t('Uygulama dili')} value={language} onChange={e => setLanguage(e.target.value as Language)}>
      {SUPPORTED_LANGUAGES.map(code => <option key={code} value={code}>{languageNames[code]}</option>)}
    </select>
  </label>;
}
