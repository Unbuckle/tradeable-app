import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import type { Schemas } from './api';
import { Sheet } from './Sheet';
import { colors, styles } from './theme';

/** Where the cards of a batch go: a folder, or Unsorted (`folderId: null`, the collection's unfiled area). */
export interface Target {
  folderId: string | null;
  name: string;
}

/** "Where should this batch go?": Unsorted, the last used folder, a few others, or the full list. */
export function BatchSheet(props: {
  folders: Schemas['CollectionFolder'][];
  lastFolderId: string | null;
  current: Target | undefined;
  onChoose: (target: Target) => void;
}) {
  const [all, setAll] = useState(false);
  const last = props.folders.find((f) => f.id === props.lastFolderId);
  const others = props.folders.filter((f) => f !== last);
  const shown = all ? others : others.slice(0, 3);
  const option = (target: Target, hint?: string) => {
    const on = (props.current?.folderId ?? null) === target.folderId; // Unsorted until chosen
    return (
      <Pressable
        key={target.folderId ?? 'unfiled'}
        onPress={() => props.onChoose(target)}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        style={[styles.card, on && { borderWidth: 2, borderColor: colors.green }]}
      >
        <Text style={styles.text}>{target.name}</Text>
        {hint && <Text style={styles.muted}>{hint}</Text>}
      </Pressable>
    );
  };
  return (
    <Sheet>
      <Text style={[styles.text, { fontSize: 20, fontWeight: '700' }]}>Where should this batch go?</Text>
      {option({ folderId: null, name: 'Unsorted' }, 'Sort later, on the phone or the website')}
      {last && option({ folderId: last.id, name: last.name }, 'Last used')}
      {shown.map((f) => option({ folderId: f.id, name: f.name }))}
      {!all && others.length > shown.length && (
        <Pressable onPress={() => setAll(true)} accessibilityRole="button" style={styles.card}>
          <Text style={styles.text}>Choose another binder or deck box…</Text>
        </Pressable>
      )}
    </Sheet>
  );
}
