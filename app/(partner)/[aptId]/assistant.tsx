import { Placeholder } from '@/components/Placeholder';
import { useTranslation } from 'react-i18next';

// Week 5: US-28 – US-30 (calls the ai-chat Edge Function)
export default function Assistant() {
  const { t } = useTranslation();
  return <Placeholder title={t('tabs.assistant')} description={t('placeholder.assistant')} week={5} />;
}
