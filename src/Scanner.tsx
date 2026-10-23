import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { API_URL, ApiError, type CollectionItem, type Printing, type Schemas } from './api';
import { addToCollection, conditions, findPrinting, pickSku, type Preferences, undoAdd } from './catalog';
import { parseCollectorLine } from './collector-line';
import { canReadText, readText } from './text-recognition';
import { colors, styles } from './theme';

interface Added {
  item: CollectionItem;
  undone: boolean;
}

const imageUrl = (url?: string) => (url && !/^https?:/.test(url) ? `${API_URL}${url}` : url);

export function Scanner({ onSignedOut }: { onSignedOut: () => void }) {
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [setCode, setSetCode] = useState('');
  const [number, setNumber] = useState('');
  const [printing, setPrinting] = useState<Printing | null>(null);
  const [skuId, setSkuId] = useState<string | null>(null);
  // Condition, finish and language stay set between scans.
  const [prefs, setPrefs] = useState<Preferences>({ condition: 1, finish: 'nonfoil', language: 'en' });
  const [conditionList, setConditionList] = useState<Schemas['CatalogReferenceItem'][]>([]);
  const [added, setAdded] = useState<Added[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(label: string, work: () => Promise<void>) {
    setBusy(label);
    setMessage(null);
    try {
      await work();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return onSignedOut();
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    conditions().then(setConditionList, (e: Error) => setMessage(e.message));
  }, []);

  async function lookUp(code: string, collectorNumber: string, wanted: Preferences) {
    setPrinting(null);
    const found = await findPrinting(code, collectorNumber);
    setPrinting(found);
    setSkuId(pickSku(found.skus, wanted)?.id ?? null);
  }

  const scan = () =>
    run('Reading card', async () => {
      const photo = await camera.current?.takePictureAsync({ quality: 0.8 });
      if (!photo) return;
      const line = parseCollectorLine(await readText(photo.uri));
      if (!line.setCode || !line.collectorNumber) {
        if (line.collectorNumber) setNumber(line.collectorNumber);
        throw new Error('Could not read the set code and number. Type them in, or try again closer.');
      }
      const wanted = {
        ...prefs,
        ...(line.language ? { language: line.language } : {}),
        ...(line.foil !== null ? { finish: line.foil ? 'foil' : 'nonfoil' } : {}),
      };
      setSetCode(line.setCode);
      setNumber(line.collectorNumber);
      setPrefs(wanted);
      await lookUp(line.setCode, line.collectorNumber, wanted);
    });

  const add = () =>
    run('Adding', async () => {
      if (!skuId) return;
      const item = await addToCollection(skuId, prefs.condition);
      setAdded((list) => [{ item, undone: false }, ...list]);
      setPrinting(null);
      setNumber('');
    });

  const undo = (entry: Added) =>
    run('Undoing', async () => {
      await undoAdd(entry.item);
      setAdded((list) => list.map((e) => (e === entry ? { ...e, undone: true } : e)));
    });

  const count = added.filter((e) => !e.undone).length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.pad, { paddingTop: 56 }]}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text style={styles.title}>
          tradeable<Text style={styles.dot}>.</Text>
        </Text>
        <Pressable onPress={onSignedOut} accessibilityRole="button">
          <Text style={styles.muted}>Sign out</Text>
        </Pressable>
      </View>
      <Text style={styles.text}>{count} added this session</Text>

      {canReadText ? (
        permission?.granted ? (
          <>
            <View style={{ height: 180, borderRadius: 12, overflow: 'hidden' }}>
              <CameraView ref={camera} style={{ flex: 1 }} facing="back" />
            </View>
            <Text style={styles.muted}>Fill the frame with the bottom-left corner: set code and number.</Text>
            <Pressable style={styles.button} disabled={!!busy} onPress={scan} accessibilityRole="button">
              <Text style={styles.buttonText}>Scan</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={styles.button} onPress={requestPermission} accessibilityRole="button">
            <Text style={styles.buttonText}>Allow camera</Text>
          </Pressable>
        )
      ) : (
        <Text style={styles.muted}>Camera scanning needs the development build. Type the set code and number.</Text>
      )}

      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Set (MH3)"
          placeholderTextColor="#9A8FA3"
          autoCapitalize="characters"
          autoCorrect={false}
          value={setCode}
          onChangeText={setSetCode}
        />
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Number"
          placeholderTextColor="#9A8FA3"
          autoCapitalize="none"
          autoCorrect={false}
          value={number}
          onChangeText={setNumber}
        />
        <Pressable
          style={[styles.button, styles.secondary, { paddingHorizontal: 16 }]}
          disabled={!!busy || !setCode || !number}
          onPress={() => run('Looking up', () => lookUp(setCode, number, prefs))}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Find</Text>
        </Pressable>
      </View>

      {busy && <Text style={styles.muted}>{busy}…</Text>}
      {message && <Text style={styles.error}>{message}</Text>}

      {printing && (
        <View style={{ gap: 10 }}>
          <View style={styles.row}>
            <Image
              source={imageUrl(printing.images.front?.normal)}
              style={{ width: 120, height: 168, borderRadius: 8, backgroundColor: colors.mauve }}
              contentFit="cover"
              accessibilityLabel={printing.product_name}
            />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.text, { fontWeight: '700' }]}>{printing.product_name}</Text>
              <Text style={styles.muted}>
                {printing.set_name} · {printing.set_code.toUpperCase()} {printing.collector_number}
              </Text>
            </View>
          </View>
          <Chips
            items={printing.skus
              .filter((s) => s.category === 'single' && s.is_active)
              .map((s) => ({ key: s.id, label: `${s.finish ?? 'nonfoil'} · ${s.language}` }))}
            selected={skuId}
            onSelect={(id) => {
              const sku = printing.skus.find((s) => s.id === id);
              setSkuId(id);
              if (sku) setPrefs((p) => ({ ...p, finish: sku.finish ?? 'nonfoil', language: sku.language }));
            }}
          />
          <Chips
            items={conditionList.map((c) => ({ key: String(c.id), label: c.code }))}
            selected={String(prefs.condition)}
            onSelect={(id) => setPrefs((p) => ({ ...p, condition: Number(id) }))}
          />
          <Pressable style={styles.button} disabled={!!busy || !skuId} onPress={add} accessibilityRole="button">
            <Text style={styles.buttonText}>Add to collection</Text>
          </Pressable>
        </View>
      )}

      {added.map((entry) => (
        <View key={`${entry.item.id}-${added.indexOf(entry)}`} style={[styles.row, { justifyContent: 'space-between' }]}>
          <Text style={[styles.text, { flex: 1 }, entry.undone && { textDecorationLine: 'line-through', opacity: 0.5 }]}>
            {entry.item.card ? `${entry.item.card.display_name} · ${entry.item.card.set_code.toUpperCase()} ${entry.item.card.collector_number ?? ''}` : 'Card'}
          </Text>
          {!entry.undone && (
            <Pressable onPress={() => undo(entry)} disabled={!!busy} accessibilityRole="button">
              <Text style={{ color: colors.green }}>Undo</Text>
            </Pressable>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

function Chips(props: { items: { key: string; label: string }[]; selected: string | null; onSelect: (key: string) => void }) {
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
