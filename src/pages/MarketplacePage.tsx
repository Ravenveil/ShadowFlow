import { useNavigate } from 'react-router-dom';
import { MarketplacePageImpl } from '../core/pages/MarketplacePageImpl';

export default function MarketplacePage() {
  const navigate = useNavigate();
  return <MarketplacePageImpl onBack={() => navigate(-1)} />;
}
