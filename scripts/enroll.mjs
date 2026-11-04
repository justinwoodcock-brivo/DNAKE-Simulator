import { loadConfig, USAGE } from './config.mjs';
import { buildRequest, unresolved } from '../src/lib/request.js';

const { config, help } = loadConfig();
if (help) {
  console.log(USAGE('enroll'));
  process.exit(0);
}

if (!config.mac || !config.secret) {
  console.error('A MAC address and the secret are required (--mac/DNAKE_MAC, --secret/DNAKE_SECRET)');
  process.exit(2);
}
const req = buildRequest(config, 'enroll');
const missing = unresolved(req.url, req.body);
if (missing.length) {
  console.error(`Missing values for: ${missing.join(', ')}`);
  process.exit(2);
}

console.log(`${req.method} ${req.url}`);
console.log(req.body);

try {
  const res = await fetch(req.url, {
    method: req.method,
    headers: Object.fromEntries(req.headers.map((h) => [h.name, h.value])),
    body: req.body,
  });
  const text = await res.text();
  console.log(`\n${res.status} ${res.statusText}`);
  let json = null;
  try {
    json = JSON.parse(text);
    console.log(JSON.stringify(json, null, 2));
  } catch {
    console.log(text);
  }
  if (res.status === 401) console.error('\nSecret rejected. Check the secret for this environment.');
  if (res.status === 409) console.error('\nAlready claimed. De-register the unit in Access before it can enroll again.');
  process.exit(res.ok ? 0 : 1);
} catch (err) {
  console.error(`Request failed: ${err.cause?.message || err.cause?.code || err.message}`);
  process.exit(1);
}
