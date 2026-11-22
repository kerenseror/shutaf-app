import { Loading } from '@/components/ui';
import { formatMoney, minimizeTransfers, netPositions, personalStatus, Transfer } from '@/domain';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

interface HomeData {
  pairs: Transfer[];
  names: Record<string, string>;
  currency: string;
}

// Home screen (spec §4.3): pair balances on top, quick personal status at the bottom.
// TODO (week 2): the detailed list of purchases and bills, and the FAB to add an expense or item.
export default function Home() {
  const { aptId } = useLocalSearchParams<{ aptId: string }>();
  const { session } = useSession();
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<HomeData | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [balances, profiles, apt] = await Promise.all([
          supabase.from('pair_balances').select('debtor, creditor, amount_minor').eq('apartment_id', aptId),
          supabase.from('profiles').select('id, display_name'), // RLS: only people I share an apartment with
          supabase.from('apartments').select('currency').eq('id', aptId).single(),
        ]);
        const names: Record<string, string> = {};
        for (const p of profiles.data ?? []) names[p.id] = p.display_name || '…';
        setData({
          pairs: (balances.data ?? []).map((b) => ({ fromId: b.debtor, toId: b.creditor, amountMinor: Number(b.amount_minor) })),
          names,
          currency: apt.data?.currency ?? 'ILS',
        });
      })();
    }, [aptId]),
  );

  if (!data || !session) return <Loading />;

  const me = session.user.id;
  const money = (minor: number) => formatMoney(minor, data.currency, i18n.language);
  const name = (id: string) => (id === me ? t('home.you') : data.names[id] ?? '…');
  const status = personalStatus(me, data.pairs);
  const bottomLine = minimizeTransfers(netPositions(data.pairs));
  const line = (tr: Transfer) => t('home.owes', { from: name(tr.fromId), to: name(tr.toId), amount: money(tr.amountMinor) });

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.section}>{t('home.pairs')}</Text>
        {data.pairs.length === 0 && <Text>{t('home.allSettled')}</Text>}
        {data.pairs.map((p) => (
          <Text key={p.fromId + p.toId} style={styles.row}>{line(p)}</Text>
        ))}

        {bottomLine.length > 0 && <Text style={styles.section}>{t('home.bottomLine')}</Text>}
        {bottomLine.map((p) => (
          <Text key={'b' + p.fromId + p.toId} style={styles.row}>{line(p)}</Text>
        ))}
      </ScrollView>

      <View style={styles.status}>
        {status.iOwe > 0 && <Text style={[styles.statusText, styles.owe]}>{t('home.iOwe', { amount: money(status.iOwe) })}</Text>}
        {status.owedToMe > 0 && <Text style={[styles.statusText, styles.owed]}>{t('home.owedToMe', { amount: money(status.owedToMe) })}</Text>}
        {status.iOwe === 0 && status.owedToMe === 0 && <Text style={styles.statusText}>{t('home.allSettled')}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 8 },
  section: { fontSize: 18, fontWeight: '700', marginTop: 12, textAlign: 'auto' },
  row: { fontSize: 16, paddingVertical: 6, textAlign: 'auto' },
  status: { padding: 20, borderTopWidth: 1, borderColor: '#eee', gap: 4 },
  statusText: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  owe: { color: '#c0392b' },
  owed: { color: '#1e8449' },
});
