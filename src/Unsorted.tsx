import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { type CollectionItem, type Schemas } from './api';
import { moveItems, unfiledItems } from './catalog';
import { Chips } from './Chips';
import { imageUrl } from './images';
import { colors, styles } from './theme';

/** Sorting later: pick scanned cards from Unsorted and move them into a folder. */
export function Unsorted(props: { folders: Schemas['CollectionFolder'][]; onClose: () => void; onError: (e: unknown) => void }) {
  const [items, setItems] = useState<CollectionItem[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => unfiledItems().then(setItems, props.onError);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  useEffect(() => void load(), []);

  const flip = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const move = async (folderId: string) => {
    setBusy(true);
    try {
      await moveItems([...selected], folderId);
      setSelected(new Set());
      setChoosing(false);
      await load();
    } catch (e) {
      props.onError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.pad, { paddingTop: 56 }]}>
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Back">
            <Text style={{ color: colors.green, fontSize: 16 }}>‹ Back</Text>
          </Pressable>
          <Text style={[styles.text, { fontWeight: '700', fontSize: 20 }]}>Unsorted{items ? ` · ${items.length}` : ''}</Text>
          <Pressable
            onPress={() => setSelected(new Set(items?.map((i) => i.id)))}
            accessibilityRole="button"
            disabled={!items?.length}
          >
            <Text style={styles.muted}>Select all</Text>
          </Pressable>
        </View>
        {items?.length === 0 && <Text style={styles.muted}>Nothing waiting. Scanned cards sent to Unsorted show up here.</Text>}
        {items?.map((item) => {
          const on = selected.has(item.id);
          return (
            <Pressable
              key={item.id}
              onPress={() => flip(item.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={[styles.card, styles.row, { gap: 12, padding: 10 }]}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 5,
                  borderWidth: 2,
                  borderColor: on ? colors.green : colors.muted,
                  backgroundColor: on ? colors.green : 'transparent',
                }}
              />
              <Image
                source={imageUrl(item.card?.images.front?.small)}
                style={{ width: 32, height: 44, borderRadius: 4, backgroundColor: colors.mauve }}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.text}>{item.card?.display_name ?? 'Card'}</Text>
                <Text style={styles.muted}>
                  {item.card ? `${item.card.set_code.toUpperCase()} ${item.card.collector_number ?? ''}` : ''}
                  {item.card?.finish === 'foil' ? ' ★' : ''} · {item.card?.language.toUpperCase()}
                  {item.total_quantity > 1 ? ` · ${item.total_quantity}×` : ''}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      {selected.size > 0 && (
        <View style={[styles.pad, { backgroundColor: colors.plum }]}>
          {choosing ? (
            <>
              <Text style={styles.text}>Move {selected.size} to…</Text>
              {props.folders.length ? (
                <Chips items={props.folders.map((f) => ({ key: f.id, label: f.name }))} selected={null} onSelect={move} />
              ) : (
                <Text style={styles.muted}>You have no folders yet. Make one on tradeable.cards.</Text>
              )}
            </>
          ) : (
            <Pressable style={styles.button} disabled={busy} onPress={() => setChoosing(true)} accessibilityRole="button">
              <Text style={styles.buttonText}>Move {selected.size} to…</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
