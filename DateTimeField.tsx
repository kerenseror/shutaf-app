import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  label: string;
  value: Date;
  mode: 'date' | 'time';
  onChange: (value: Date) => void;
  minimumDate?: Date;
}

/** A date or time field. iOS shows the native compact picker; Android opens the system dialog on tap. */
export function DateTimeField({ label, value, mode, onChange, minimumDate }: Props) {
  const { i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-US' : 'he-IL';
  const text =
    mode === 'date'
      ? value.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
      : value.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {Platform.OS === 'ios' ? (
        <DateTimePicker
          value={value}
          mode={mode}
          display="compact"
          locale={locale}
          minimumDate={minimumDate}
          minuteInterval={15}
          onChange={(_, d) => d && onChange(d)}
        />
      ) : (
        <Pressable
          style={styles.androidValue}
          onPress={() =>
            DateTimePickerAndroid.open({
              value,
              mode,
              is24Hour: true,
              minimumDate,
              onChange: (_, d) => d && onChange(d),
            })
          }
        >
          <Text style={styles.androidText}>{text}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  label: { fontSize: 16 },
  androidValue: { backgroundColor: '#f0f2f7', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  androidText: { fontSize: 16 },
});
