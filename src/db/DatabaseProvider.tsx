import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Database } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { EmptyState } from '@/ui';

import { getDb } from './client';
import { migrations } from './migrations/migrations';

type Props = {
  children: ReactNode;
  /** Called once the database is ready (or failed), e.g. to hide the splash and start services. */
  onSettled?: (ok: boolean) => void;
};

/**
 * Runs pending SQLite migrations (drizzle useMigrations) before any screen reads data. Local and
 * fast; never touches the network. On failure shows a retry state instead of crashing.
 */
export function DatabaseProvider({ children, onSettled }: Props) {
  const [attempt, setAttempt] = useState(0);
  return (
    <Migrator key={attempt} onRetry={() => setAttempt((a) => a + 1)} onSettled={onSettled}>
      {children}
    </Migrator>
  );
}

function Migrator({ children, onRetry, onSettled }: Props & { onRetry: () => void }) {
  const t = useTheme();
  const { success, error } = useMigrations(getDb(), migrations);
  const settled = success ? 'ok' : error ? 'error' : null;

  useEffect(() => {
    if (settled) onSettled?.(settled === 'ok');
  }, [settled, onSettled]);

  if (error) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: t.spacing.screen,
          backgroundColor: t.colors.bg,
        }}
        testID="db-error"
      >
        <EmptyState
          icon={Database}
          title="Couldn't open your data"
          body="Your workouts and meals are safe on this phone. Try again, or restart the app."
          actionLabel="Try again"
          onAction={onRetry}
        />
      </View>
    );
  }
  if (!success) return null; // a few ms on first launch; the splash is still up
  return <>{children}</>;
}
