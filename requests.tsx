import { Placeholder } from '@/components/Placeholder';
import { useTranslation } from 'react-i18next';

// Week 4: US-24 – US-27
export default function Requests() {
  const { t } = useTranslation();
  return <Placeholder title={t('tabs.requests')} description={t('placeholder.requests')} week={4} />;
}
