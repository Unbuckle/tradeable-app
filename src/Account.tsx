import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Account as AccountType } from './api';
import { myAccount } from './catalog';
import { colors, styles } from './theme';

export function Account({ onClose, onSignOut }: { onClose: () => void; onSignOut: () => void }) {
  const [account, setAccount] = useState<AccountType | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    myAccount().then(setAccount, (e: Error) => setError(e.message));
  }, []);
  return (
    <View style={[styles.screen, styles.pad, { paddingTop: 56 }]}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text style={styles.title}>Account</Text>
        <Pressable onPress={onClose} accessibilityRole="button">
          <Text style={{ color: colors.green, fontSize: 16 }}>Done</Text>
        </Pressable>
      </View>
      {account && (
        <View style={styles.card}>
          <Text style={styles.text}>@{account.handle}</Text>
          <Text style={styles.muted}>{account.email}</Text>
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={[styles.button, styles.secondary]} onPress={onSignOut} accessibilityRole="button">
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}
