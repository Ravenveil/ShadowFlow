import { I18nProvider } from './common/i18n';
import { AuthProvider } from './core/auth/AuthContext';
import AppRoutes from './AppRoutes';

export default function App() {
  // The outer div uses CSS theme tokens (--t-bg / --t-fg) so that any
  // legacy page (Landing / Editor / etc.) without its own theme-aware
  // wrapper still inherits the active theme from <html data-theme="…">.
  // Hi-Fi v2 pages set their own surface; this wrapper is the safety net.
  return (
    <I18nProvider>
      <AuthProvider>
        <div
          style={{
            minHeight: '100vh',
            background: 'var(--t-bg)',
            color: 'var(--t-fg)',
          }}
        >
          <AppRoutes />
        </div>
      </AuthProvider>
    </I18nProvider>
  );
}
