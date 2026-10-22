import { loadConfig, USAGE } from './config.mjs';
import { buildRequest, unresolved } from '../src/lib/request.js';
import { flatten, diff, formatValue } from '../src/lib/diff.js';

const { config, once, help, intervalGiven } = loadConfig();
if (help) {
  console.log(
    USAGE(
      'check-in',
      '  --interval <seconds>      DNAKE_INTERVAL          default: the interval the server returned, else 60\n  --once                    check in a single time and exit\n'
    )
  );
  process.exit(0);
}

if (!config.mac || !config.secret) {
  console.error('A MAC address and the enroll secret are required (--mac/DNAKE_MAC, --secret/DNAKE_SECRET)');
  process.exit(2);
}
const req = buildRequest(config, 'checkIn');
const missing = unresolved(req.url);
if (missing.length) {
  console.error(`Missing values for: ${missing.join(', ')}`);
  process.exit(2);
}

const stamp = () => new Date().toLocaleTimeString('en-GB');
const headers = Object.fromEntries(req.headers.map((h) => [h.name, h.value]));
let previous = null;
let lastState = null;
let timer = null;
let serverInterval = null;

function stop(code) {
  clearInterval(timer);
  process.exitCode = code;
}

async function checkIn() {
  const started = performance.now();
  try {
    const res = await fetch(req.url, { method: req.method, headers, body: req.body });
    const ms = Math.round(performance.now() - started);
    const text = await res.text();
    if (res.status === 410) {
      console.log(`${stamp()}  410 (${ms}ms)  unit is not registered. Enroll again with: npm run enroll`);
      stop(1);
      return;
    }
    if (res.status === 401) {
      console.log(`${stamp()}  401 (${ms}ms)  secret rejected. A newer enroll replaces the old secret.`);
      stop(1);
      return;
    }
    if (!res.ok) {
      console.log(`${stamp()}  ${res.status} ${res.statusText} (${ms}ms)  ${text.slice(0, 200)}`);
      return;
    }
    const json = JSON.parse(text);
    if (json.state === 'PENDING') {
      console.log(`${stamp()}  200 (${ms}ms)  PENDING, waiting for the unit to be claimed in onairplus`);
    } else {
      const current = flatten(json.settings ?? {});
      if (lastState !== 'REGISTERED' || previous === null) {
        console.log(`${stamp()}  200 (${ms}ms)  REGISTERED, initial settings`);
        for (const [key, value] of Object.entries(current)) console.log(`    ${key} = ${formatValue(value)}`);
      } else {
        const changes = diff(previous, current);
        if (changes.length === 0) console.log(`${stamp()}  200 (${ms}ms)  no changes`);
        else {
          console.log(`${stamp()}  200 (${ms}ms)  ${changes.length} changed`);
          for (const c of changes) console.log(`    ${c.path}: ${formatValue(c.from)} -> ${formatValue(c.to)}`);
        }
      }
      previous = current;
    }
    lastState = json.state;
    serverInterval = json.pollIntervalSeconds ?? serverInterval;
  } catch (err) {
    console.log(`${stamp()}  request failed: ${err.cause?.message || err.cause?.code || err.message}`);
  }
}

const seconds = () => Math.max(1, intervalGiven ? config.intervalSec : (serverInterval ?? config.intervalSec));

console.log(`${req.method} ${req.url}${once ? '' : '  (Ctrl+C to stop)'}\n`);
await checkIn();
if (!once && process.exitCode === undefined) {
  console.log(`\nchecking in every ${seconds()}s`);
  timer = setInterval(checkIn, seconds() * 1000);
}
