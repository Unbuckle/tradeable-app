import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { Schemas } from './api';
import { unfiledCount } from './catalog';
import { colors, styles } from './theme';

/** The collection tab: the Unsorted row (scanned cards waiting) and the folders with their counts. */
export function Collection({ folders, onSort }: { folders: Schemas['CollectionFolder'][]; onSort: () => void }) {
  const [unsorted, setUnsorted] = useState<number | null>(null);
  useEffect(() => {
    unfiledCount().then(setUnsorted, () => setUnsorted(null));
  }, []);
  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Text style={[styles.text, { fontSize: 20, fontWeight: '700' }]}>Collection</Text>
      <Pressable style={[styles.card, styles.row, { justifyContent: 'space-between' }]} onPress={onSort} accessibilityRole="button">
        <View>
          <Text style={styles.text}>Unsorted</Text>
          <Text style={styles.muted}>{unsorted === null ? 'Scanned cards waiting' : `${unsorted} scanned cards waiting`}</Text>
        </View>
        <Text style={{ color: colors.green, fontWeight: '700' }}>Sort ›</Text>
      </Pressable>
      {folders.map((folder) => (
        <View key={folder.id} style={[styles.card, styles.row, { justifyContent: 'space-between' }]}>
          <Text style={styles.text}>{folder.name}</Text>
          <Text style={styles.muted}>{folder.item_count ?? ''}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
