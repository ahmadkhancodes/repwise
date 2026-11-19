import { defineConfig } from 'drizzle-kit';

/** `npm run db:generate` → SQL migrations in src/db/migrations, inlined into migrations.ts. */
export default defineConfig({
  dialect: 'sqlite',
  driver: 'expo',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});
