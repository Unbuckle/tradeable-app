import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { base64Bytes, fitLongSide } from './scan-rules';

const MAX_BYTES = 700 * 1024;

/** The photo at `uri` as base64 JPEG, about 1600 px on the long side and under 700 KiB, for `POST /recognitions`. */
export async function shrinkPhoto(uri: string): Promise<string> {
  // Load first to learn the size as shown: camera photos are stored sideways with an EXIF turn.
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const image = await ImageManipulator.manipulate(original).resize(fitLongSide(original.width, original.height)).renderAsync();
  let base64 = '';
  for (const compress of [0.8, 0.6, 0.4]) {
    base64 = (await image.saveAsync({ format: SaveFormat.JPEG, compress, base64: true })).base64 ?? '';
    if (base64Bytes(base64) <= MAX_BYTES) break;
  }
  return base64;
}
