import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { getRawDb, resetDbForTests } from '@/db/client';
import { DatabaseProvider } from '@/db/DatabaseProvider';
import { isSchemaCurrent, migrateDb } from '@/db/migrate';

import { renderThemed } from '../../../test/render';

beforeEach(() => resetDbForTests());

describe('isSchemaCurrent', () => {
  it('is false on a fresh database and true once every migration ran', async () => {
    expect(isSchemaCurrent()).toBe(false);
    await migrateDb();
    expect(isSchemaCurrent()).toBe(true);
  });

  it('is false when the newest bundled migration has not run yet', async () => {
    await migrateDb();
    getRawDb().execSync(
      'DELETE FROM __drizzle_migrations WHERE created_at = (SELECT MAX(created_at) FROM __drizzle_migrations)',
    );
    expect(isSchemaCurrent()).toBe(false);
  });
});

describe('DatabaseProvider', () => {
  it('renders children in the first pass when the schema is current', async () => {
    await migrateDb();
    const onSettled = jest.fn();
    await renderThemed(
      <DatabaseProvider onSettled={onSettled}>
        <Text testID="child">ready</Text>
      </DatabaseProvider>,
    );
    expect(screen.getByTestId('child')).toBeTruthy();
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith(true);
  });

  it('runs the migrator first on a fresh install, then renders children', async () => {
    const onSettled = jest.fn();
    await renderThemed(
      <DatabaseProvider onSettled={onSettled}>
        <Text testID="child">ready</Text>
      </DatabaseProvider>,
    );
    expect(await screen.findByTestId('child')).toBeTruthy();
    expect(onSettled).toHaveBeenCalledWith(true);
    expect(isSchemaCurrent()).toBe(true);
  });
});
