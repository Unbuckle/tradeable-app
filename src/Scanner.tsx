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
        const read = await snap();
        if (stopped) return;
        const readable = read && (read.setCode || read.name);
        if (readable && !(ignored.current && sameCard(read, ignored.current))) {
          if (previous && sameCard(read, previous)) return void recognise(read);
          previous = read;
        } else {
          previous = null;
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
      const item = await addToCollection(skuId, prefs.condition, prefs.folderId);
      setAdded((list) => [{ item, undone: false }, ...list]);
      setPrinting(null);
      setChoices([]);
      setNumber('');
      setName('');
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
            <View style={{ height: 360, borderRadius: 12, overflow: 'hidden' }}>
              <CameraView ref={camera} style={{ flex: 1 }} facing="back" animateShutter={false} />
            </View>
            <Text style={styles.muted}>
              {looking ? 'Hold the whole card in the frame, upright. It scans by itself.' : 'Paused while a card is shown.'}
            </Text>
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
          {folderList.length > 0 && (
            <Chips
              items={[{ key: '', label: 'No folder' }, ...folderList.map((f) => ({ key: f.id, label: f.name }))]}
              selected={prefs.folderId ?? ''}
              onSelect={(id) => setPrefs((p) => ({ ...p, folderId: id || null }))}
            />
          )}
          <Pressable style={styles.button} disabled={!!busy || !skuId} onPress={add} accessibilityRole="button">
            <Text style={styles.buttonText}>Add to collection</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.secondary]} disabled={!!busy} onPress={skip} accessibilityRole="button">
            <Text style={styles.buttonText}>Skip, scan the next card</Text>
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
