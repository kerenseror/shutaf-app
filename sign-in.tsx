import { Button, Input, Screen, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Text } from 'react-native';

/** Israeli local numbers (050-1234567) → E.164 (+972501234567). */
function toE164(phone: string) {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0')) return '+972' + digits.slice(1);
  return '+' + digits;
}

// US-1. Phone sign-in uses Supabase Auth's SMS provider (set it up in the dashboard).
// OPEN DECISION: WhatsApp first with SMS fallback, and Google sign-in.
export default function SignIn() {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    setBusy(true);
    const e164 = toE164(phone);
    const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (error) return Alert.alert(t('common.error'), error.message);
    router.push({ pathname: '/(auth)/verify', params: { phone: e164 } });
  }

  return (
    <Screen>
      <Title>{t('auth.title')}</Title>
      <Text>{t('auth.subtitle')}</Text>
      <Input
        value={phone}
        onChangeText={setPhone}
        placeholder={t('auth.phonePlaceholder')}
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <Button label={t('auth.sendCode')} onPress={sendCode} busy={busy} disabled={phone.length < 9} />
      {/* TODO (week 1): Google via supabase.auth.signInWithOAuth + expo-auth-session */}
      <Button label={t('auth.google')} kind="secondary" onPress={() => Alert.alert(t('common.comingSoon'))} />
    </Screen>
  );
}
