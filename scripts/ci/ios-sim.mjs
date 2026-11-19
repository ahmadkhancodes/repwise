#!/usr/bin/env node
// Pick (or create) an iPhone 16-class simulator on the newest installed iOS runtime and print its UDID.
// Preference: iPhone 16, iPhone 16 Pro, iPhone 17, iPhone 17 Pro, then any iPhone 16-19 (not Plus/Max/e).
// Usage: node scripts/ci/ios-sim.mjs            → prints the UDID (does not boot it)
// Env:   SIM_NAME  exact device name to prefer (e.g. "iPhone 16 Pro")
import { execFileSync } from 'node:child_process';

const simctl = (...args) => execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8' });
const verOf = (runtimeId) =>
  (runtimeId.match(/iOS-(\d+)-(\d+)(?:-(\d+))?/) || []).slice(1).map((n) => Number(n || 0));
const cmpVer = (a, b) => {
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (b[i] ?? 0) - (a[i] ?? 0);
  return 0;
};

const preferred = [process.env.SIM_NAME, 'iPhone 16', 'iPhone 16 Pro', 'iPhone 17', 'iPhone 17 Pro'].filter(Boolean);
const classRe = /^iPhone 1[6-9]( Pro)?$/;

const { devices } = JSON.parse(simctl('list', 'devices', 'available', '-j'));
const iosRuntimes = Object.keys(devices)
  .filter((id) => id.includes('SimRuntime.iOS-') && devices[id].length)
  .sort((a, b) => cmpVer(verOf(a), verOf(b)));

for (const runtime of iosRuntimes) {
  const list = devices[runtime];
  const hit =
    preferred.map((name) => list.find((d) => d.name === name)).find(Boolean) ??
    list.find((d) => classRe.test(d.name));
  if (hit) {
    console.error(`Using ${hit.name} on ${runtime.split('.').pop()} (${hit.udid})`);
    console.log(hit.udid);
    process.exit(0);
  }
}

// None available: create one on the newest iOS runtime with an iPhone 16/17 device type.
const { runtimes } = JSON.parse(simctl('list', 'runtimes', 'available', '-j'));
const runtime = runtimes
  .filter((r) => r.platform === 'iOS' || r.identifier.includes('SimRuntime.iOS-'))
  .sort((a, b) => cmpVer(verOf(a.identifier), verOf(b.identifier)))[0];
if (!runtime) {
  console.error('No iOS simulator runtime is installed.');
  process.exit(1);
}
const supported = runtime.supportedDeviceTypes ?? JSON.parse(simctl('list', 'devicetypes', '-j')).devicetypes;
const type =
  preferred.map((name) => supported.find((t) => t.name === name)).find(Boolean) ??
  supported.find((t) => classRe.test(t.name));
if (!type) {
  console.error(`No iPhone 16-class device type for ${runtime.identifier}.`);
  process.exit(1);
}
const udid = simctl('create', `${type.name} (CI)`, type.identifier, runtime.identifier).trim();
console.error(`Created ${type.name} on ${runtime.identifier} (${udid})`);
console.log(udid);
