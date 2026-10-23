import { NativeModules } from 'react-native';

/** ML Kit is native code: present in a development build, missing in Expo Go. */
export const canReadText = Boolean(NativeModules.TextRecognition);

/** The text on the photo at `uri`, read on the device. */
export async function readText(uri: string): Promise<string> {
  const { default: TextRecognition } = await import('@react-native-ml-kit/text-recognition');
  return (await TextRecognition.recognize(uri)).text;
}
