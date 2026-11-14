import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { API_URL, ApiError, type CollectionItem, type Printing, type Schemas } from './api';
import {
  addToCollection,
  conditions,
  findPrinting,
  folders,
  pickSku,
  printingsOfCard,
  searchCards,
  type Preferences,
  undoAdd,
} from './catalog';
import { type CardRead, readCard, sameCard } from './card-reader';
import { canReadText, readLines } from './text-recognition';
import { colors, styles } from './theme';

interface Added {
  item: CollectionItem;
  quantity: number;
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
  // Condition, finish, language and folder stay set between scans.
  const [prefs, setPrefs] = useState<Preferences>({ condition: 1, finish: 'nonfoil', language: 'en', folderId: null });
  const [conditionList, setConditionList] = useState<Schemas['CatalogReferenceItem'][]>([]);
  const [folderList, setFolderList] = useState<Schemas['CollectionFolder'][]>([]);
  const [name, setName] = useState('');
  const [hits, setHits] = useState<Schemas['SearchCatalogHit'][]>([]);
  const [choices, setChoices] = useState<Printing[]>([]);
  const [added, setAdded] = useState<Added[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // The card the camera shows when we stop looking for it (found, added, skipped or not found):
  // auto-scan waits until a different card is in the frame.
  const ignored = useRef<CardRead | null>(null);
  // shortcut: shows what the last photo read, to tune scanning on a real phone; remove once scanning works.
  const [seen, setSeen] = useState('');
  const [locked, setLocked] = useState(false); // one read waits for a second, agreeing one
  const [torch, setTorch] = useState(false);
  const [quantity, setQuantity] = useState(1);

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
    folders().then(setFolderList, (e: Error) => setMessage(e.message));
  }, []);

  function show(found: Printing, wanted: Preferences) {
    setPrinting(found);
    setSkuId(pickSku(found.skus, wanted)?.id ?? null);
  }

  async function lookUp(code: string, collectorNumber: string, wanted: Preferences) {
    setPrinting(null);
    setHits([]);
    setChoices([]);
    show(await findPrinting(code, collectorNumber), wanted);
  }

  const search = () =>
    run('Searching', async () => {
      setPrinting(null);
      setChoices([]);
      const found = await searchCards(name);
      setHits(found);
      if (!found.length) throw new Error(`No card named "${name.trim()}"`);
    });

  const pickCard = (productId: string) =>
    run('Loading printings', async () => {
      const found = await printingsOfCard(productId);
      setHits([]);
      setChoices(found);
      if (found.length === 1) show(found[0], prefs);
    });

  /** One photo of what the camera shows, read on the device; null when nothing was readable. */
  async function snap(): Promise<CardRead | null> {
    try {
      const photo = await camera.current?.takePictureAsync({ quality: 0.7, shutterSound: false });
      return photo ? readCard(await readLines(photo.uri)) : null;
    } catch {
      return null; // camera not ready yet, or the photo had no text
    }
  }

  /** Finds the printing for a read: by set code and number, else by name (cards before 2014 print no set code). */
  const recognise = (read: CardRead) =>
    run('Looking up', async () => {
      ignored.current = read;
      const wanted = {
        ...prefs,
        ...(read.language ? { language: read.language } : {}),
        ...(read.foil !== null ? { finish: read.foil ? 'foil' : 'nonfoil' } : {}),
      };
      setPrefs(wanted);
      setSetCode(read.setCode ?? '');
      setNumber(read.collectorNumber ?? '');
      setName(read.name ?? '');
      if (read.setCode && read.collectorNumber) {
        try {
          return await lookUp(read.setCode, read.collectorNumber, wanted);
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 404) || !read.name) throw e;
        }
      }
      if (!read.name) throw new Error('Could not read this card. Search it by name.');
      const cards = await searchCards(read.name);
      const card = cards.find((c) => c.canonical_name.toLowerCase() === read.name?.toLowerCase()) ?? cards[0];
      if (!card) throw new Error(`No card named "${read.name}". Search it by name.`);
      const printings = await printingsOfCard(card.product_id);
      const exact = printings.find((p) => read.collectorNumber && p.collector_number === read.collectorNumber);
      setHits([]);
      setChoices(exact ? [] : printings);
      show(exact ?? printings[0], wanted);
    });

  // Auto-scan: while no card is shown, read a photo about every second and look up a card once two reads agree.
  const looking = canReadText && !!permission?.granted && !printing && !busy;
  useEffect(() => {
    if (!looking) return;
    let stopped = false;
    let previous: CardRead | null = null;
    (async () => {
      while (!stopped) {
        const started = Date.now();
        const read = await snap();
        if (stopped) return;
        setSeen(
          read
            ? `Read: ${read.name ?? '-'} · ${read.setCode ?? '-'} ${read.collectorNumber ?? '-'} (${Date.now() - started} ms)`
            : `Nothing read (${Date.now() - started} ms)`,
        );
        const readable = read && (read.setCode || read.name);
        if (readable && !(ignored.current && sameCard(read, ignored.current))) {
          if (previous && sameCard(read, previous)) {
            setLocked(false);
            return void recognise(read);
          }
          previous = read;
          setLocked(true);
        } else {
          previous = null;
          setLocked(false);
          if (!readable) ignored.current = null; // the card left the frame: the same card may be scanned again
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    })();
    return () => {
      stopped = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when looking starts or stops
  }, [looking]);

  const skip = () => {
    setPrinting(null);
    setChoices([]);
    setMessage(null);
  };

  const add = () =>
    run('Adding', async () => {
      if (!skuId) return;
      const item = await addToCollection(skuId, prefs.condition, prefs.folderId, quantity);
      setAdded((list) => [{ item, quantity, undone: false }, ...list]);
      setQuantity(1);
      setPrinting(null);
      setChoices([]);
      setNumber('');
      setName('');
    });

  const undo = (entry: Added) =>
    run('Undoing', async () => {
      await undoAdd(entry.item, entry.quantity);
      setAdded((list) => list.map((e) => (e === entry ? { ...e, undone: true } : e)));
    });

  const count = added.filter((e) => !e.undone).reduce((sum, e) => sum + e.quantity, 0);

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
            <View style={{ height: 440, borderRadius: 12, overflow: 'hidden' }}>
              <CameraView ref={camera} style={{ flex: 1 }} facing="back" animateShutter={false} enableTorch={torch} />
              {/* Card-shaped guide (63 x 88 mm); green while a card is locked on or being looked up. */}
              <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                <View
                  style={{
                    width: '72%',
                    aspectRatio: 63 / 88,
                    borderRadius: 14,
                    borderWidth: 3,
                    borderColor: locked || busy === 'Looking up' ? colors.green : 'rgba(255,255,255,0.85)',
                  }}
                />
              </View>
              <Pressable
                onPress={() => setTorch((on) => !on)}
                accessibilityRole="button"
                accessibilityLabel={torch ? 'Turn light off' : 'Turn light on'}
                style={[styles.chip, torch && styles.chipOn, { position: 'absolute', top: 10, left: 10 }]}
              >
                <Text style={styles.text}>Light</Text>
              </Pressable>
            </View>
            <Text style={styles.muted}>
              {looking ? 'Hold the whole card in the frame, upright. It scans by itself.' : 'Paused while a card is shown.'}
            </Text>
            {!!seen && <Text style={styles.muted}>{seen}</Text>}
          </>
        ) : (
          <Pressable style={styles.button} onPress={requestPermission} accessibilityRole="button">
            <Text style={styles.buttonText}>Allow camera</Text>
          </Pressable>
        )
      ) : (
        <Text style={styles.muted}>Camera scanning needs the development build. Type the set code and number.</Text>
      )}

      {busy && <Text style={styles.muted}>{busy}…</Text>}
      {message && <Text style={styles.error}>{message}</Text>}

      {hits.length > 0 && (
        <Chips
          items={hits.map((h) => ({ key: h.product_id, label: h.canonical_name }))}
          selected={null}
          onSelect={pickCard}
        />
      )}

      {choices.length > 1 && (
        <Chips
          items={choices.map((p) => ({ key: p.id, label: `${p.set_code.toUpperCase()} ${p.collector_number ?? ''}` }))}
          selected={printing?.id ?? null}
          onSelect={(id) => {
            const found = choices.find((p) => p.id === id);
            if (found) show(found, prefs);
          }}
        />
      )}

      {printing && (
        <View style={{ gap: 10 }}>
          <View style={styles.row}>
            <Image
              source={imageUrl(printing.images.front?.normal)}
              style={{ width: 160, height: 224, borderRadius: 8, backgroundColor: colors.mauve }}
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
          {(() => {
            const singles = printing.skus.filter((sku) => sku.category === 'single' && sku.is_active);
            const unique = (values: string[]) => [...new Set(values)].map((v) => ({ key: v, label: v }));
            const finishes = unique(singles.map((sku) => sku.finish ?? 'nonfoil'));
            const languages = unique(singles.map((sku) => sku.language));
            const current = singles.find((sku) => sku.id === skuId);
            // Choosing a finish or language picks the closest SKU and keeps the choice for the next scans.
            const choose = (change: Partial<Preferences>) => {
              const next = { ...prefs, ...change };
              setPrefs(next);
              setSkuId(pickSku(printing.skus, next)?.id ?? null);
            };
            return (
              <>
                {finishes.length > 1 && (
                  <Chips items={finishes} selected={current?.finish ?? 'nonfoil'} onSelect={(finish) => choose({ finish })} />
                )}
                {languages.length > 1 && (
                  <Chips items={languages} selected={current?.language ?? null} onSelect={(language) => choose({ language })} />
                )}
              </>
            );
          })()}
          <View style={styles.row}>
            <Pressable
              style={styles.chip}
              disabled={quantity <= 1}
              onPress={() => setQuantity((q) => q - 1)}
              accessibilityRole="button"
              accessibilityLabel="One fewer"
            >
              <Text style={styles.text}>−</Text>
            </Pressable>
            <Text style={styles.text} accessibilityLabel={`Quantity ${quantity}`}>
              {quantity}
            </Text>
            <Pressable style={styles.chip} onPress={() => setQuantity((q) => q + 1)} accessibilityRole="button" accessibilityLabel="One more">
              <Text style={styles.text}>+</Text>
            </Pressable>
          </View>
          <Chips
            items={conditionList.map((c) => ({ key: String(c.id), label: c.code }))}
            selected={String(prefs.condition)}
            onSelect={(id) => setPrefs((p) => ({ ...p, condition: Number(id) }))}
          />
          {folderList.length > 0 && (
            <Chips
              items={[{ key: '', label: 'No folder' }, ...folderList.map((f) => ({ key: f.id, label: f.name }))]}
              selected={prefs.folderId ?? ''}
              onSelect={(id) => setPrefs((p) => ({ ...p, folderId: id || null }))}
            />
          )}
          <Pressable style={styles.button} disabled={!!busy || !skuId} onPress={add} accessibilityRole="button">
            <Text style={styles.buttonText}>{quantity > 1 ? `Add ${quantity} to collection` : 'Add to collection'}</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.secondary]} disabled={!!busy} onPress={skip} accessibilityRole="button">
            <Text style={styles.buttonText}>Skip, scan the next card</Text>
          </Pressable>
        </View>
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

      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Card name"
          placeholderTextColor="#9A8FA3"
          autoCorrect={false}
          value={name}
          onChangeText={setName}
          onSubmitEditing={search}
          returnKeyType="search"
        />
        <Pressable
          style={[styles.button, styles.secondary, { paddingHorizontal: 16 }]}
          disabled={!!busy || name.trim().length < 2}
          onPress={search}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Search</Text>
        </Pressable>
      </View>

      {added.map((entry) => (
        <View key={`${entry.item.id}-${added.indexOf(entry)}`} style={[styles.row, { justifyContent: 'space-between' }]}>
          <Text style={[styles.text, { flex: 1 }, entry.undone && { textDecorationLine: 'line-through', opacity: 0.5 }]}>
            {entry.quantity > 1 ? `${entry.quantity}× ` : ''}{entry.item.card ? `${entry.item.card.display_name} · ${entry.item.card.set_code.toUpperCase()} ${entry.item.card.collector_number ?? ''}` : 'Card'}
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
