import { useNavigate } from 'react-router-dom';
import TemplatesPageImpl from '../TemplatesPage';
import { I18nProvider } from '../common/i18n';

export default function TemplatesPage() {
  const navigate = useNavigate();

  return (
    <I18nProvider>
      <TemplatesPageImpl
        onBack={() => navigate('/')}
        onPick={(alias: string) => navigate(`/editor/${alias}`)}
        lang="EN"
        onToggleLang={() => {}}
      />
    </I18nProvider>
  );
}
