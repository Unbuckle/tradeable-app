import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import type { Schemas } from './api';
import { Chips } from './Chips';
import type { ScanSettings } from './scan-rules';
import { colors, styles } from './theme';

const LANGUAGES = ['en', 'de', 'fr', 'it', 'es', 'pt', 'ja', 'ko', 'ru', 'zh-hans', 'zh-hant'];

export function SettingsScreen(props: {
  settings: ScanSettings;
  onChange: (settings: ScanSettings) => void;
  conditions: Schemas['CatalogReferenceItem'][];
  folders: Schemas['CollectionFolder'][];
  onClose: () => void;
  onSignOut: () => void;
}) {
  const { settings } = props;
  const set = (change: Partial<ScanSettings>) => props.onChange({ ...settings, ...change });
  const toggle = (label: string, value: boolean, change: (on: boolean) => Partial<ScanSettings>) => (
    <View style={[styles.row, { justifyContent: 'space-between' }]}>
      <Text style={styles.text}>{label}</Text>
      <Switch
        value={value}
        onValueChange={(on) => set(change(on))}
        trackColor={{ true: colors.green, false: colors.mauve }}
        accessibilityLabel={label}
      />
    </View>
  );
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.pad, { paddingTop: 56 }]}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text style={styles.title}>Settings</Text>
        <Pressable onPress={props.onClose} accessibilityRole="button">
          <Text style={{ color: colors.green, fontSize: 16 }}>Done</Text>
        </Pressable>
      </View>
      <Text style={styles.muted}>SCANNING</Text>
      <Text style={styles.text}>Scanner mode</Text>
      <Chips
        items={[
          { key: 'lightning', label: 'Lightning' },
          { key: 'normal', label: 'Normal' },
        ]}
        selected={settings.mode}
        onSelect={(mode) => set({ mode: mode as ScanSettings['mode'] })}
      />
      <Text style={styles.muted}>Lightning adds the best match at once; Normal shows it first.</Text>
      <Text style={styles.text}>Language</Text>
      <Chips
        items={LANGUAGES.map((l) => ({ key: l, label: l.toUpperCase() }))}
        selected={settings.language}
        onSelect={(language) => set({ language })}
      />
      <Text style={styles.muted}>Used unless the phone reads another language on the card.</Text>
      <Text style={styles.text}>Condition</Text>
      <Chips
        items={props.conditions.map((c) => ({ key: String(c.id), label: c.code }))}
        selected={String(settings.condition)}
        onSelect={(id) => set({ condition: Number(id) })}
      />
      {toggle('Prefer foil if possible', settings.preferFoil, (preferFoil) => ({ preferFoil }))}
      <Text style={styles.muted}>Foil whenever that printing comes in foil; the ★ on the card always means foil.</Text>
      {toggle('Ignore promos', settings.ignorePromos, (ignorePromos) => ({ ignorePromos }))}
      <Text style={styles.muted}>Takes the normal printing with the same art when there is one.</Text>
      <Text style={styles.text}>New batches go to</Text>
      <Chips
        items={[
          { key: '', label: 'Ask each time' },
          { key: 'unfiled', label: 'Unsorted' },
          ...props.folders.map((f) => ({ key: f.id, label: f.name })),
        ]}
        selected={settings.batchTarget ?? ''}
        onSelect={(key) => set({ batchTarget: key || null })}
      />
      <Text style={[styles.muted, { marginTop: 12 }]}>APP</Text>
      <Pressable style={styles.card} onPress={props.onSignOut} accessibilityRole="button">
        <Text style={styles.text}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}
