import { Placeholder } from '@/components/Placeholder';
import { useTranslation } from 'react-i18next';

// Week 3: US-15 – US-18
export default function Shopping() {
  const { t } = useTranslation();
  return <Placeholder title={t('tabs.shopping')} description={t('placeholder.shopping')} week={3} />;
}
