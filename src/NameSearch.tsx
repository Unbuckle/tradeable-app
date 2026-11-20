import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { Printing, Schemas } from './api';
import { printingsOfCard, searchCards } from './catalog';
import { Chips } from './Chips';
import { Sheet } from './Sheet';
import { colors, styles } from './theme';

/** Find a card by name when the camera got it wrong; hands back its printings, newest set first. */
export function NameSearch(props: { onPicked: (printings: Printing[]) => void; onCancel: () => void; onError: (e: unknown) => void }) {
  const [name, setName] = useState('');
  const [hits, setHits] = useState<Schemas['SearchCatalogHit'][] | null>(null);
  const [busy, setBusy] = useState(false);

  const work = (job: () => Promise<void>) => {
    setBusy(true);
    job()
      .catch(props.onError)
      .finally(() => setBusy(false));
  };
  const search = () => work(async () => setHits(await searchCards(name)));
  const pickCard = (productId: string) =>
    work(async () => {
      const printings = await printingsOfCard(productId);
      if (printings.length) props.onPicked(printings);
    });

  return (
    <Sheet>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text style={[styles.text, { fontWeight: '700' }]}>Search by name</Text>
        <Pressable onPress={props.onCancel} accessibilityRole="button">
          <Text style={{ color: colors.green }}>Cancel</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Card name"
          placeholderTextColor="#9A8FA3"
          autoCorrect={false}
          autoFocus
          value={name}
          onChangeText={setName}
          onSubmitEditing={search}
          returnKeyType="search"
        />
        <Pressable
          style={[styles.button, styles.secondary, { paddingHorizontal: 16 }]}
          disabled={busy || name.trim().length < 2}
          onPress={search}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Search</Text>
        </Pressable>
      </View>
      {busy && <Text style={styles.muted}>Searching…</Text>}
      {hits?.length === 0 && <Text style={styles.muted}>No card named “{name.trim()}”.</Text>}
      {!!hits?.length && (
        <Chips items={hits.map((h) => ({ key: h.product_id, label: h.canonical_name }))} selected={null} onSelect={pickCard} />
      )}
    </Sheet>
  );
}
