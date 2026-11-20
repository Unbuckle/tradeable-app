import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { colors } from './theme';

/** A panel that rises from the bottom of the screen above its content, with a grab handle. */
export function Sheet({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: '85%',
        backgroundColor: colors.plum,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
      }}
    >
      <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.mauve, marginTop: 8 }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}
