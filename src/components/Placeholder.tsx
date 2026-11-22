import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

/** Temporary screen for modules that are scheduled for later weeks. */
export function Placeholder({ title, description, week }: { title: string; description: string; week: number }) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <Text style={styles.badge}>
        {t('common.comingSoon')} · W{week}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  description: { fontSize: 15, color: '#555', textAlign: 'center' },
  badge: { marginTop: 8, fontSize: 13, color: '#888' },
});
