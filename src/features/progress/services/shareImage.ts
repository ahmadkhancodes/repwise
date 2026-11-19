/**
 * Shareable images (Wrapped cards, photo compare, PR cards): snapshot a mounted view with Skia,
 * write a PNG to the cache directory and open the share sheet. Nothing touches the gallery.
 */
import { ImageFormat, makeImageFromView } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
import type { RefObject } from 'react';

import { sharePhoto } from './photoStore';

export async function shareViewAsImage(
  ref: RefObject<unknown>,
  name: string,
  format: 'compare' | 'wrapped',
): Promise<boolean> {
  const image = await makeImageFromView(ref as Parameters<typeof makeImageFromView>[0]);
  if (!image) return false;
  const file = new File(Paths.cache, `${name.replace(/[^a-z0-9-]/gi, '-')}.png`);
  if (file.exists) file.delete();
  file.create();
  file.write(image.encodeToBase64(ImageFormat.PNG, 100), { encoding: 'base64' });
  return sharePhoto(file.uri, format);
}
