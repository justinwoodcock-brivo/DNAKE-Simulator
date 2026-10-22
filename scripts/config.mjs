import { parseArgs } from 'node:util';
import { defaultConfig, ENVIRONMENTS } from '../src/lib/request.js';

const OPTIONS = {
  env: { type: 'string' },
  'base-url': { type: 'string' },
  mac: { type: 'string' },
  'serial-number': { type: 'string' },
  'firmware-version': { type: 'string' },
  secret: { type: 'string' },
  interval: { type: 'string' },
  dhcp: { type: 'string' },
  'ip-address': { type: 'string' },
  'subnet-mask': { type: 'string' },
  gateway: { type: 'string' },
  'enroll-path': { type: 'string' },
  'check-in-path': { type: 'string' },
  header: { type: 'string', multiple: true },
  var: { type: 'string', multiple: true },
  once: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
};

const pair = (text, sep) => {
  const i = text.indexOf(sep);
  return i < 0 ? { k: text.trim(), v: '' } : { k: text.slice(0, i).trim(), v: text.slice(i + 1).trim() };
};

export const USAGE = (name, extra = '') => `Usage: node scripts/${name}.mjs [options]

Each option falls back to an env var; flags win.

  --env <name>              DNAKE_ENV               local | int | qa (default local), sets the base URL
  --base-url <url>          DNAKE_BASE_URL          overrides the environment's URL
  --mac <address>           DNAKE_MAC
  --serial-number <value>   DNAKE_SERIAL_NUMBER     optional
  --firmware-version <v>    DNAKE_FIRMWARE_VERSION  optional, reported on check-in
  --dhcp <true|false>       DNAKE_DHCP              optional, reported on check-in
  --ip-address <ip>         DNAKE_IP_ADDRESS        optional, reported on check-in
  --subnet-mask <ip>        DNAKE_SUBNET_MASK       optional, reported on check-in
  --gateway <ip>            DNAKE_GATEWAY           optional, reported on check-in
  --secret <value>          DNAKE_SECRET            returned by enroll, needed to check in
  --enroll-path <path>      DNAKE_ENROLL_PATH
  --check-in-path <path>    DNAKE_CHECK_IN_PATH
  --header "Name: value"    repeatable              extra request header
  --var name=value          repeatable              extra {{name}} template variable
${extra}  -h, --help
`;

export function loadConfig(argv = process.argv.slice(2)) {
  const { values } = parseArgs({ args: argv, options: OPTIONS });
  const env = process.env;
  const pick = (flag, envName) => values[flag] ?? env[envName];

  const config = defaultConfig();
  const environment = pick('env', 'DNAKE_ENV') ?? 'local';
  if (!ENVIRONMENTS[environment]) throw new Error(`Unknown environment "${environment}". Use local, int or qa.`);
  config.baseUrl = pick('base-url', 'DNAKE_BASE_URL') ?? ENVIRONMENTS[environment].baseUrl;
  config.mac = pick('mac', 'DNAKE_MAC') ?? '';
  config.serialNumber = pick('serial-number', 'DNAKE_SERIAL_NUMBER') ?? '';
  config.firmwareVersion = pick('firmware-version', 'DNAKE_FIRMWARE_VERSION') ?? '';
  config.network.isDhcp = pick('dhcp', 'DNAKE_DHCP') ?? '';
  config.network.ipAddress = pick('ip-address', 'DNAKE_IP_ADDRESS') ?? '';
  config.network.subnetMask = pick('subnet-mask', 'DNAKE_SUBNET_MASK') ?? '';
  config.network.gateway = pick('gateway', 'DNAKE_GATEWAY') ?? '';
  config.secret = pick('secret', 'DNAKE_SECRET') ?? '';
  config.intervalSec = Number(pick('interval', 'DNAKE_INTERVAL') ?? config.intervalSec);
  config.enroll.path = pick('enroll-path', 'DNAKE_ENROLL_PATH') ?? config.enroll.path;
  config.checkIn.path = pick('check-in-path', 'DNAKE_CHECK_IN_PATH') ?? config.checkIn.path;
  config.headers = (values.header ?? []).map((h) => pair(h, ':'));
  config.vars = (values.var ?? []).map((v) => pair(v, '='));
  return { config, once: Boolean(values.once), help: Boolean(values.help), intervalGiven: pick('interval', 'DNAKE_INTERVAL') != null };
}
