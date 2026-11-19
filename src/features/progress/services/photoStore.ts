/**
 * Progress photos in PRIVATE app storage (S33, sheet 12): picked or taken with expo-image-picker,
 * copied into <documents>/progress-photos/, never written to the public gallery. Rows store the
 * path RELATIVE to the documents directory because iOS changes the container path on updates.
 * Export is only through the system share sheet, when the user asks.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';

import { uuidv7 } from '@/lib/ids';
import { track } from '@/services/analytics';

import { extensionOf, PHOTO_DIR, photoFileName } from '../logic/photos';
import { addPhoto, deletePhoto, type ProgressPhoto } from '../repo';

export type PhotoSource = 'camera' | 'library';
export type AddPhotoResult =
  | { status: 'saved'; photo: ProgressPhoto }
  | { status: 'cancelled' }
  | { status: 'denied' }
  | { status: 'error'; message: string };

/** file:// uri for a stored photo (relative paths resolve against the documents directory). */
export function resolvePhotoUri(localUri: string | null): string | null {
  if (!localUri) return null;
  if (/^[a-z]+:\/\//i.test(localUri)) return localUri;
  return new File(Paths.document, localUri).uri;
}

const PICK_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.85,
  exif: false,
  allowsEditing: false,
};

export async function addProgressPhoto(
  source: PhotoSource,
  date: string,
  pose: string | null = null,
): Promise<AddPhotoResult> {
  try {
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return { status: 'denied' };
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            ...PICK_OPTIONS,
            cameraType: ImagePicker.CameraType.back,
          })
        : await ImagePicker.launchImageLibraryAsync(PICK_OPTIONS);
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return { status: 'cancelled' };

    const dir = new Directory(Paths.document, PHOTO_DIR);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const id = uuidv7();
    const name = photoFileName(id, extensionOf(asset.uri));
    await new File(asset.uri).copy(new File(dir, name));
    const photo = addPhoto({ id, date, localUri: `${PHOTO_DIR}/${name}`, pose });
    return { status: 'saved', photo };
  } catch (e) {
    return {
      status: 'error',
      message: e instanceof Error ? e.message : 'Could not save the photo',
    };
  }
}

/** Soft-delete the row (so the delete syncs) and remove the private file. */
export function removeProgressPhoto(photo: Pick<ProgressPhoto, 'id' | 'localUri'>): void {
  deletePhoto(photo.id);
  try {
    const uri = resolvePhotoUri(photo.localUri);
    if (uri) {
      const f = new File(uri);
      if (f.exists) f.delete();
    }
  } catch {
    // The row is gone; a stray file is harmless and never shown.
  }
}

/** User-initiated export through the share sheet (they can save it to Photos from there). */
export async function sharePhoto(
  localUri: string | null,
  format: 'photo' | 'compare' | 'wrapped' = 'photo',
): Promise<boolean> {
  const uri = resolvePhotoUri(localUri);
  if (!uri || !(await Sharing.isAvailableAsync())) return false;
  const png = uri.toLowerCase().endsWith('.png');
  await Sharing.shareAsync(uri, {
    mimeType: png ? 'image/png' : 'image/jpeg',
    UTI: png ? 'public.png' : 'public.jpeg',
    dialogTitle: 'Share',
  });
  track('export', { format });
  return true;
}
