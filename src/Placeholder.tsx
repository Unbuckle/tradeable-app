import { Text, View } from 'react-native';
import { styles } from './theme';

export function Placeholder({ title }: { title: string }) {
  return (
    <View style={[styles.pad, { flex: 1 }]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.muted}>Coming later. Use tradeable.cards on the web for now.</Text>
    </View>
  );
}
