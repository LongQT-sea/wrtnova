import { createRoot } from 'react-dom/client';
import '@ui/tokens.css';
import { ensureSession } from '@core/warp';
import { initI18n, applyLangAttribute } from '@i18n/index';
import { App } from './App';

const host = document.getElementById('root');
if (!host) throw new Error('#root missing');

// This page can register a WARP tunnel, and /api/warp/register requires the
// session cookie /api/session issues (Constitution VI, FR-042). It is asked for
// here rather than at the button, so the round trip has already happened by the
// time anyone presses it -- and it fails silently, because a site without the
// proxy configured must work exactly as it does now.
void ensureSession();

// The locale is resolved before the first render, so a non-English user never sees
// an English frame swap under them.
void initI18n().then(() => {
  applyLangAttribute();
  createRoot(host).render(<App />);
});
