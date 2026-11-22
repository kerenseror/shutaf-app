import { DateTimeField } from '@/components/DateTimeField';
import { Button, Input, Loading } from '@/components/ui';
import {
  approvalProgress,
  buildPeriod,
  CalendarEvent,
  canCancel,
  EventType,
  myAction,
  parseRange,
  Period,
  validateRequest,
} from '@/domain';
import { useSession } from '@/lib/session';
import { colors, radius, shadow } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import type { PostgrestError } from '@supabase/supabase-js';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

// US-19 – US-23: book events in the apartment. All rules are enforced by the
// RPCs in the init migration (request_event, respond_event, cancel_event).

interface Row extends CalendarEvent {
  type: EventType;
  title: string | null;
  period: Period;
  all_day: boolean;
  decision_deadline: string;
}

const EVENT_TYPES: EventType[] = ['guests', 'party', 'shabbat_big'];

export default function Calendar() {
  const { aptId } = useLocalSearchParams<{ aptId: string }>();
  const { session } = useSession();
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-US' : 'he-IL';

  const [rows, setRows] = useState<Row[] | null>(null);
  const [partners, setPartners] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);

  const friendlyError = (error: PostgrestError) =>
    error.code === '23P01' ? t('calendar.errors.overlap') : error.message;

  const load = useCallback(async () => {
    const [events, members, profiles] = await Promise.all([
      supabase
        .from('events')
        .select('id, type, title, period, all_day, status, decision_deadline, requester_id, event_responses(user_id, response)')
        .eq('apartment_id', aptId)
        .in('status', ['pending', 'approved']),
      supabase.from('memberships').select('user_id').eq('apartment_id', aptId).eq('role', 'partner').is('left_at', null),
      supabase.from('profiles').select('id, display_name'),
    ]);
    if (events.error) return Alert.alert(t('common.error'), events.error.message);

    const now = new Date();
    setRows(
      (events.data ?? [])
        .map((e: any) => ({ ...e, period: parseRange(e.period), responses: e.event_responses ?? [] }) as Row)
        .filter((e) => e.period.end > now)
        .sort((a, b) => a.period.start.getTime() - b.period.start.getTime()),
    );
    setPartners((members.data ?? []).map((m) => m.user_id));
    setNames(Object.fromEntries((profiles.data ?? []).map((p) => [p.id, p.display_name || '…'])));
  }, [aptId, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function rpc(name: string, args: Record<string, unknown>) {
    const { error } = await supabase.rpc(name, args);
    if (error) {
      Alert.alert(t('common.error'), friendlyError(error));
      return false;
    }
    await load();
    return true;
  }

  function confirmCancel(id: string) {
    Alert.alert(t('calendar.cancelEvent'), t('calendar.cancelConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('calendar.cancelEvent'), style: 'destructive', onPress: () => rpc('cancel_event', { ev: id }) },
    ]);
  }

  if (!rows || !session) return <Loading />;
  const me = session.user.id;

  const dayText = (d: Date) => d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const timeText = (d: Date) => d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  const whenText = (e: Row) =>
    e.all_day ? t('calendar.allDay') : `${timeText(e.period.start)}–${timeText(e.period.end)}`;

  return (
    <View style={styles.screen}>
      <FlatList
        data={rows}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>{t('calendar.empty')}</Text>}
        renderItem={({ item: e, index }) => {
          const action = myAction(e, me, partners);
          const progress = approvalProgress(e, partners);
          const newDay = index === 0 || dayText(rows[index - 1].period.start) !== dayText(e.period.start);
          return (
            <View>
              {newDay && <Text style={styles.day}>{dayText(e.period.start)}</Text>}
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.type}>{t(`calendar.types.${e.type}`)}</Text>
                  <Text style={[styles.chip, e.status === 'approved' ? styles.chipOk : styles.chipWait]}>
                    {e.status === 'approved' ? t('calendar.approved') : t('calendar.pending', progress)}
                  </Text>
                </View>
                {!!e.title && <Text style={styles.title}>{e.title}</Text>}
                <Text style={styles.meta}>{whenText(e)}</Text>
                <Text style={styles.meta}>
                  {t('calendar.requestedBy', { name: e.requester_id === me ? t('home.you') : names[e.requester_id] ?? '…' })}
                </Text>
                {e.status === 'pending' && (
                  <Text style={styles.deadline}>
                    {t('calendar.autoApprove', {
                      when: `${dayText(new Date(e.decision_deadline))} ${timeText(new Date(e.decision_deadline))}`,
                    })}
                  </Text>
                )}

                {action === 'respond' && (
                  <View style={styles.actions}>
                    <View style={styles.flex}>
                      <Button label={t('calendar.approve')} onPress={() => rpc('respond_event', { ev: e.id, response: 'approve' })} />
                    </View>
                    <View style={styles.flex}>
                      <Button label={t('calendar.reject')} kind="secondary" onPress={() => setRejecting(e.id)} />
                    </View>
                  </View>
                )}
                {action === 'answered' && <Text style={styles.answered}>{t('calendar.answered')}</Text>}
                {canCancel(e, me) && (
                  <Pressable onPress={() => confirmCancel(e.id)}>
                    <Text style={styles.cancel}>{t('calendar.cancelEvent')}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        }}
      />

      <Pressable style={styles.fab} onPress={() => setCreating(true)} accessibilityLabel={t('calendar.newEvent')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      <NewEventModal
        visible={creating}
        onClose={() => setCreating(false)}
        onSubmit={async (args) => {
          const ok = await rpc('request_event', { apt: aptId, ...args });
          if (ok) setCreating(false);
        }}
      />

      <RejectModal
        visible={rejecting !== null}
        onClose={() => setRejecting(null)}
        onSubmit={async (reason) => {
          const ok = await rpc('respond_event', { ev: rejecting, response: 'reject', reason });
          if (ok) setRejecting(null);
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------

function nextRoundHour(offsetHours: number) {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + offsetHours);
  return d;
}

function NewEventModal({ visible, onClose, onSubmit }: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (args: { type: EventType; starts: string; ends: string; all_day: boolean; title: string | null }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState<EventType>('guests');
  const [day, setDay] = useState(() => new Date());
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState(() => nextRoundHour(1));
  const [end, setEnd] = useState(() => nextRoundHour(3));
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const period = buildPeriod(day, start, end, allDay);
    const problem = validateRequest(period);
    if (problem) return Alert.alert(t('common.error'), t(`calendar.errors.${problem}`));
    setBusy(true);
    await onSubmit({
      type,
      starts: period.start.toISOString(),
      ends: period.end.toISOString(),
      all_day: allDay,
      title: title.trim() || null,
    });
    setBusy(false);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t('calendar.newEvent')}</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.close}>{t('common.cancel')}</Text>
            </Pressable>
          </View>

          <View style={styles.types}>
            {EVENT_TYPES.map((value) => (
              <Pressable key={value} onPress={() => setType(value)} style={[styles.typeChip, type === value && styles.typeChipOn]}>
                <Text style={[styles.typeChipText, type === value && styles.typeChipTextOn]}>{t(`calendar.types.${value}`)}</Text>
              </Pressable>
            ))}
          </View>

          <DateTimeField label={t('calendar.day')} mode="date" value={day} onChange={setDay} minimumDate={new Date()} />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('calendar.allDay')}</Text>
            <Switch value={allDay} onValueChange={setAllDay} />
          </View>
          {!allDay && (
            <>
              <DateTimeField label={t('calendar.from')} mode="time" value={start} onChange={setStart} />
              <DateTimeField label={t('calendar.to')} mode="time" value={end} onChange={setEnd} />
            </>
          )}

          <Text style={styles.fieldLabel}>{t('calendar.titleLabel')}</Text>
          <Input value={title} onChangeText={setTitle} placeholder={t('calendar.titlePlaceholder')} maxLength={80} />

          <Text style={styles.hint}>{t('calendar.hint')}</Text>
          <Button label={t('calendar.submit')} onPress={submit} busy={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function RejectModal({ visible, onClose, onSubmit }: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onShow={() => setReason('')}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.dialog}>
          <Text style={styles.sheetTitle}>{t('calendar.rejectTitle')}</Text>
          <Input value={reason} onChangeText={setReason} placeholder={t('calendar.rejectPlaceholder')} multiline autoFocus />
          <Button
            label={t('calendar.rejectSubmit')}
            busy={busy}
            disabled={!reason.trim()}
            onPress={async () => {
              setBusy(true);
              await onSubmit(reason.trim());
              setBusy(false);
            }}
          />
          <Button label={t('common.cancel')} kind="secondary" onPress={onClose} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, paddingBottom: 96, gap: 10 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 48, fontSize: 16, lineHeight: 24 },
  day: { fontSize: 15, fontWeight: '700', color: colors.textMuted, marginTop: 8, marginBottom: 6, textAlign: 'auto' },
  card: { ...shadow, backgroundColor: colors.card, borderRadius: radius.card, padding: 14, gap: 4, borderWidth: 1, borderColor: colors.border },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  type: { fontSize: 17, fontWeight: '700' },
  chip: { fontSize: 12, fontWeight: '600', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  chipOk: { backgroundColor: colors.positiveSoft, color: colors.positive },
  chipWait: { backgroundColor: colors.warningSoft, color: colors.warning },
  title: { fontSize: 15, textAlign: 'auto' },
  meta: { fontSize: 14, color: colors.textMuted, textAlign: 'auto' },
  deadline: { fontSize: 12, color: colors.textFaint, marginTop: 2, textAlign: 'auto' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  answered: { marginTop: 8, color: colors.positive, fontWeight: '600', textAlign: 'auto' },
  cancel: { marginTop: 10, color: colors.negative, fontWeight: '600', textAlign: 'auto' },
  fab: {
    position: 'absolute', bottom: 24, end: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 30, lineHeight: 32, fontWeight: '400' },
  sheet: { padding: 20, gap: 10 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sheetTitle: { fontSize: 20, fontWeight: '800', textAlign: 'auto' },
  close: { color: colors.brand, fontSize: 16 },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  typeChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  typeChipText: { fontSize: 14 },
  typeChipTextOn: { color: '#fff', fontWeight: '600' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  switchLabel: { fontSize: 16 },
  fieldLabel: { fontSize: 15, fontWeight: '600', marginTop: 6, textAlign: 'auto' },
  hint: { fontSize: 13, color: colors.textMuted, lineHeight: 19, textAlign: 'auto' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: colors.card, borderRadius: radius.sheet, padding: 18, gap: 12 },
});
