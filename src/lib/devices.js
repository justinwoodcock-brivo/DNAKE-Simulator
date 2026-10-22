const KEY = 'dnake-simulator.devices.v1';

/** Same normalisation as bred-api-ext: AA:BB:CC:DD:EE:FF. Anything that is not 12 hex digits is only uppercased. */
export function normalizeMac(raw) {
  const hex = String(raw ?? '').replace(/[:-]/g, '').toUpperCase();
  return /^[0-9A-F]{12}$/.test(hex) ? hex.match(/.{2}/g).join(':') : String(raw ?? '').trim().toUpperCase();
}

export function loadDevices() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export function saveDevices(devices) {
  try {
    localStorage.setItem(KEY, JSON.stringify(devices));
  } catch {}
}

export const STATUS = {
  enrolled: { label: 'Enrolled', tone: 'idle' },
  pending: { label: 'Waiting to be claimed', tone: 'wait' },
  registered: { label: 'Registered', tone: 'ok' },
  removed: { label: 'Needs re-enroll', tone: 'bad' },
  deregistered: { label: 'De-registered', tone: 'bad' },
};

/** Copies what the API knows about each unit onto the matching device. Returns how many devices matched. */
export function applyImport(devices, units, details, accountId) {
  const byMac = new Map(units.map((unit) => [normalizeMac(unit.macAddress), unit]));
  let matched = 0;
  for (const device of devices) {
    const unit = byMac.get(device.mac);
    if (!unit) continue;
    matched += 1;
    Object.assign(device, {
      account: accountId ?? device.account,
      siteId: String(unit.siteId),
      deviceId: String(unit.deviceId),
      name: unit.name ?? '',
      state: 'registered',
      unit: details?.[unit.deviceId] ?? device.unit ?? null,
    });
  }
  return matched;
}
