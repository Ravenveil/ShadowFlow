import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import { ThemeProvider } from '@/shared/theme/ThemeProvider';
import { UiPrefsProvider } from '@/shared/ui/prefs';
import '@/shared/styles/base.css';
import '@/shared/styles/shell.css';
import '@/shared/styles/chat.css';
import '@/shared/styles/panel.css';
import '@/shared/styles/settings.css';
import '@/shared/styles/composer.css';
import '@/shared/styles/landing.css';
import '@/shared/styles/views.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <UiPrefsProvider>
        <App />
      </UiPrefsProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
