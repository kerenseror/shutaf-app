import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

// Minimal shared UI. textAlign 'auto' / writingDirection follow the RTL setting.

export function Screen({ children }: { children: React.ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor="#999" {...props} style={[styles.input, props.style]} />;
}

export function Button({ label, onPress, busy, kind = 'primary', disabled }: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  kind?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  const off = busy || disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={[styles.button, kind === 'secondary' && styles.secondary, off && styles.disabled]}
    >
      {busy ? (
        <ActivityIndicator color={kind === 'primary' ? '#fff' : '#2b59c3'} />
      ) : (
        <Text style={[styles.buttonText, kind === 'secondary' && styles.secondaryText]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Loading() {
  return (
    <View style={[styles.screen, { alignItems: 'center' }]}>
      <ActivityIndicator size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'auto' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, fontSize: 16, textAlign: 'auto' },
  button: { backgroundColor: '#2b59c3', borderRadius: 12, padding: 14, alignItems: 'center' },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#2b59c3' },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryText: { color: '#2b59c3' },
});
