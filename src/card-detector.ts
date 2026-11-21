import {
  BorderTypes,
  ColorConversionCodes,
  ContourApproximationModes,
  DataTypes,
  Mat,
  MatVector,
  MorphShapes,
  OpenCV,
  Point,
  PointVector,
  RetrievalModes,
  Scalar,
  Size,
} from 'react-native-fast-opencv';
import { isCardShaped, orderCorners, type Quad, rotatedBox, sideRatio } from './card-outline';

/**
 * The largest card-shaped outline in a small RGB image, or null: the live version of the server's card finder
 * (nexustcg `src/infrastructure/recognition/card-finder.ts`) with one edge map instead of five, to keep up
 * with the camera. Runs on the camera's frame thread.
 */
export function findCard(rgb: Uint8Array, width: number, height: number): Quad | null {
  'worklet';
  const source = Mat.createFromBuffer('uint8', height, width, 3, rgb);
  const gray = Mat.create(0, 0, DataTypes.CV_8U);
  OpenCV.cvtColor(source, gray, ColorConversionCodes.COLOR_RGB2GRAY);
  OpenCV.GaussianBlur(gray, gray, Size.create(5, 5), 0);
  OpenCV.Canny(gray, gray, 50, 150);
  const kernel = OpenCV.getStructuringElement(MorphShapes.MORPH_RECT, Size.create(3, 3));
  OpenCV.dilate(gray, gray, kernel, Point.create(-1, -1), 1, BorderTypes.BORDER_CONSTANT, Scalar.create(0));

  const contours = MatVector.create();
  OpenCV.findContours(gray, contours, RetrievalModes.RETR_EXTERNAL, ContourApproximationModes.CHAIN_APPROX_SIMPLE);
  const largest: { contour: Mat; area: number }[] = [];
  for (let i = 0; i < contours.length; i++) {
    const contour = contours.get(i);
    largest.push({ contour, area: OpenCV.contourArea(contour).value });
  }
  largest.sort((a, b) => b.area - a.area);

  for (const { contour } of largest.slice(0, 3)) {
    const hull = Mat.create(0, 0, DataTypes.CV_32S);
    OpenCV.convexHull(contour, hull);
    const length = OpenCV.arcLength(hull, true).value;
    let quad: Quad | null = null;
    // rounded card corners need a looser fit
    for (const epsilon of [0.02, 0.04, 0.06]) {
      const approx = PointVector.create();
      OpenCV.approxPolyDP(hull, approx, epsilon * length, true);
      if (approx.length === 4) {
        quad = orderCorners([0, 1, 2, 3].map((j) => ({ x: approx.get(j).x, y: approx.get(j).y })));
        break;
      }
    }
    if (!quad) {
      // A finger or glare hides a corner: a well-filled rotated rectangle of a card's shape will do.
      const rect = OpenCV.minAreaRect(hull);
      const box = orderCorners(rotatedBox(rect));
      const ratio = sideRatio(box);
      if (OpenCV.contourArea(hull).value > 0.9 * rect.width * rect.height && ratio > 0.6 && ratio < 0.8) quad = box;
    }
    if (quad && isCardShaped(quad, width, height)) return quad;
  }
  return null;
}
