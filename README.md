# DNAKE Simulator

Test-only Tauri app that fakes a DNAKE door station against bred-api-ext: it enrolls by MAC address, then checks in on an interval and highlights settings that changed. Every request can be exported as curl, and both actions are also available as Node scripts.

## Flow

1. **Enroll**: `POST /api/ext/intercom-unit/enroll` with the MAC (and an optional serial number). The response holds a **secret**, shown once. The app saves it.
2. **Claim**: in onairplus, complete Add device for that MAC. The simulator doesn't do this.
3. **Check in**: `POST /api/ext/intercom-unit/{mac}/check-in` with the `x-intercom-unit-secret` header. It answers `PENDING` until the unit is claimed, then `REGISTERED` with the current `settings` (today, `volume`).

Check-in can start straight after enroll. A `410` means the unit was de-registered and must enroll again. A `409` on enroll means the unit is already claimed. Enrolling again before the claim replaces the secret.

## Run the app

Requires Node 20+ and [Rust](https://v2.tauri.app/start/prerequisites/).

```sh
npm install
npm run tauri dev      # desktop app
npm run tauri build    # packaged app
npm run dev            # UI only in a browser (the API must allow CORS)
```

Settings, including the secret, are saved in the app's local storage. Use the LOCAL, INT and QA selector in the sidebar to switch environments. Each keeps its own base URL, GraphQL URL, admin token and list of units.

## curl export

The curl panel shows the request for the open tab. By default the secret is replaced with `$DNAKE_SECRET`; untick the box to include the real value. **Copy both as script** copies a bash script with both calls.

## Scripts

Flags override env vars (see `.env.example`); run with `--help` for the full list.

```sh
export DNAKE_BASE_URL=http://localhost:3030 DNAKE_MAC=AA:BB:CC:DD:EE:FF

npm run enroll                        # prints the secret as an export line
export DNAKE_SECRET=<secret>
npm run check-in                      # interval defaults to the server's, 60s
npm run check-in -- --interval 5 --firmware-version 1.2.3 --ip-address 192.168.1.50
npm run check-in -- --once
```

`--header "Name: value"` and `--var name=value` add extra headers and `{{name}}` template variables.
