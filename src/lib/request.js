export const SECRET_HEADER = 'x-intercom-unit-secret';
export const SECRET_ENV_VAR = '$DNAKE_SECRET';

export const ENVIRONMENTS = {
  local: { label: 'LOCAL', baseUrl: 'http://localhost:3030', graphqlUrl: 'http://localhost:20002/graphql' },
  int: { label: 'INT', baseUrl: 'https://api.int.brivo.com', graphqlUrl: 'https://access-gql.int.brivo.com/graphql' },
  qa: { label: 'QA', baseUrl: 'https://api-qa.brivo.com', graphqlUrl: 'https://access-gql.qa.brivo.com/graphql' },
};

const environmentSettings = () =>
  Object.fromEntries(Object.entries(ENVIRONMENTS).map(([key, env]) => [key, { baseUrl: env.baseUrl, graphqlUrl: env.graphqlUrl, adminToken: '' }]));

export const defaultConfig = () => ({
  environment: 'local',
  envs: environmentSettings(),
  baseUrl: ENVIRONMENTS.local.baseUrl,
  mac: '',
  serialNumber: '',
  firmwareVersion: '',
  network: { isDhcp: '', ipAddress: '', subnetMask: '', gateway: '' },
  secret: '',
  graphqlUrl: ENVIRONMENTS.local.graphqlUrl,
  adminToken: '',
  intervalSec: 60,
  enroll: { path: '/api/ext/intercom-unit/enroll' },
  checkIn: { path: '/api/ext/intercom-unit/{{mac}}/check-in' },
  headers: [],
  vars: [],
});

const PLACEHOLDER = /\{\{\s*([\w.-]+)\s*\}\}/g;

export function templateVars(config) {
  const vars = { mac: config.mac, serialNumber: config.serialNumber };
  for (const { k, v } of config.vars) if (k) vars[k] = v;
  return vars;
}

export function render(template, vars) {
  return template.replace(PLACEHOLDER, (match, key) => (vars[key] ? vars[key] : match));
}

export function unresolved(...texts) {
  const found = new Set();
  for (const text of texts) for (const m of text.matchAll(PLACEHOLDER)) found.add(m[1]);
  return [...found];
}

const filled = (value) => typeof value === 'string' && value.trim() !== '';

function enrollBody(config) {
  const body = { macAddress: config.mac.trim() };
  if (filled(config.serialNumber)) body.serialNumber = config.serialNumber.trim();
  return body;
}

function checkInBody(config) {
  const body = {};
  if (filled(config.serialNumber)) body.serialNumber = config.serialNumber.trim();
  if (filled(config.firmwareVersion)) body.firmwareVersion = config.firmwareVersion.trim();
  const { isDhcp, ...addresses } = config.network;
  const network = {};
  if (isDhcp === 'true' || isDhcp === 'false') network.isDhcp = isDhcp === 'true';
  for (const [key, value] of Object.entries(addresses)) if (filled(value)) network[key] = value.trim();
  if (Object.keys(network).length) body.network = network;
  return body;
}

/** kind: 'enroll' | 'checkIn'. With redact, the secret becomes $DNAKE_SECRET. */
export function buildRequest(config, kind, { redact = false } = {}) {
  const vars = templateVars(config);
  const path = render(config[kind].path, vars);
  const body = JSON.stringify(kind === 'enroll' ? enrollBody(config) : checkInBody(config));

  const headers = [
    { name: 'Accept', value: 'application/json' },
    { name: 'Content-Type', value: 'application/json' },
  ];
  if (kind === 'checkIn') {
    headers.push({ name: SECRET_HEADER, value: redact ? SECRET_ENV_VAR : config.secret, shell: redact });
  }
  for (const { k, v } of config.headers) if (k) headers.push({ name: k, value: render(v, vars) });

  const base = config.baseUrl.trim().replace(/\/+$/, '');
  const url = `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  return { method: 'POST', url, headers, body };
}

const singleQuote = (s) => `'${s.replaceAll("'", `'\\''`)}'`;

export function toCurl(req) {
  const lines = [`curl -X ${req.method} ${singleQuote(req.url)}`];
  for (const h of req.headers) {
    const text = `${h.name}: ${h.value}`;
    lines.push(`-H ${h.shell ? `"${text}"` : singleQuote(text)}`);
  }
  lines.push(`-d ${singleQuote(req.body)}`);
  return lines.join(' \\\n  ');
}

export function curlScript(config, { redact = true } = {}) {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    '# 1. Enroll the unit. The response contains the secret, shown once. Export it as DNAKE_SECRET.',
    toCurl(buildRequest(config, 'enroll', { redact })),
    '',
    '# 2. Claim the unit in onairplus (Add device), then check in. Repeat on an interval to mimic the unit.',
    redact ? '# export DNAKE_SECRET=<secret from step 1>' : '',
    toCurl(buildRequest(config, 'checkIn', { redact })),
    '',
  ].join('\n');
}
