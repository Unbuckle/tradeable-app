import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { signOut } from './src/api';
import { Scanner } from './src/Scanner';
import { SignIn } from './src/SignIn';
import { styles } from './src/theme';

export default function App() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync('tradeable.refresh').then((token) => setSignedIn(Boolean(token)));
  }, []);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      {signedIn === true && <Scanner onSignedOut={() => signOut().then(() => setSignedIn(false))} />}
      {signedIn === false && <SignIn onSignedIn={() => setSignedIn(true)} />}
    </View>
  );
}
