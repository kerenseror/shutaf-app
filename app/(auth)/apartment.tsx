import { Button, Input, Screen, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Text } from 'react-native';

// US-2 (open an apartment) and US-3 / US-4 (join with a partner or landlord code).
export default function Apartment() {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);

  async function run(kind: 'create' | 'join') {
    setBusy(kind);
    const { error } =
      kind === 'create'
        ? await supabase.rpc('create_apartment', { name, language: i18n.language === 'en' ? 'en' : 'he' })
        : await supabase.rpc('join_apartment', { code });
    setBusy(null);
    if (error) return Alert.alert(t('common.error'), error.message);
    router.replace('/');
  }

  return (
    <Screen>
      <Title>{t('apartment.title')}</Title>

      <Text style={{ fontWeight: '600' }}>{t('apartment.createTitle')}</Text>
      <Input value={name} onChangeText={setName} placeholder={t('apartment.namePlaceholder')} />
      <Button label={t('apartment.create')} onPress={() => run('create')} busy={busy === 'create'} disabled={!name.trim()} />

      <Text style={{ fontWeight: '600', marginTop: 24 }}>{t('apartment.joinTitle')}</Text>
      <Input value={code} onChangeText={setCode} placeholder={t('apartment.codePlaceholder')} autoCapitalize="characters" maxLength={6} />
      <Button label={t('apartment.join')} kind="secondary" onPress={() => run('join')} busy={busy === 'join'} disabled={code.length !== 6} />
    </Screen>
  );
}
