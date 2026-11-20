import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ApiError, type CollectionItem, type Printing, type Schemas } from './api';
import { type CardRead, readCard, sameCard } from './card-reader';
import { addToCollection, findPrinting, recognizePhoto, undoAdd } from './catalog';
import { NameSearch } from './NameSearch';
import { shrinkPhoto } from './photo';
import { type Pick, ResultSheet } from './ResultSheet';
import { BatchSheet, type Target } from './BatchSheet';
import { pickSku, type ScanSettings, defaultsSummary, wantedFinish } from './scan-rules';
import { loadLastFolder, saveLastFolder } from './settings';
import { Sheet } from './Sheet';
import { canReadText, readLines } from './text-recognition';
import { colors, styles } from './theme';

interface Added {
  item: CollectionItem;
  quantity: number;
  undone: boolean;
  /** The choice it was added from, for "Wrong?". */
  pick: Pick;
}

interface Photo {
  uri: string;
  width: number;
  height: number;
}

export function Scanner(props: {
  settings: ScanSettings;
  onSettingsChange: (settings: ScanSettings) => void;
  onOpenSettings: () => void;
  conditions: Schemas['CatalogReferenceItem'][];
  folders: Schemas['CollectionFolder'][];
  onSignedOut: () => void;
  /** Settings are open over the scanner: stop taking photos. */
  paused: boolean;
}) {
  const { settings, folders } = props;
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  // Where this batch goes: chosen on the sheet, else the one named in settings, else ask.
  const [chosenTarget, setChosenTarget] = useState<Target | undefined>();
  const settingsFolder = folders.find((f) => f.id === settings.batchTarget);
  const target: Target | undefined =
    chosenTarget ??
    (settings.batchTarget === 'unfiled'
      ? { folderId: null, name: 'Unsorted' }
      : settingsFolder && { folderId: settingsFolder.id, name: settingsFolder.name });
  const [changingTarget, setChangingTarget] = useState(false);
  const choosingTarget = changingTarget || !target;
  const [lastFolder, setLastFolder] = useState<string | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState<Added | null>(null);
  const [added, setAdded] = useState<Added[]>([]);
  const [showSession, setShowSession] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // The card the camera shows when we stop looking for it: auto-scan waits until a different card is in view.
  const ignored = useRef<CardRead | null>(null);

  useEffect(() => {
    loadLastFolder().then(setLastFolder);
  }, []);

  async function run(label: string, work: () => Promise<void>) {
    setBusy(label);
    setMessage(null);
    try {
      await work();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return props.onSignedOut();
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  /** The choice for these printings, best first, with the batch defaults and what the card itself showed. */
  function pickFor(candidates: Printing[], read: CardRead | null): Pick {
    const foilMark = read?.foil ?? null;
    return {
      candidates,
      chosen: 0,
      foilMark,
      finish: wantedFinish(candidates[0].skus, settings.preferFoil, foilMark),
      language: read?.language ?? settings.language,
      condition: settings.condition,
      quantity: 1,
    };
  }

  async function add(choice: Pick) {
    const printing = choice.candidates[choice.chosen];
    const sku = pickSku(printing.skus, choice);
    if (!sku || !target) throw new Error('This printing has no single card to add.');
    const item = await addToCollection(sku.id, choice.condition, target.folderId, choice.quantity);
    const entry = { item, quantity: choice.quantity, undone: false, pick: choice };
    setAdded((list) => [entry, ...list]);
    if (target.folderId) saveLastFolder(target.folderId);
    return entry;
  }

  /** Sends the photo to the server; Lightning adds the best match at once, Normal shows it first. */
  const recognise = (read: CardRead | null, photo: Photo) =>
    run('Recognising', async () => {
      ignored.current = read;
      const image = await shrinkPhoto(photo);
      const line = read?.setCode && read.collectorNumber ? { set_code: read.setCode, collector_number: read.collectorNumber } : undefined;
      let candidates = (
        await recognizePhoto({ image, media_type: 'image/jpeg', collector_line: line, ignore_promos: settings.ignorePromos })
      ).map((c) => c.printing);
      // The server found nothing: the collector line the phone read still names the printing.
      if (!candidates.length && line) {
        candidates = await findPrinting(line.set_code, line.collector_number).then((p) => [p], () => []);
      }
      if (!candidates.length) throw new Error('No match. Hold the card flat in good light, or search by name.');
      const choice = pickFor(candidates, read);
      if (settings.mode === 'normal') return setPick(choice);
      setNote(await add(choice));
    });

  async function snap(): Promise<{ read: CardRead | null; photo: Photo } | null> {
    try {
      const photo = await camera.current?.takePictureAsync({ quality: 0.8, shutterSound: false });
      if (!photo) return null;
      return { photo, read: canReadText ? readCard(await readLines(photo.uri)) : null };
    } catch {
      return null; // camera not ready yet
    }
  }

  // Auto-scan: read a photo on the phone about every second; once two reads agree, send that photo to the server.
  const looking = canReadText && !props.paused && !!permission?.granted && !!target && !choosingTarget && !pick && !searching && !busy;
  useEffect(() => {
    if (!looking) return;
    let stopped = false;
    let previous: CardRead | null = null;
    (async () => {
      while (!stopped) {
        const shot = await snap();
        if (stopped) return;
        const read = shot?.read;
        const readable = read && (read.setCode || read.name);
        if (shot && read && readable && !(ignored.current && sameCard(read, ignored.current))) {
          if (previous && sameCard(read, previous)) return void recognise(read, shot.photo);
          previous = read;
        } else {
          previous = null;
          if (!readable) ignored.current = null; // the card left the view: the same card may be scanned again
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    })();
    return () => {
      stopped = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when looking starts or stops
  }, [looking]);

  const undo = (entry: Added) =>
    run('Undoing', async () => {
      await undoAdd(entry.item, entry.quantity);
      setAdded((list) => list.map((e) => (e === entry ? { ...e, undone: true } : e)));
      if (note === entry) setNote(null);
    });

  /** "Wrong?": takes the Lightning add back and opens the choice for that card. */
  const wrong = (entry: Added) =>
    run('Undoing', async () => {
      await undoAdd(entry.item, entry.quantity);
      setAdded((list) => list.map((e) => (e === entry ? { ...e, undone: true } : e)));
      setNote(null);
      setPick(entry.pick);
    });

  const count = added.filter((e) => !e.undone).reduce((sum, e) => sum + e.quantity, 0);
  const condition = props.conditions.find((c) => c.id === settings.condition)?.code;
  const describe = (p: Printing) => `${p.set_code.toUpperCase()} ${p.collector_number ?? ''}`;

  if (!permission?.granted) {
    return (
      <View style={[styles.pad, { flex: 1, justifyContent: 'center' }]}>
        <Text style={styles.text}>tradeable. needs the camera to recognise your cards.</Text>
        <Pressable style={styles.button} onPress={requestPermission} accessibilityRole="button">
          <Text style={styles.buttonText}>Allow camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'black' }}>
      <CameraView ref={camera} style={{ flex: 1 }} facing="back" animateShutter={false} enableTorch={torch} />

      {/* Top: mode, light, scan settings; then the count of this session. */}
      <View style={{ position: 'absolute', top: 48, left: 12, right: 12, gap: 8 }}>
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <View style={[styles.pill, styles.row, { padding: 4, paddingHorizontal: 4 }]}>
            {(['lightning', 'normal'] as const).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => props.onSettingsChange({ ...settings, mode })}
                accessibilityRole="button"
                accessibilityState={{ selected: settings.mode === mode }}
                style={[styles.chip, { backgroundColor: settings.mode === mode ? colors.purple : 'transparent' }]}
              >
                <Text style={styles.text}>{mode === 'lightning' ? '⚡ Lightning' : 'Normal'}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.row}>
            <Pressable
              onPress={() => setTorch((on) => !on)}
              accessibilityRole="button"
              accessibilityLabel={torch ? 'Turn light off' : 'Turn light on'}
              style={[styles.pill, { paddingHorizontal: 10 }]}
            >
              <Ionicons name={torch ? 'bulb' : 'bulb-outline'} size={22} color={torch ? colors.green : colors.text} />
            </Pressable>
            <Pressable onPress={props.onOpenSettings} accessibilityRole="button" accessibilityLabel="Scan settings" style={[styles.pill, { paddingHorizontal: 10 }]}>
              <Ionicons name="options-outline" size={22} color={colors.text} />
            </Pressable>
          </View>
        </View>
        {added.length > 0 && (
          <Pressable onPress={() => setShowSession(true)} accessibilityRole="button" style={[styles.pill, { alignSelf: 'flex-end' }]}>
            <Text style={styles.text}>{count} scanned</Text>
          </Pressable>
        )}
      </View>

      {/* Middle: what is going on. No guide box; the live card outline comes later. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, bottom: 0, left: 24, right: 24, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <Text style={[styles.text, { textShadowColor: 'black', textShadowRadius: 4 }]}>
          {busy ? `${busy}…` : canReadText ? 'Hold a card in view' : 'Take a photo of the card'}
        </Text>
        {message && (
          <Pressable onPress={() => setSearching(true)} style={styles.pill} accessibilityRole="button">
            <Text style={styles.error}>{message}</Text>
          </Pressable>
        )}
        {!canReadText && !busy && (
          // Expo Go has no on-device text reading, so there is no automatic capture: take the photo by hand.
          <Pressable
            style={[styles.button, { paddingHorizontal: 24 }]}
            onPress={async () => {
              const shot = await snap();
              if (shot) recognise(null, shot.photo);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Take photo</Text>
          </Pressable>
        )}
      </View>

      {/* Bottom: where the batch goes and the defaults in use. */}
      <View style={[styles.row, { position: 'absolute', bottom: 12, left: 12, right: 12, justifyContent: 'space-between' }]}>
        <Pressable onPress={() => setChangingTarget(true)} accessibilityRole="button" accessibilityLabel="Change where this batch goes" style={styles.pill}>
          <Text style={styles.text}>
            To <Text style={{ color: colors.green, fontWeight: '700' }}>{target?.name ?? '…'}</Text> ›
          </Text>
        </Pressable>
        <Pressable onPress={props.onOpenSettings} accessibilityRole="button" accessibilityLabel="Scan defaults" style={styles.pill}>
          <Text style={styles.text}>{defaultsSummary(settings, condition)}</Text>
        </Pressable>
      </View>

      {note && !pick && (
        <View style={[styles.pill, styles.row, { position: 'absolute', bottom: 64, left: 12, right: 12, borderRadius: 12, justifyContent: 'space-between' }]}>
          <Text style={[styles.text, { flex: 1 }]} numberOfLines={2}>
            Added {note.pick.candidates[note.pick.chosen].product_name} · {describe(note.pick.candidates[note.pick.chosen])} · to {target?.name}
          </Text>
          <Pressable onPress={() => wrong(note)} disabled={!!busy} accessibilityRole="button">
            <Text style={{ color: colors.green, fontWeight: '700' }}>Wrong?</Text>
          </Pressable>
        </View>
      )}

      {pick && target && (
        <ResultSheet
          pick={pick}
          onChange={setPick}
          conditions={props.conditions}
          preferFoil={settings.preferFoil}
          targetName={target.name}
          busy={!!busy}
          onAdd={() =>
            run('Adding', async () => {
              await add(pick);
              setPick(null);
            })
          }
          onSearch={() => {
            setPick(null);
            setSearching(true);
          }}
          onClose={() => setPick(null)}
        />
      )}

      {searching && (
        <NameSearch
          onCancel={() => setSearching(false)}
          onError={(e) => (e instanceof ApiError && e.status === 401 ? props.onSignedOut() : setMessage(e instanceof Error ? e.message : String(e)))}
          onPicked={(printings) => {
            setSearching(false);
            setMessage(null);
            setPick(pickFor(printings, null));
          }}
        />
      )}

      {choosingTarget && (
        <BatchSheet
          folders={folders}
          lastFolderId={lastFolder}
          current={target}
          onChoose={(t) => {
            setChosenTarget(t);
            setChangingTarget(false);
          }}
        />
      )}

      {showSession && (
        <Sheet>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text style={[styles.text, { fontWeight: '700' }]}>Scanned this session · {count}</Text>
            <Pressable onPress={() => setShowSession(false)} accessibilityRole="button">
              <Text style={{ color: colors.green }}>Done</Text>
            </Pressable>
          </View>
          {added.map((entry, i) => (
            <View key={`${entry.item.id}-${i}`} style={[styles.row, { justifyContent: 'space-between' }]}>
              <Text style={[styles.text, { flex: 1 }, entry.undone && { textDecorationLine: 'line-through', opacity: 0.5 }]}>
                {entry.quantity > 1 ? `${entry.quantity}× ` : ''}
                {entry.pick.candidates[entry.pick.chosen].product_name} · {describe(entry.pick.candidates[entry.pick.chosen])}
              </Text>
              {!entry.undone && (
                <Pressable onPress={() => undo(entry)} disabled={!!busy} accessibilityRole="button">
                  <Text style={{ color: colors.green }}>Undo</Text>
                </Pressable>
              )}
            </View>
          ))}
        </Sheet>
      )}
    </View>
  );
}
