import TextRecognition from '@react-native-ml-kit/text-recognition';
import type { OcrLine } from './card-reader';

/** The lines of text on the photo at `uri` (a file:// URI), with their positions, read on the device. */
export async function readLines(uri: string): Promise<OcrLine[]> {
  const result = await TextRecognition.recognize(uri);
  return result.blocks.flatMap((block) =>
    block.lines.map((line) => ({ text: line.text, top: line.frame?.top ?? 0, left: line.frame?.left ?? 0 })),
  );
}
