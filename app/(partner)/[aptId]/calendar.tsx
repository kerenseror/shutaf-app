import { Placeholder } from '@/components/Placeholder';
import { useTranslation } from 'react-i18next';

// Week 4: US-19 – US-23
export default function Calendar() {
  const { t } = useTranslation();
  return <Placeholder title={t('tabs.calendar')} description={t('placeholder.calendar')} week={4} />;
}
