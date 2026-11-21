import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import {
  Camera,
  type CameraRef,
  type Frame,
  type Point,
  useCameraPermission,
  useFrameOutput,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { useResizer } from 'react-native-vision-camera-resizer';
import { createSynchronizable, scheduleOnRN } from 'react-native-worklets';
import { ApiError, type CollectionItem, type Printing, type Schemas } from './api';
import { findCard } from './card-detector';
import { isSteady, type Quad, type Sample, scaleQuad, smoothQuad } from './card-outline';
import { type CardRead, readCard } from './card-reader';
import { addToCollection, findPrinting, recognizePhoto, undoAdd } from './catalog';
import { NameSearch } from './NameSearch';
import { shrinkPhoto } from './photo';
import { type Pick, ResultSheet } from './ResultSheet';
import { BatchSheet, type Target } from './BatchSheet';
import { pickSku, type ScanSettings, defaultsSummary, wantedFinish } from './scan-rules';
import { loadLastFolder, saveLastFolder } from './settings';
import { Sheet } from './Sheet';
import { readLines } from './text-recognition';
import { colors, styles } from './theme';

interface Added {
  item: CollectionItem;
  quantity: number;
  undone: boolean;
  /** The choice it was added from, for "Wrong?". */
  pick: Pick;
}

/** The small portrait image the outline is looked for in, about 12 times a second. */
const DETECT = { width: 192, height: 256 };
const DETECT_EVERY_MS = 80;
/** The outline must hold still this long before the photo is taken. */
const HOLD_MS = 500;
/** Detections without a card before the outline goes away. */
const LOST_AFTER = 3;

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
  const camera = useRef<CameraRef>(null);
  const { hasPermission, requestPermission } = useCameraPermission();
  const { width: viewWidth } = useWindowDimensions();
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
  // The live outline in screen points, and what it did lately.
  const [outline, setOutline] = useState<Quad | null>(null);
  // `waiting`: after a photo, the card in view has been dealt with; wait until it leaves before taking the next.
  const track = useRef({ samples: [] as Sample[], misses: 0, shown: null as Quad | null, waiting: false });
  const [waiting, setWaiting] = useState(false);

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

  const photoOutput = usePhotoOutput();
  /** Takes the photo, reads it on the phone and sends both to the server; Lightning adds the best match at once, Normal shows it first. */
  const capture = () =>
    run('Recognising', async () => {
      const file = await photoOutput.capturePhotoToFile({ flashMode: 'off', enableShutterSound: false }, {});
      const uri = file.filePath.startsWith('file://') ? file.filePath : `file://${file.filePath}`;
      const read = readCard(await readLines(uri));
      const image = await shrinkPhoto(uri);
      const line = read.setCode && read.collectorNumber ? { set_code: read.setCode, collector_number: read.collectorNumber } : undefined;
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

  // Live outline: the frame thread looks for the card about 12 times a second and hands its corners over here.
  const watching = !props.paused && hasPermission && !!target && !choosingTarget && !pick && !searching;
  const canCapture = watching && !busy;
  // What the corner handler needs from the latest render; the frame thread keeps one handler.
  const latest = useRef({ canCapture, capture, viewWidth });
  useEffect(() => {
    latest.current = { canCapture, capture, viewWidth };
  });
  const handleCorners = useCallback((corners: Point[] | null) => {
    const t = track.current;
    if (!corners || !camera.current) {
      if (++t.misses < LOST_AFTER) return;
      // The card left the view: the next one may be taken.
      track.current = { samples: [], misses: t.misses, shown: null, waiting: false };
      setWaiting(false);
      return setOutline(null);
    }
    let seen: Quad;
    try {
      seen = corners.map((p) => camera.current!.convertCameraPointToViewPoint(p));
    } catch {
      return; // preview not ready yet
    }
    const now = Date.now();
    t.misses = 0;
    t.shown = smoothQuad(t.shown, seen);
    t.samples = [...t.samples.filter((s) => s.at >= now - 2 * HOLD_MS), { at: now, quad: t.shown }];
    setOutline(t.shown);
    const { canCapture: ready, capture: take, viewWidth: width } = latest.current;
    if (ready && !t.waiting && isSteady(t.samples, now, HOLD_MS, 0.03 * width)) {
      t.waiting = true;
      setWaiting(true);
      take();
    }
  }, []);

  // Outlines from before a pause do not count towards holding still.
  useEffect(() => {
    track.current = { ...track.current, samples: [], shown: null };
  }, [watching]);

  const { resizer } = useResizer({ ...DETECT, channelOrder: 'rgb', dataType: 'uint8', scaleMode: 'stretch', pixelLayout: 'interleaved' });
  const lastRun = useMemo(() => createSynchronizable(0), []);
  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';
      try {
        const now = Date.now();
        if (!resizer || now - lastRun.getDirty() < DETECT_EVERY_MS) return;
        lastRun.setBlocking(now);
        const small = resizer.resize(frame);
        const quad = findCard(new Uint8Array(small.getPixelBuffer()), DETECT.width, DETECT.height);
        small.dispose();
        const corners = quad && scaleQuad(quad, frame.width / DETECT.width, frame.height / DETECT.height).map((p) => frame.convertFramePointToCameraPoint(p));
        scheduleOnRN(handleCorners, corners);
      } finally {
        frame.dispose();
      }
    },
    [resizer, lastRun, handleCorners],
  );
  const frameOutput = useFrameOutput({
    targetResolution: { width: 480, height: 640 },
    pixelFormat: 'yuv',
    // Upright frames, so the 3:4 detection image is not squeezed.
    enablePhysicalBufferRotation: true,
    onFrame: watching ? onFrame : undefined,
  });

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

  const status = busy ? `${busy}…` : !outline ? 'Hold a card in view' : waiting ? 'Show the next card' : 'Hold still…';
  // Under the card while there is one, else in the middle.
  const statusTop = outline ? Math.max(...outline.map((p) => p.y)) + 16 : undefined;

  if (!hasPermission) {
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
      <Camera
        ref={camera}
        style={{ flex: 1 }}
        device="back"
        isActive
        outputs={[photoOutput, frameOutput]}
        // The app stays portrait: keep frames and photos portrait too, however the phone is turned.
        orientationSource="interface"
        torchMode={torch ? 'on' : 'off'}
      />
      {watching && outline && (
        <Svg pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <Polygon
            points={outline.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={colors.green}
            strokeWidth={4}
            strokeLinejoin="round"
          />
        </Svg>
      )}

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

      {/* Middle, or under the card: what is going on. */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 24,
          right: 24,
          alignItems: 'center',
          gap: 12,
          ...(statusTop === undefined ? { top: 0, bottom: 0, justifyContent: 'center' } : { top: statusTop }),
        }}
      >
        <Text style={[styles.text, { textShadowColor: 'black', textShadowRadius: 4 }]}>{status}</Text>
        {message && (
          <Pressable onPress={() => setSearching(true)} style={styles.pill} accessibilityRole="button">
            <Text style={styles.error}>{message}</Text>
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
