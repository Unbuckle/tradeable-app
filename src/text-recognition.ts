import { NativeModules } from 'react-native';
import type { OcrLine } from './card-reader';

/** ML Kit is native code: present in a development build, missing in Expo Go. */
export const canReadText = Boolean(NativeModules.TextRecognition);

/** The lines of text on the photo at `uri`, with their positions, read on the device. */
export async function readLines(uri: string): Promise<OcrLine[]> {
  const { default: TextRecognition } = await import('@react-native-ml-kit/text-recognition');
  const result = await TextRecognition.recognize(uri);
  return result.blocks.flatMap((block) =>
    block.lines.map((line) => ({ text: line.text, top: line.frame?.top ?? 0, left: line.frame?.left ?? 0 })),
  );
}
