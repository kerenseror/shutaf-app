import { Loading } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, Text, View } from 'react-native';

interface Row {
  id: string;
  name: string;
  open: number;
}

// US-25: the landlord's apartments with the number of open requests.
// TODO (week 4): open an apartment → its requests → request thread with status, visit time and contacts.
export default function LandlordHome() {
  const { t } = useTranslation();
  const { session } = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data } = await supabase
        .from('memberships')
        .select('apartment_id, apartments(name)')
        .eq('user_id', session.user.id)
        .eq('role', 'landlord');
      const { data: open } = await supabase.from('maintenance_requests').select('apartment_id').neq('status', 'handled');
      setRows(
        (data ?? []).map((m) => ({
          id: m.apartment_id,
          name: (m.apartments as unknown as { name: string } | null)?.name ?? '',
          open: (open ?? []).filter((r) => r.apartment_id === m.apartment_id).length,
        })),
      );
    })();
  }, [session]);

  if (!rows) return <Loading />;
  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.id}
      ListEmptyComponent={<Text style={styles.empty}>{t('landlord.empty')}</Text>}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={[styles.badge, item.open > 0 && styles.badgeOpen]}>{item.open}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderColor: '#eee' },
  name: { fontSize: 17 },
  badge: { minWidth: 28, textAlign: 'center', borderRadius: 14, paddingVertical: 2, backgroundColor: '#eee' },
  badgeOpen: { backgroundColor: '#f5b041' },
  empty: { padding: 24, textAlign: 'center', color: '#777' },
});
