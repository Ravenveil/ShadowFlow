import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import EditorPageImpl from '../EditorPage';
import { I18nProvider } from '../common/i18n';
import { QUICK_DEMO_PROMPTS } from '../core/constants/quickDemoPrompts';

// P22: Whitelist — only safe slugs (lowercase alphanumeric + hyphens/underscores, ≤ 64 chars)
const SAFE_TEMPLATE_ID = /^[a-z0-9][a-z0-9_-]{0,62}[a-z0-9]$|^[a-z0-9]$/i;

export default function EditorPage() {
  const { templateId } = useParams<{ templateId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // P21: Controlled i18n state so onToggleLang actually works
  const [lang, setLang] = useState<'EN' | 'ZH'>('EN');

  // P22: Sanitise templateId before use — reject path-traversal or junk input
  const safeAlias =
    templateId && SAFE_TEMPLATE_ID.test(templateId) ? templateId.toLowerCase() : 'blank';
  const runId = searchParams.get('runId');

  const isQuickDemo = searchParams.get('quickDemo') === '1';
  const initialGoal = isQuickDemo
    ? QUICK_DEMO_PROMPTS[safeAlias]?.prompt ?? ''
    : undefined;

  // Story 13.2 AC5: when user came from Builder via ExecutionModeSection,
  // route Back/Save back to /builder (preserving any workflow_ref the
  // editor has just produced) instead of the default /templates.
  const returnTo = searchParams.get('return_to');
  const goBack = () => {
    if (returnTo === 'builder') {
      const wfRef = searchParams.get('workflow_ref');
      const wfName = searchParams.get('workflow_ref_name');
      const qs = new URLSearchParams();
      if (wfRef) qs.set('workflow_ref', wfRef);
      if (wfName) qs.set('workflow_ref_name', wfName);
      navigate(qs.toString() ? `/builder?${qs.toString()}` : '/builder');
      return;
    }
    navigate('/templates');
  };

  return (
    <I18nProvider language={lang === 'ZH' ? 'zh' : 'en'}>
      <div className="block bg-[var(--accent)] px-4 py-2 text-center text-xs font-medium text-[var(--accent-ink)] md:hidden">
        桌面端体验更佳 · Desktop recommended for full editing
      </div>
      <EditorPageImpl
        onBack={goBack}
        lang={lang}
        onToggleLang={() => setLang((l) => (l === 'EN' ? 'ZH' : 'EN'))}
        templateAlias={safeAlias}
        runId={runId}
        initialGoal={initialGoal}
      />
    </I18nProvider>
  );
}
