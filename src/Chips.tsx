import { Pressable, Text, View } from 'react-native';
import { styles } from './theme';

export function Chips(props: { items: { key: string; label: string }[]; selected: string | null; onSelect: (key: string) => void }) {
  return (
    <View style={[styles.row, { flexWrap: 'wrap' }]}>
      {props.items.map((item) => (
        <Pressable
          key={item.key}
          style={[styles.chip, item.key === props.selected && styles.chipOn]}
          onPress={() => props.onSelect(item.key)}
          accessibilityRole="button"
          accessibilityState={{ selected: item.key === props.selected }}
        >
          <Text style={styles.text}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
