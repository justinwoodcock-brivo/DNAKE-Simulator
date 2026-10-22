import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import './style.css';
import { defaultConfig, ENVIRONMENTS, buildRequest, toCurl, curlScript, unresolved } from './lib/request.js';
import { flatten, diff, formatValue } from './lib/diff.js';
import { loadDevices, saveDevices, normalizeMac, applyImport, STATUS } from './lib/devices.js';
import { tokenInfo, stripBearer, INTERCOMS_QUERY, DEREGISTER_MUTATION, unitsQuery } from './lib/token.js';

const STORAGE_KEY = 'dnake-simulator.config.v2';
const inTauri = '__TAURI_INTERNALS__' in window;
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function loadConfig() {
  const base = defaultConfig();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) return { ...base, ...saved, envs: Object.fromEntries(Object.keys(base.envs).map((k) => [k, { ...base.envs[k], ...saved.envs?.[k] }])), network: { ...base.network, ...saved.network }, enroll: { ...base.enroll, ...saved.enroll }, checkIn: { ...base.checkIn, ...saved.checkIn } };
  } catch {}
  return base;
}

const config = loadConfig();
const save = () => {
  const { baseUrl, graphqlUrl, adminToken } = config;
  config.envs[config.environment] = { baseUrl, graphqlUrl, adminToken };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {}
};

const getPath = (path) => path.split('.').reduce((o, k) => o[k], config);
const setPath = (path, value) => {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], config)[last] = value;
};

let activeTab = 'enroll';
const devices = loadDevices();
for (const device of devices) device.env ??= 'local';
let confirmingDeregister = null;
const inEnv = (d) => d.env === config.environment;

function recordDevice(mac, patch) {
  const key = normalizeMac(mac);
  if (!key) return;
  let device = devices.find((d) => inEnv(d) && d.mac === key);
  if (!device) {
    device = { env: config.environment, mac: key, serialNumber: '', secret: '', account: '', state: 'enrolled', enrolledAt: null, lastCheckInAt: null, settings: null };
    devices.unshift(device);
  }
  Object.assign(device, patch);
  saveDevices(devices);
  renderDevices();
}

const COPY_ICON =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';

const stamp = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' }) : 'Never');

const expanded = new Set();
const dash = '<span class="muted">—</span>';
const show = (value, suffix = '') => (value == null || value === '' ? dash : `${esc(value)}${suffix}`);

function detailPanel(d) {
  const unit = d.unit;
  const net = unit?.network;
  const addressing = net?.isDhcp == null ? null : net.isDhcp ? 'DHCP' : 'Static';
  const doors = unit?.doorIds?.length
    ? `<ul class="chips">${unit.doorIds.map((id) => `<li>${esc(id)}</li>`).join('')}</ul>`
    : unit
      ? '<span class="muted">None</span>'
      : '<span class="muted">Import accounts to load doors.</span>';
  return `<div class="detail-grid">
    <section><h4>Settings</h4><dl>
      <div><dt>Volume</dt><dd>${show(d.settings?.volume ?? unit?.volume)}</dd></div>
      <div><dt>Pulse time</dt><dd>${show(unit?.pulseTimeSeconds, ' s')}</dd></div>
      <div><dt>Reader</dt><dd>${unit ? (unit.hasReader ? 'Yes' : 'No') : dash}</dd></div>
    </dl></section>
    <section><h4>Doors</h4>${doors}</section>
    <section><h4>Device</h4><dl>
      <div><dt>Device ID</dt><dd>${show(d.deviceId)}</dd></div>
      <div><dt>Serial number</dt><dd>${show(unit?.serialNumber || d.serialNumber)}</dd></div>
      <div><dt>Firmware</dt><dd>${show(unit?.firmwareVersion)}</dd></div>
      <div><dt>Addressing</dt><dd>${show(addressing)}</dd></div>
      <div><dt>IP address</dt><dd>${show(net?.ipAddress)}</dd></div>
      <div><dt>Subnet mask</dt><dd>${show(net?.subnetMask)}</dd></div>
      <div><dt>Gateway</dt><dd>${show(net?.gateway)}</dd></div>
      <div><dt>Last seen by the API</dt><dd>${unit?.lastSeen ? esc(stamp(unit.lastSeen)) : dash}</dd></div>
    </dl></section>
  </div>`;
}

function renderDevices() {
  const shown = devices.filter(inEnv);
  $('#tab-devices').textContent = shown.length ? `Devices (${shown.length})` : 'Devices';
  const list = $('#devices-list');
  if (!shown.length) {
    list.innerHTML = '<p class="empty">No units yet. Enroll one and it is listed here with its status.</p>';
    return;
  }
  list.innerHTML = `<table class="devices">
    <thead><tr><th class="toggle"><span class="sr">Details</span></th><th>Unit</th><th>Status</th><th>Account</th><th>Site</th><th>Last check-in</th><th><span class="sr">Actions</span></th></tr></thead>
    <tbody>${shown
      .map((d, i) => {
        const status = STATUS[d.state] ?? STATUS.enrolled;
        const open = expanded.has(d.mac);
        return `<tr class="${d.mac === normalizeMac(config.mac) ? 'current' : ''}${open ? ' open' : ''}">
          <td class="toggle"><button class="icon-btn chevron" data-toggle="${esc(d.mac)}" aria-expanded="${open}" aria-controls="details-${i}" title="${open ? 'Hide' : 'Show'} details" aria-label="${open ? 'Hide' : 'Show'} details for ${esc(d.mac)}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button></td>
          <td>${d.name ? `<strong class="unit-name">${esc(d.name)}</strong>` : ''}<span class="mac-line"><code class="mac">${esc(d.mac)}</code><button class="icon-btn" data-copy-mac="${esc(d.mac)}" title="Copy MAC address" aria-label="Copy MAC address ${esc(d.mac)}">${COPY_ICON}</button></span><small>${d.serialNumber ? `${esc(d.serialNumber)}, ` : ''}enrolled ${esc(stamp(d.enrolledAt))}</small></td>
          <td><span class="pill ${status.tone}">${status.label}</span></td>
          <td>${d.account ? esc(d.account) : dash}</td>
          <td>${d.siteId ? esc(d.siteId) : dash}</td>
          <td>${esc(stamp(d.lastCheckInAt))}</td>
          <td class="actions">
            ${
              confirmingDeregister === d.mac
                ? `<button class="danger" data-confirm-deregister="${esc(d.mac)}">Confirm de-register</button><button class="ghost" data-cancel-deregister>Cancel</button>`
                : d.deviceId && d.state !== 'deregistered'
                  ? `<button class="ghost" data-deregister="${esc(d.mac)}">De-register</button>`
                  : ''
            }
            <button class="ghost" data-use="${esc(d.mac)}">Use</button>
            <button class="ghost icon" data-forget="${esc(d.mac)}" title="Remove from this list only. The unit is not de-registered." aria-label="Remove ${esc(d.mac)} from this list only">×</button>
          </td>
        </tr>${open ? `<tr class="details" id="details-${i}"><td></td><td colspan="6">${detailPanel(d)}</td></tr>` : ''}`;
      })
      .join('')}</tbody></table>`;
}

function bindForm() {
  for (const el of document.querySelectorAll('[data-key]')) {
    el.value = getPath(el.dataset.key);
    el.addEventListener('input', () => {
      setPath(el.dataset.key, el.type === 'number' ? Number(el.value) : el.value);
      save();
      renderCurl();
      renderFlow();
      if (el.dataset.key === 'intervalSec' && poll.timer) {
        clearInterval(poll.timer);
        poll.timer = setInterval(checkInOnce, Math.max(1, config.intervalSec) * 1000);
      }
    });
  }
}

function renderRows(list) {
  const holder = $(`#rows-${list}`);
  const placeholders = list === 'headers' ? ['Name', 'Value'] : ['name', 'value'];
  holder.innerHTML = config[list]
    .map(
      (row, i) => `<div class="row">
        <input data-list="${list}" data-i="${i}" data-f="k" placeholder="${placeholders[0]}" value="${esc(row.k)}" aria-label="${placeholders[0]}" />
        <input data-list="${list}" data-i="${i}" data-f="v" placeholder="${placeholders[1]}" value="${esc(row.v)}" aria-label="${placeholders[1]}" />
        <button type="button" class="ghost icon" data-remove="${list}:${i}" aria-label="Remove">×</button>
      </div>`,
    )
    .join('');
}

function bindRows() {
  for (const list of ['headers', 'vars']) renderRows(list);
  $('#config').addEventListener('input', (e) => {
    const { list, i, f } = e.target.dataset;
    if (!list) return;
    config[list][i][f] = e.target.value;
    save();
    renderCurl();
  });
  $('#config').addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]')?.dataset.add;
    if (add) {
      config[add].push({ k: '', v: '' });
      renderRows(add);
      $(`#rows-${add} .row:last-child input`).focus();
    }
    const remove = e.target.closest('[data-remove]')?.dataset.remove;
    if (remove) {
      const [list, i] = remove.split(':');
      config[list].splice(Number(i), 1);
      renderRows(list);
      save();
      renderCurl();
    }
  });
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 1800);
}

async function copy(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label} copied`);
  } catch {
    toast('Copy failed. Select the text and copy it manually.');
  }
}

function renderCurl() {
  if (activeTab === 'devices') return;
  const redact = $('#redact').checked;
  $('#curl-out').textContent = toCurl(buildRequest(config, activeTab, { redact }));
}

async function send(req) {
  const headers = req.headers.map((h) => [h.name, h.value]);
  if (inTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('send_request', { request: { method: req.method, url: req.url, headers, body: req.body } });
  }
  const started = performance.now();
  const res = await fetch(req.url, { method: req.method, headers: Object.fromEntries(headers), body: req.body ?? undefined });
  return {
    status: res.status,
    statusText: res.statusText,
    headers: [...res.headers.entries()],
    body: await res.text(),
    elapsedMs: Math.round(performance.now() - started),
  };
}

function problems(req, { needSecret = false } = {}) {
  if (!config.baseUrl.trim()) return 'Enter a base URL.';
  if (!config.mac.trim()) return 'Enter a MAC address, or generate one.';
  if (needSecret && !config.secret.trim()) return 'Enroll the unit first. Check-in needs the secret it returns.';
  const missing = unresolved(req.url, ...req.headers.map((h) => h.value));
  if (missing.length) return `Fill in ${missing.map((m) => `{{${m}}}`).join(', ')} before sending.`;
  return null;
}

const prettyBody = (text) => {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
};

const pill = (res) => `<span class="pill ${res.status < 300 ? 'ok' : 'bad'}">${res.status} ${esc(res.statusText)}</span>`;
const time = () => new Date().toLocaleTimeString('en-GB');
const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const poll = { timer: null, previous: null, lastState: null, feed: [], busy: false };

function setNote(id, text, state) {
  $(`#flow-${id}`).dataset.state = state;
  $(`#flow-${id}-note`).textContent = text;
}

function renderFlow() {
  setNote('enroll', config.secret ? 'Secret saved' : 'Not yet', config.secret ? 'done' : 'idle');
  if (poll.lastState === 'REGISTERED') setNote('claim', 'Claimed', 'done');
  else if (poll.lastState === 'PENDING') setNote('claim', 'Waiting for Add device', 'active');
  else setNote('claim', 'Add device', 'idle');
  if (poll.timer) setNote('checkin', `Every ${Math.max(1, config.intervalSec)}s`, 'active');
  else setNote('checkin', 'Not started', 'idle');
}

const enrollHint = {
  400: 'The API rejected the request. Check the MAC address and serial number.',
  409: 'This unit is already claimed. De-register it in Access before it can enroll again.',
};

async function enroll() {
  const out = $('#enroll-result');
  const btn = $('#btn-enroll');
  const req = buildRequest(config, 'enroll');
  const issue = problems(req);
  if (issue) {
    out.innerHTML = `<div class="result"><p class="error">${esc(issue)}</p></div>`;
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Enrolling…';
  try {
    const res = await send(req);
    const json = parseJson(res.body);
    let extra = '';
    if (res.status < 300 && json?.secret) {
      config.secret = json.secret;
      if (json.pollIntervalSeconds) config.intervalSec = json.pollIntervalSeconds;
      $('[data-key="secret"]').value = config.secret;
      $('[data-key="intervalSec"]').value = config.intervalSec;
      save();
      recordDevice(config.mac, {
        serialNumber: config.serialNumber.trim(),
        secret: config.secret,
        state: 'enrolled',
        enrolledAt: new Date().toISOString(),
        lastCheckInAt: null,
        settings: null,
      });
      renderCurl();
      renderFlow();
      extra = `<p class="next">Saved as this unit's secret. Claim it in onairplus (Add device), then start checking in.</p>`;
    } else if (enrollHint[res.status]) {
      extra = `<p class="error">${esc(enrollHint[res.status])}</p>`;
    }
    out.innerHTML = `<div class="result">
      <div class="result-head">${pill(res)}<span class="muted">${res.elapsedMs} ms</span></div>
      <pre>${esc(prettyBody(res.body) || '(empty response)')}</pre>${extra}
    </div>`;
  } catch (err) {
    out.innerHTML = `<div class="result"><p class="error">Request failed: ${esc(err.message ?? err)}</p></div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enroll unit';
  }
}

function renderSettings(changedKeys = new Set()) {
  const el = $('#settings');
  if (!poll.previous) {
    const text =
      poll.lastState === 'PENDING'
        ? 'Not claimed yet. Settings arrive once the unit is added in onairplus.'
        : 'Nothing yet. Start checking in to pull the unit settings.';
    el.innerHTML = `<p class="empty">${text}</p>`;
    return;
  }
  el.innerHTML = `<dl class="settings">${Object.entries(poll.previous)
    .map(([k, v]) => `<div class="${changedKeys.has(k) ? 'changed' : ''}"><dt>${esc(k)}</dt><dd>${esc(formatValue(v))}</dd></div>`)
    .join('')}</dl>`;
}

function renderFeed() {
  $('#feed').innerHTML = poll.feed
    .map((e) => {
      if (e.error) return `<li class="bad"><time>${e.time}</time><span>${esc(e.error)}</span></li>`;
      if (e.pending) return `<li class="quiet"><time>${e.time}</time><span>PENDING. Waiting for the unit to be claimed</span><em>${e.ms} ms</em></li>`;
      if (e.initial) return `<li class="hit"><time>${e.time}</time><span>REGISTERED. Settings loaded (${e.count})</span><em>${e.ms} ms</em></li>`;
      if (!e.changes.length) return `<li class="quiet"><time>${e.time}</time><span>No changes</span><em>${e.ms} ms</em></li>`;
      return `<li class="hit"><time>${e.time}</time><div>${e.changes
        .map((c) => `<span class="change"><b>${esc(c.path)}</b> <s>${esc(formatValue(c.from))}</s> → ${esc(formatValue(c.to))}</span>`)
        .join('')}</div><em>${e.ms} ms</em></li>`;
    })
    .join('');
}

function pushFeed(entry) {
  poll.feed.unshift({ time: time(), ...entry });
  poll.feed.length = Math.min(poll.feed.length, 200);
  renderFeed();
}

async function checkInOnce() {
  if (poll.busy) return;
  poll.busy = true;
  try {
    const res = await send(buildRequest(config, 'checkIn'));
    if (res.status === 410) {
      recordDevice(config.mac, { state: 'removed' });
      pushFeed({ error: '410. The unit is not registered. Enroll it again.' });
      setPolling(false);
      return;
    }
    if (res.status === 401) {
      pushFeed({ error: '401. The secret was rejected. A newer enroll replaces the old secret.' });
      setPolling(false);
      return;
    }
    const json = parseJson(res.body);
    if (res.status >= 300 || !json) {
      pushFeed({ error: `${res.status} ${res.statusText}: ${res.body.slice(0, 160)}` });
      return;
    }
    if (json.state === 'PENDING') {
      poll.lastState = 'PENDING';
      recordDevice(config.mac, { state: 'pending', lastCheckInAt: new Date().toISOString() });
      poll.previous = null;
      pushFeed({ pending: true, ms: res.elapsedMs });
      renderSettings();
    } else {
      const current = flatten(json.settings ?? {});
      recordDevice(config.mac, { state: 'registered', lastCheckInAt: new Date().toISOString(), settings: current });
      if (poll.lastState !== 'REGISTERED' || !poll.previous) {
        poll.previous = current;
        pushFeed({ initial: true, count: Object.keys(current).length, ms: res.elapsedMs });
        renderSettings();
      } else {
        const changes = diff(poll.previous, current);
        poll.previous = current;
        pushFeed({ changes, ms: res.elapsedMs });
        renderSettings(new Set(changes.map((c) => c.path)));
      }
      poll.lastState = json.state;
    }
    poll.lastState = json.state;
    renderFlow();
  } catch (err) {
    pushFeed({ error: `Request failed: ${err.message ?? err}` });
  } finally {
    poll.busy = false;
  }
}

function setPolling(on) {
  const btn = $('#btn-poll');
  clearInterval(poll.timer);
  poll.timer = null;
  if (on) {
    const issue = problems(buildRequest(config, 'checkIn'), { needSecret: true });
    if (issue) {
      pushFeed({ error: issue });
      return;
    }
    poll.previous = null;
    poll.lastState = null;
    checkInOnce();
    poll.timer = setInterval(checkInOnce, Math.max(1, config.intervalSec) * 1000);
  }
  btn.textContent = on ? 'Stop checking in' : 'Start checking in';
  btn.classList.toggle('stop', on);
  renderFlow();
}

function selectTab(name) {
  activeTab = name;
  for (const tab of document.querySelectorAll('[data-tab]')) tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
  $('#view-enroll').hidden = name !== 'enroll';
  $('#view-checkIn').hidden = name !== 'checkIn';
  $('#view-devices').hidden = name !== 'devices';
  $('.curl').hidden = name === 'devices';
  renderCurl();
}

const randomMac = () =>
  Array.from({ length: 6 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0'))
    .join(':')
    .toUpperCase();

bindForm();
bindRows();
renderSettings();
renderCurl();
renderFlow();

for (const tab of document.querySelectorAll('[data-tab]')) tab.addEventListener('click', () => selectTab(tab.dataset.tab));
$('#btn-enroll').addEventListener('click', enroll);
$('#btn-poll').addEventListener('click', () => setPolling(!poll.timer));
$('#redact').addEventListener('change', renderCurl);
$('#copy-curl').addEventListener('click', () => copy($('#curl-out').textContent, 'curl'));
$('#copy-all').addEventListener('click', () => copy(curlScript(config, { redact: $('#redact').checked }), 'Script'));
$('#config').addEventListener('input', renderFlow);
$('#gen-mac').addEventListener('click', () => {
  config.mac = randomMac();
  $('[data-key="mac"]').value = config.mac;
  save();
  renderCurl();
});
const randomSerial = () =>
  `DNK-${Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()}`;

$('#gen-serial').addEventListener('click', () => {
  config.serialNumber = randomSerial();
  $('[data-key="serialNumber"]').value = config.serialNumber;
  save();
  renderCurl();
});

const randomSecret = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');

$('#gen-secret').addEventListener('click', () => {
  config.secret = randomSecret();
  $('[data-key="secret"]').value = config.secret;
  save();
  renderCurl();
  renderFlow();
});
$('#clear-secret').addEventListener('click', () => {
  config.secret = '';
  $('[data-key="secret"]').value = '';
  save();
  renderCurl();
  renderFlow();
});

renderDevices();

$('#copy-mac').addEventListener('click', () => {
  if (!config.mac.trim()) return toast('Enter or generate a MAC address first');
  copy(config.mac.trim(), 'MAC address');
});

$('#devices-list').addEventListener('click', (e) => {
  const use = e.target.closest('[data-use]')?.dataset.use;
  const copyMac = e.target.closest('[data-copy-mac]')?.dataset.copyMac;
  const forget = e.target.closest('[data-forget]')?.dataset.forget;
  const toggle = e.target.closest('[data-toggle]')?.dataset.toggle;
  if (toggle) {
    if (!expanded.delete(toggle)) expanded.add(toggle);
    renderDevices();
  }
  const deregister = e.target.closest('[data-deregister]')?.dataset.deregister;
  const confirmDeregister = e.target.closest('[data-confirm-deregister]')?.dataset.confirmDeregister;
  if (deregister || e.target.closest('[data-cancel-deregister]')) {
    confirmingDeregister = deregister ?? null;
    renderDevices();
  }
  if (confirmDeregister) deregisterUnit(confirmDeregister);
  if (copyMac) copy(copyMac, 'MAC address');
  if (use) {
    const device = devices.find((d) => inEnv(d) && d.mac === use);
    if (poll.timer) setPolling(false);
    Object.assign(config, { mac: device.mac, serialNumber: device.serialNumber, secret: device.secret });
    for (const key of ['mac', 'serialNumber', 'secret']) $(`[data-key="${key}"]`).value = config[key];
    poll.previous = null;
    poll.lastState = null;
    save();
    renderCurl();
    renderFlow();
    renderSettings();
    renderDevices();
    toast('Unit loaded into the sidebar');
  }
  if (forget) {
    devices.splice(devices.findIndex((d) => inEnv(d) && d.mac === forget), 1);
    saveDevices(devices);
    renderDevices();
  }
});

async function gql(query, variables) {
  const token = stripBearer(config.adminToken);
  if (!config.graphqlUrl.trim()) throw new Error('Enter the GraphQL URL.');
  if (!token) throw new Error('Paste an admin token from onairplus.');
  const info = tokenInfo(token);
  if (!info) throw new Error('That does not look like a JWT. Paste the Authorization header value.');
  if (info.expiresAt && info.expiresAt < Date.now()) throw new Error('That token has expired. Copy a fresh one from onairplus.');

  const res = await send({
    method: 'POST',
    url: config.graphqlUrl.trim(),
    headers: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'Authorization', value: token },
    ],
    body: JSON.stringify({ query, variables }),
  });
  const json = parseJson(res.body);
  if (json?.errors?.[0]) throw new Error(json.errors[0].message);
  if (!json?.data) throw new Error(`${res.status} ${res.statusText} ${res.body.slice(0, 160)}`);
  return { data: json.data, info };
}

function importNote(message, isError = false) {
  const note = $('#import-note');
  note.textContent = message;
  note.classList.toggle('error', isError);
}

async function importAccounts() {
  const btn = $('#btn-import');
  importNote('Importing…');
  btn.disabled = true;
  try {
    const { data, info } = await gql(INTERCOMS_QUERY);
    const units = data.getAccountIntercoms ?? [];
    const shown = devices.filter(inEnv);
    const macs = new Set(shown.map((d) => d.mac));
    const mine = units.filter((unit) => macs.has(normalizeMac(unit.macAddress)));
    let details = {};
    let detailNote = '';
    if (mine.length) {
      try {
        const { data: unitData } = await gql(unitsQuery(mine.map((unit) => unit.deviceId)));
        details = Object.fromEntries(mine.map((unit) => [unit.deviceId, unitData[`u${unit.deviceId}`]]).filter(([, value]) => value));
      } catch (err) {
        detailNote = ` Settings and doors were not loaded: ${err.message}`;
      }
    }
    const matched = applyImport(shown, units, details, info.accountId);
    saveDevices(devices);
    renderDevices();
    const account = info.accountId ? `Account ${info.accountId}. ` : 'The token has no account ID claim, so accounts were not filled in. ';
    importNote(`${account}${matched} of ${shown.length} units found in its ${units.length} claimed intercoms. The rest are unclaimed or belong to another account.${detailNote}`);
  } catch (err) {
    importNote(`Import failed: ${err.message ?? err}`, true);
  } finally {
    btn.disabled = false;
  }
}

async function deregisterUnit(mac) {
  const device = devices.find((d) => inEnv(d) && d.mac === mac);
  confirmingDeregister = null;
  if (!device?.deviceId) return renderDevices();
  importNote(`De-registering ${mac}…`);
  try {
    await gql(DEREGISTER_MUTATION, { deviceId: Number(device.deviceId) });
    recordDevice(mac, { state: 'deregistered', deviceId: '', secret: '', settings: null });
    if (normalizeMac(config.mac) === mac) {
      if (poll.timer) setPolling(false);
      config.secret = '';
      $('[data-key="secret"]').value = '';
      save();
      renderCurl();
      renderFlow();
    }
    importNote(`De-registered ${mac}. Its next check-in gets a 410 and it can enroll again.`);
  } catch (err) {
    renderDevices();
    importNote(`De-register failed: ${err.message ?? err}`, true);
  }
}

$('#btn-import').addEventListener('click', importAccounts);

function renderEnv() {
  for (const button of document.querySelectorAll('[data-env]')) {
    button.setAttribute('aria-checked', String(button.dataset.env === config.environment));
  }
  const note = $('#env-note');
  note.hidden = config.environment === 'local';
  note.textContent = `${ENVIRONMENTS[config.environment].label} is shared. Enrolling here creates a real unit record.`;
}

function setEnvironment(name) {
  if (name === config.environment) return;
  if (poll.timer) setPolling(false);
  save();
  config.environment = name;
  Object.assign(config, config.envs[name]);
  const device = devices.find((d) => inEnv(d) && d.mac === normalizeMac(config.mac));
  config.secret = device?.secret ?? '';
  poll.previous = null;
  poll.lastState = null;
  poll.feed = [];
  for (const key of ['baseUrl', 'secret', 'graphqlUrl', 'adminToken']) $(`[data-key="${key}"]`).value = config[key];
  save();
  renderEnv();
  renderCurl();
  renderFeed();
  renderFlow();
  renderSettings();
  renderDevices();
  $('#enroll-result').innerHTML = '';
  $('#import-note').textContent = 'Reads the account from the token, then lists that account\'s claimed units from bred-api-ext and matches them by MAC.';
  $('#import-note').classList.remove('error');
}

for (const button of document.querySelectorAll('[data-env]')) button.addEventListener('click', () => setEnvironment(button.dataset.env));
renderEnv();
