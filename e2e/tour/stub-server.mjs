#!/usr/bin/env node
// Local stand-in for the Repwise Worker, used only by .github/workflows/record-ios-tour.yml.
//
// The tour build points EXPO_PUBLIC_API_URL at this server (http://127.0.0.1:8787; the simulator
// shares the runner's network). It answers exactly one app route:
//   GET /config → { payments_enabled, plans: null }   (payments start OFF, like the E2E builds)
// Every other app route gets its connection dropped, so the app sees "offline" and runs from
// local SQLite with the rules-only planner, exactly as in the no-API E2E builds.
//
// Tour control routes (called from e2e/tour/stub.js through Maestro's `http`):
//   GET /__tour/payments-on   → /config now says payments_enabled: true (so the paywall can open)
//   GET /__tour/mark?name=X   → appends "X <epoch ms>" to $MARKS_FILE (used to trim the video)
import { appendFileSync } from 'node:fs';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || 8787);
const MARKS = process.env.MARKS_FILE || 'tour-marks.txt';
let paymentsEnabled = false;

const json = (res, body) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  const now = Date.now();
  console.log(`${new Date(now).toISOString()} ${req.method} ${url.pathname}${url.search}`);
  if (url.pathname === '/config') return json(res, { payments_enabled: paymentsEnabled, plans: null });
  if (url.pathname === '/__tour/payments-on') {
    paymentsEnabled = true;
    return json(res, { ok: true, payments_enabled: true });
  }
  if (url.pathname === '/__tour/mark') {
    const name = (url.searchParams.get('name') || 'mark').replace(/[^\w-]/g, '');
    appendFileSync(MARKS, `${name} ${now}\n`);
    return json(res, { ok: true, name, at: now });
  }
  // Anything else (auth, sync, AI, billing): behave like no network.
  req.socket.destroy();
}).listen(PORT, '127.0.0.1', () => console.log(`tour stub listening on 127.0.0.1:${PORT}`));
