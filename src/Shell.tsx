import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Account } from './Account';
import { ApiError, type Schemas } from './api';
import { BottomBar, type Tab } from './BottomBar';
import { conditions, folders } from './catalog';
import { Collection } from './Collection';
import { Placeholder } from './Placeholder';
import { Scanner } from './Scanner';
import { defaultSettings, type ScanSettings } from './scan-rules';
import { SettingsScreen } from './SettingsScreen';
import { loadSettings, saveSettings } from './settings';
import { Unsorted } from './Unsorted';
import { colors, styles } from './theme';

/** The signed-in app: tabs in a slim bottom bar, account top left, settings top right. */
export function Shell({ onSignedOut }: { onSignedOut: () => void }) {
  const [tab, setTab] = useState<Tab>('collection');
  const [overlay, setOverlay] = useState<'account' | 'settings' | 'unsorted' | null>(null);
  const [settings, setSettings] = useState<ScanSettings>(defaultSettings);
  const [conditionList, setConditionList] = useState<Schemas['CatalogReferenceItem'][]>([]);
  const [folderList, setFolderList] = useState<Schemas['CollectionFolder'][]>([]);
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) return onSignedOut();
    setError(e instanceof Error ? e.message : String(e));
  };

  useEffect(() => {
    loadSettings().then(setSettings);
    conditions().then(setConditionList, fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once
  }, []);

  // Folder counts change while scanning and sorting: reload when the collection or scanner opens.
  useEffect(() => {
    if (tab === 'collection' || tab === 'scan') folders().then(setFolderList, fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on tab change
  }, [tab, overlay]);

  const changeSettings = (next: ScanSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {overlay === 'unsorted' ? (
          <Unsorted folders={folderList} onClose={() => setOverlay(null)} onError={fail} />
        ) : tab === 'scan' ? (
          <Scanner
            settings={settings}
            onSettingsChange={changeSettings}
            onOpenSettings={() => setOverlay('settings')}
            paused={overlay !== null}
            conditions={conditionList}
            folders={folderList}
            onSignedOut={onSignedOut}
          />
        ) : (
          <View style={{ flex: 1, paddingTop: 48 }}>
            <View style={[styles.row, { justifyContent: 'space-between', paddingHorizontal: 16 }]}>
              <Pressable onPress={() => setOverlay('account')} accessibilityRole="button" accessibilityLabel="Account">
                <Ionicons name="person-circle-outline" size={30} color={colors.muted} />
              </Pressable>
              <Text style={[styles.title, { fontSize: 24 }]}>
                tradeable<Text style={styles.dot}>.</Text>
              </Text>
              <Pressable onPress={() => setOverlay('settings')} accessibilityRole="button" accessibilityLabel="Settings">
                <Ionicons name="settings-outline" size={26} color={colors.muted} />
              </Pressable>
            </View>
            {error && <Text style={[styles.error, { paddingHorizontal: 16 }]}>{error}</Text>}
            {tab === 'collection' && <Collection folders={folderList} onSort={() => setOverlay('unsorted')} />}
            {tab === 'market' && <Placeholder title="Marketplace" />}
            {tab === 'community' && <Placeholder title="Community" />}
            {tab === 'sell' && <Placeholder title="Sell" />}
          </View>
        )}
      </View>
      <BottomBar
        tab={tab}
        onTab={(next) => {
          setOverlay(null);
          setTab(next);
        }}
      />
      {/* Over everything, so the scanner keeps its batch while settings are open. */}
      {overlay === 'settings' && (
        <View style={{ position: 'absolute', inset: 0 }}>
          <SettingsScreen
            settings={settings}
            onChange={changeSettings}
            conditions={conditionList}
            folders={folderList}
            onClose={() => setOverlay(null)}
            onSignOut={onSignedOut}
          />
        </View>
      )}
      {overlay === 'account' && (
        <View style={{ position: 'absolute', inset: 0 }}>
          <Account onClose={() => setOverlay(null)} onSignOut={onSignedOut} />
        </View>
      )}
    </View>
  );
}
