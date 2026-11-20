import { Linking } from 'react-native';

import { showToast } from '@/ui';

/** Open a web page or mail link; a calm toast when the phone has nothing to open it with. */
export async function openLink(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    showToast({ message: "Couldn't open the link. Try again later.", tone: 'danger' });
    return false;
  }
}
