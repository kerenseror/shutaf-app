import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

// The landlord's area: business-like and clean (spec §11). No access to bills, shopping or calendar.
export default function LandlordLayout() {
  const { t } = useTranslation();
  return <Stack screenOptions={{ title: t('landlord.title'), headerTitleAlign: 'center' }} />;
}
