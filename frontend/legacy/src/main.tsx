import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';
import { installLeakGuards } from './core/security/leakGuard';
import { migrateLegacySecrets } from './api/_base';
import './index.css';

installLeakGuards();
// 2026-05-29 — 一次性把老 sf_secrets 的 BYOK key/backend_url 迁进统一的 B 套
// KEY_STORAGE（幂等，不覆盖已有）。详 memory/debt_byok_two_key_stores。
migrateLegacySecrets();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>,
);
