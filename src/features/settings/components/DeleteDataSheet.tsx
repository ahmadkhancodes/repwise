import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/services/auth';
import { useTheme } from '@/theme';
import { Button, Sheet, showToast, showUndoToast, Text } from '@/ui';

import { deleteAllData } from '../data';
import { errorMessage } from '../logic/account';
import { DELETE_UNDO_MS } from '../logic/data';

export type DeleteDataSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Test seam: what runs after the undo window. */
  run?: typeof deleteAllData;
};

/**
 * "Delete all data" with two confirmations and an undo window: step 1 says exactly what goes,
 * step 2 is the final destructive button, then a 5 s "Undo" toast before anything is deleted.
 */
export function DeleteDataSheet({ open, onClose, run = deleteAllData }: DeleteDataSheetProps) {
  const t = useTheme();
  const signedIn = useAuth((s) => s.status === 'signedIn');
  const [step, setStep] = useState<'explain' | 'final'>('explain');
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = () => {
    setStep('explain');
    onClose();
  };

  // Leaving Settings during the undo window still deletes: the user confirmed twice.
  const confirm = () => {
    close();
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      pending.current = null;
      void run().then((r) => {
        if (r.status === 'deleted') {
          showToast({ message: 'All data deleted. Start fresh any time.', silent: true });
          router.replace('/welcome');
        } else {
          showToast({ message: errorMessage(r.error), tone: 'danger' });
        }
      });
    }, DELETE_UNDO_MS);
    showUndoToast(
      'Deleting your data…',
      () => {
        if (pending.current) clearTimeout(pending.current);
        pending.current = null;
        showToast({ message: 'Nothing was deleted.', silent: true });
      },
      { durationMs: DELETE_UNDO_MS },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={step === 'explain' ? 'Delete all data?' : 'This cannot be undone'}
      testID="delete-data-sheet"
    >
      {step === 'explain' ? (
        <View style={{ gap: t.spacing.md }}>
          <Text variant="body" color="textSecondary">
            {`This deletes your plan, workouts, meals, body stats and progress photos from this phone${
              signedIn ? ', and your backup account with everything stored on our servers' : ''
            }.`}
          </Text>
          <Text variant="body" color="textSecondary">
            Your subscription is not affected. You can restore it any time. Export your data first
            if you want a copy.
          </Text>
          <Button
            label="Continue"
            variant="destructive"
            onPress={() => setStep('final')}
            testID="delete-data-continue"
          />
          <Button label="Cancel" variant="secondary" onPress={close} testID="delete-data-cancel" />
        </View>
      ) : (
        <View style={{ gap: t.spacing.md }}>
          <Text variant="body" color="textSecondary">
            {`You'll have ${Math.round(DELETE_UNDO_MS / 1000)} seconds to undo. After that Repwise starts fresh, like a new install.`}
          </Text>
          <Button
            label="Delete everything"
            variant="destructive"
            onPress={confirm}
            testID="delete-data-confirm"
          />
          <Button
            label="Keep my data"
            variant="secondary"
            onPress={close}
            testID="delete-data-keep"
          />
        </View>
      )}
    </Sheet>
  );
}
