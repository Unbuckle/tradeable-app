import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';
import { colors } from './theme';

export type Tab = 'market' | 'collection' | 'scan' | 'community' | 'sell';

const sides: { tab: Tab; icon: keyof typeof Ionicons.glyphMap; label: string }[][] = [
  [
    { tab: 'market', icon: 'storefront-outline', label: 'Marketplace' },
    { tab: 'collection', icon: 'albums-outline', label: 'Collection' },
  ],
  [
    { tab: 'community', icon: 'people-outline', label: 'Community' },
    { tab: 'sell', icon: 'pricetag-outline', label: 'Sell' },
  ],
];

/** Slim bar, icons only, with a small raised Scan button in the middle. */
export function BottomBar({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  const button = (t: { tab: Tab; icon: keyof typeof Ionicons.glyphMap; label: string }) => (
    <Pressable
      key={t.tab}
      onPress={() => onTab(t.tab)}
      accessibilityRole="tab"
      accessibilityLabel={t.label}
      accessibilityState={{ selected: tab === t.tab }}
      style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}
    >
      <Ionicons name={t.icon} size={24} color={tab === t.tab ? colors.green : colors.muted} />
    </Pressable>
  );
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#211A28', paddingBottom: 20 }}
    >
      {sides[0].map(button)}
      <Pressable
        onPress={() => onTab('scan')}
        accessibilityRole="tab"
        accessibilityLabel="Scan"
        accessibilityState={{ selected: tab === 'scan' }}
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          marginTop: -14,
          backgroundColor: colors.green,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="scan" size={26} color={colors.plum} />
      </Pressable>
      {sides[1].map(button)}
    </View>
  );
}
