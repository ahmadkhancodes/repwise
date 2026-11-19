#!/usr/bin/env node
// Turn the results of scripts/ci/maestro-run.sh into
//   <out>/junit.xml           one merged JUnit report (per-flow reports stay in <out>/junit/)
//   $GITHUB_STEP_SUMMARY      a Markdown table (stdout when not on GitHub Actions)
// Usage: node scripts/ci/maestro-summary.mjs <out-dir> <platform>
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [out = 'e2e-artifacts', platform = 'android'] = process.argv.slice(2);
const resultsPath = join(out, 'results.tsv');
if (!existsSync(resultsPath)) {
  console.error(`No ${resultsPath}; nothing to summarise.`);
  process.exit(0);
}

const rows = readFileSync(resultsPath, 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .filter(Boolean)
  .map((line) => {
    const [flow, status, seconds, note = ''] = line.split('\t');
    return { flow, status, seconds: Number(seconds) || 0, note };
  });

const esc = (s) =>
  String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
const slugOf = (flow) => flow.replace(/^e2e\//, '').replace(/\//g, '__').replace(/\.yaml$/, '');

// ---------- merged JUnit ----------
const junitDir = join(out, 'junit');
const cases = [];
for (const r of rows) {
  const file = join(junitDir, `${slugOf(r.flow)}.xml`);
  const xml = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const found = xml.match(/<testcase\b[\s\S]*?(?:\/>|<\/testcase>)/g);
  if (r.status === 'skipped') {
    cases.push(`<testcase name="${esc(r.flow)}" classname="maestro.${platform}" time="0"><skipped message="${esc(r.note)}"/></testcase>`);
  } else if (found?.length) {
    cases.push(...found);
  } else {
    const failure = r.status === 'failed' ? `<failure message="No JUnit output; see logs/${esc(slugOf(r.flow))}.maestro.log"/>` : '';
    cases.push(`<testcase name="${esc(r.flow)}" classname="maestro.${platform}" time="${r.seconds}">${failure}</testcase>`);
  }
}
const failed = rows.filter((r) => r.status === 'failed').length;
const skipped = rows.filter((r) => r.status === 'skipped').length;
const passed = rows.filter((r) => r.status === 'passed').length;
const total = rows.reduce((s, r) => s + r.seconds, 0);
writeFileSync(
  join(out, 'junit.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n<testsuite name="Maestro ${platform}" tests="${rows.length}" failures="${failed}" skipped="${skipped}" time="${total}">\n${cases.join('\n')}\n</testsuite>\n</testsuites>\n`,
);

// ---------- Markdown summary ----------
const icon = { passed: 'PASS', failed: 'FAIL', skipped: 'SKIP' };
const fmt = (s) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);
const lines = [
  `## Maestro E2E: ${platform === 'ios' ? 'iOS simulator' : 'Android emulator'}`,
  '',
  `**${passed} passed, ${failed} failed, ${skipped} skipped** of ${rows.length} flows in ${fmt(total)}.`,
  '',
  '| Flow | Result | Time | Note |',
  '|---|---|---|---|',
  ...rows.map((r) => `| \`${r.flow.replace(/^e2e\//, '')}\` | ${icon[r.status] ?? r.status} | ${fmt(r.seconds)} | ${r.note.replace(/\|/g, '\\|')} |`),
  '',
  'Artifacts: `screenshots/` (last screen of every flow), `junit.xml`, `logs/` (Maestro + device log), `debug/` (Maestro failure screenshots and command traces).',
  '',
];
const md = lines.join('\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
else console.log(md);
// Keep the Actions log readable as well.
console.log(`Maestro ${platform}: ${passed} passed, ${failed} failed, ${skipped} skipped.`);

// Make sure stray junit files from flows not in results are not silently lost.
if (existsSync(junitDir)) {
  const known = new Set(rows.map((r) => `${slugOf(r.flow)}.xml`));
  for (const f of readdirSync(junitDir)) if (!known.has(f)) console.warn(`Unlisted JUnit file: ${f}`);
}
