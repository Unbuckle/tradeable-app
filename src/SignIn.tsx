import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { ApiError, signIn } from './api';
import { styles } from './theme';

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password, needsCode ? code.trim() : undefined);
      onSignedIn();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ERR_MFA_REQUIRED') setNeedsCode(true);
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.screen, styles.pad, { justifyContent: 'center' }]}>
      <Text style={styles.title}>
        tradeable<Text style={styles.dot}>.</Text>
      </Text>
      <Text style={styles.muted}>Sign in with your tradeable. account.</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#9A8FA3"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#9A8FA3"
        secureTextEntry
        autoComplete="current-password"
        value={password}
        onChangeText={setPassword}
      />
      {needsCode && (
        <>
          <Text style={styles.muted}>Enter the code from your authenticator app.</Text>
          <TextInput
            style={styles.input}
            placeholder="6-digit code"
            placeholderTextColor="#9A8FA3"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            value={code}
            onChangeText={setCode}
          />
        </>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[styles.button, busy && { opacity: 0.6 }]}
        disabled={busy || !email || !password}
        onPress={submit}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
      </Pressable>
    </View>
  );
}
