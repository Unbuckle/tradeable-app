import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Printing, Schemas } from './api';
import { marketPrice } from './catalog';
import { Chips } from './Chips';
import { imageUrl } from './images';
import { wantedFinish } from './scan-rules';
import { Sheet } from './Sheet';
import { colors, styles } from './theme';

/** What a scan found and how it will be added. */
export interface Pick {
  /** Best first. */
  candidates: Printing[];
  chosen: number;
  /** The ★ (true) or dot (false) the phone read on the card, if any. */
  foilMark: boolean | null;
  finish: string;
  language: string;
  condition: number;
  quantity: number;
}

const unique = (values: string[]) => [...new Set(values)].map((v) => ({ key: v, label: v === 'foil' ? '★ Foil' : v.toUpperCase() }));

/** Normal mode: the best match large, the other candidates to tap instead, and one button to add. */
export function ResultSheet(props: {
  pick: Pick;
  onChange: (pick: Pick) => void;
  conditions: Schemas['CatalogReferenceItem'][];
  preferFoil: boolean;
  targetName: string;
  busy: boolean;
  onAdd: () => void;
  onSearch: () => void;
  onClose: () => void;
}) {
  const { pick } = props;
  const printing = pick.candidates[pick.chosen];
  const [priced, setPriced] = useState<{ id: string; cents: number | null } | null>(null);
  useEffect(() => {
    marketPrice(printing).then((cents) => setPriced({ id: printing.id, cents }));
  }, [printing]);
  const price = priced?.id === printing.id ? priced.cents : null;

  const singles = printing.skus.filter((s) => s.category === 'single' && s.is_active);
  const set = (change: Partial<Pick>) => props.onChange({ ...pick, ...change });
  const choose = (index: number) =>
    set({ chosen: index, finish: wantedFinish(pick.candidates[index].skus, props.preferFoil, pick.foilMark) });

  return (
    <Sheet>
      <View style={[styles.row, { alignItems: 'flex-start', gap: 14 }]}>
        <Image
          source={imageUrl(printing.images.front?.normal)}
          style={{ width: 110, height: 154, borderRadius: 8, borderWidth: 2, borderColor: colors.green, backgroundColor: colors.mauve }}
          contentFit="cover"
          accessibilityLabel={printing.product_name}
        />
        <View style={{ flex: 1, gap: 6 }}>
          {pick.chosen === 0 && (
            <Text style={[styles.chip, { alignSelf: 'flex-start', color: colors.green, backgroundColor: 'rgba(94,252,141,0.15)' }]}>
              Best match
            </Text>
          )}
          <Text style={[styles.text, { fontSize: 20, fontWeight: '700' }]}>{printing.product_name}</Text>
          <Text style={styles.muted}>
            {[
              `${printing.set_code.toUpperCase()} ${printing.collector_number ?? ''}`,
              printing.rarity ? printing.rarity[0].toUpperCase() + printing.rarity.slice(1) : null,
              // shortcut: market prices are taken to be in euros, the platform's currency; read the currency once the API sends it.
              price !== null ? `€${(price / 100).toFixed(2)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Pressable onPress={props.onClose} accessibilityRole="button" style={{ alignSelf: 'flex-start' }}>
            <Text style={styles.muted}>Skip</Text>
          </Pressable>
        </View>
      </View>

      <Chips items={unique(singles.map((s) => s.finish ?? 'nonfoil'))} selected={pick.finish} onSelect={(finish) => set({ finish })} />
      <Chips
        items={props.conditions.map((c) => ({ key: String(c.id), label: c.code }))}
        selected={String(pick.condition)}
        onSelect={(id) => set({ condition: Number(id) })}
      />
      <Chips items={unique(singles.map((s) => s.language))} selected={pick.language} onSelect={(language) => set({ language })} />

      {pick.candidates.length > 1 && (
        <View style={[styles.row, { flexWrap: 'wrap' }]}>
          {pick.candidates.map((p, i) =>
            i === pick.chosen ? null : (
              <Pressable
                key={p.id}
                onPress={() => choose(i)}
                accessibilityRole="button"
                style={[styles.card, styles.row, { padding: 8, flexGrow: 1, flexBasis: '45%' }]}
              >
                <Image source={imageUrl(p.images.front?.small)} style={{ width: 28, height: 39, borderRadius: 4, backgroundColor: colors.mauve }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.text, { fontWeight: '700' }]}>
                    {p.set_code.toUpperCase()} {p.collector_number}
                  </Text>
                  <Text style={styles.muted} numberOfLines={1}>
                    {p.set_name}
                  </Text>
                </View>
              </Pressable>
            ),
          )}
        </View>
      )}

      <View style={[styles.row, { justifyContent: 'center' }]}>
        <Pressable style={styles.chip} disabled={pick.quantity <= 1} onPress={() => set({ quantity: pick.quantity - 1 })} accessibilityRole="button" accessibilityLabel="One fewer">
          <Text style={styles.text}>−</Text>
        </Pressable>
        <Text style={styles.text} accessibilityLabel={`Quantity ${pick.quantity}`}>
          {pick.quantity}×
        </Text>
        <Pressable style={styles.chip} onPress={() => set({ quantity: pick.quantity + 1 })} accessibilityRole="button" accessibilityLabel="One more">
          <Text style={styles.text}>+</Text>
        </Pressable>
      </View>

      <Pressable style={styles.button} disabled={props.busy || !singles.length} onPress={props.onAdd} accessibilityRole="button">
        <Text style={styles.buttonText}>
          Add {pick.quantity > 1 ? `${pick.quantity} ` : ''}to {props.targetName}
        </Text>
      </Pressable>
      <Pressable onPress={props.onSearch} accessibilityRole="button" style={{ alignItems: 'center' }}>
        <Text style={styles.muted}>Not right? Search by name</Text>
      </Pressable>
    </Sheet>
  );
}
