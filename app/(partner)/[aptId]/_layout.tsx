import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function PartnerTabs() {
  const { t } = useTranslation();
  return (
    <Tabs screenOptions={{ headerTitleAlign: 'center' }}>
      <Tabs.Screen name="index" options={{ title: t('tabs.home') }} />
      <Tabs.Screen name="shopping" options={{ title: t('tabs.shopping') }} />
      <Tabs.Screen name="calendar" options={{ title: t('tabs.calendar') }} />
      <Tabs.Screen name="requests" options={{ title: t('tabs.requests') }} />
      <Tabs.Screen name="assistant" options={{ title: t('tabs.assistant') }} />
    </Tabs>
  );
}
