import { createRoot } from 'react-dom/client';
import '@ui/tokens.css';
import { ensureSession } from '@core/warp';
import { initI18n, applyLangAttribute } from '@i18n/index';
import { App } from './App';

const host = document.getElementById('root');
if (!host) throw new Error('#root missing');

// The shared configuration carries a tunnel too, so this page registers WARP as
// well and needs the same session cookie (Constitution VI, FR-042).
void ensureSession();

// The locale is resolved before the first render, so a non-English user never sees
// an English frame swap under them.
void initI18n().then(() => {
  applyLangAttribute();
  createRoot(host).render(<App />);
});
