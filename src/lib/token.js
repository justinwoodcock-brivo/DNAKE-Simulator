export const ACCOUNT_CLAIM = 'https://brivo.com/account_id';

export function stripBearer(token) {
  return token.trim().replace(/^bearer\s+/i, '');
}

/** Reads the payload of a JWT without verifying it. Returns null if the text is not a JWT. */
export function decodeJwt(token) {
  const part = stripBearer(token).split('.')[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export function tokenInfo(token) {
  const payload = decodeJwt(token);
  if (!payload) return null;
  const accountId = payload[ACCOUNT_CLAIM];
  return {
    accountId: accountId == null ? null : String(accountId),
    expiresAt: typeof payload.exp === 'number' ? payload.exp * 1000 : null,
  };
}

export const DEREGISTER_MUTATION = `mutation ($deviceId: Int!) {
  deregisterIntercomUnit(deviceId: $deviceId) { deviceId }
}`;

const UNIT_FIELDS =
  'deviceId volume pulseTimeSeconds hasReader doorIds serialNumber firmwareVersion lastSeen network { isDhcp ipAddress subnetMask gateway }';

/** One request for the settings and doors of several units. Ids are numbers, so they are safe to inline. */
export const unitsQuery = (deviceIds) =>
  `query { ${deviceIds.map((id) => `u${Number(id)}: getIntercomUnit(deviceId: ${Number(id)}) { ${UNIT_FIELDS} }`).join(' ')} }`;

export const INTERCOMS_QUERY = `query {
  getAccountIntercoms { deviceId siteId name kind macAddress isOnline }
}`;
