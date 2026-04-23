import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import EditorPageImpl from '../EditorPage';
import { I18nProvider } from '../common/i18n';

// P22: Whitelist — only safe slugs (lowercase alphanumeric + hyphens, ≤ 64 chars)
const SAFE_TEMPLATE_ID = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/i;

export default function EditorPage() {
  const { templateId } = useParams<{ templateId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // P21: Controlled i18n state so onToggleLang actually works
  const [lang, setLang] = useState<'EN' | 'ZH'>('EN');

  // P22: Sanitise templateId before use — reject path-traversal or junk input
  const safeAlias =
    templateId && SAFE_TEMPLATE_ID.test(templateId) ? templateId : 'blank';
  const runId = searchParams.get('runId');

  return (
    <I18nProvider language={lang === 'ZH' ? 'zh' : 'en'}>
      <EditorPageImpl
        onBack={() => navigate('/templates')}
        lang={lang}
        onToggleLang={() => setLang((l) => (l === 'EN' ? 'ZH' : 'EN'))}
        templateAlias={safeAlias}
        runId={runId}
      />
    </I18nProvider>
  );
}
