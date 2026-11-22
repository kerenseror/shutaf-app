import { Button, Input, Screen, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

export default function Verify() {
  const { t } = useTranslation();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function verify() {
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
    setBusy(false);
    if (error) return Alert.alert(t('common.error'), error.message);
    router.replace('/');
  }

  return (
    <Screen>
      <Title>{t('auth.codeLabel')}</Title>
      <Input value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} />
      <Button label={t('auth.verify')} onPress={verify} busy={busy} disabled={code.length < 6} />
    </Screen>
  );
}
