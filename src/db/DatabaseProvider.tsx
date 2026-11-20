import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Database } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { EmptyState } from '@/ui/EmptyState';

import { getDb } from './client';
import { isSchemaCurrent } from './migrate';
import { migrations } from './migrations/migrations';

type Props = {
  children: ReactNode;
  /** Called once the database is ready (or failed), e.g. to hide the splash and start services. */
  onSettled?: (ok: boolean) => void;
};

/**
 * Makes sure the SQLite schema is current before any screen reads data. Local and fast; never
 * touches the network. On a normal launch the schema is already current (one synchronous
 * `SELECT`), so children render in the first pass; only after an app update with a new migration
 * (or on first install) does the drizzle migrator run. On failure shows a retry state instead of
 * crashing.
 */
export function DatabaseProvider({ children, onSettled }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [current] = useState(isSchemaCurrent);
  if (current && attempt === 0) return <Ready onSettled={onSettled}>{children}</Ready>;
  return (
    <Migrator key={attempt} onRetry={() => setAttempt((a) => a + 1)} onSettled={onSettled}>
      {children}
    </Migrator>
  );
}

function Ready({ children, onSettled }: Props) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    onSettled?.(true);
  }, [onSettled]);
  return <>{children}</>;
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
