import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LanguageProvider } from './i18n';
import { ThemeProvider } from './theme/ThemeProvider';
import './i18n/language.css';
import './styles.css';
import './theme/theme.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ThemeProvider><LanguageProvider><App /></LanguageProvider></ThemeProvider></React.StrictMode>
);

// Yalnızca yayınlanmış HTTPS sürümünde PWA servis çalışanını etkinleştir.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}
