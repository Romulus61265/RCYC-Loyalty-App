/// <reference types="node" />
/**
 * Writes supabase/seed.sql from the fictional development dataset.
 *
 *   npm run seed:generate          write the file
 *   npm run seed:generate -- --check   fail if the committed file is stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSeedRows, renderSeedSql } from './supabase/seedRows';

const target = resolve(__dirname, '../supabase/seed.sql');
const next = renderSeedSql(buildSeedRows());

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    // Missing file is stale.
  }
  if (current !== next) {
    console.error('✘ supabase/seed.sql is out of date. Run `npm run seed:generate`.');
    process.exit(1);
  }
  console.log('✔ supabase/seed.sql matches the development dataset.');
} else {
  writeFileSync(target, next);
  console.log(`✔ Wrote ${target} (${next.split('\n').length} lines).`);
}
