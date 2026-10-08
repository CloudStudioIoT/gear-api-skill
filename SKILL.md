---
name: gear-api
description: Build on the Cloud Studio Gear IoT platform API. Use when the user wants to read devices, endpoints, live values, history or alarms from a Gear instance, send a command to a device, list dashboards, build a frontend or app on top of Gear, write a fleet-health or data-export script, or debug a call to Gear (FaultCode, "access token is invalid", 500 responses).
---

# Gear API

Gear is the Cloud Studio IoT platform. Every Gear instance (for example `https://gear.cloud.studio` or a
customer's own domain) exposes the same two APIs:

| API | Style | Use it for |
|-----|-------|-----------|
| **REST v2** — `/api/v2/...` | `GET`, query params, plain JSON | Reading data: endpoint history and latest values, alarms, alerts, geozones. Incremental sync. |
| **Service API** — `/services/{core\|gear}/{Service}.svc/{Operation}` | `POST`, JSON body with named params | Everything else: login, clients, facilities, devices, endpoints, live device data, commands, alarm acknowledge, dashboards. |

Before writing code, read the reference that matches the job:

- `references/auth.md` — how to get an access token and which permissions it carries. **Read first.**
- `references/rest-v2.md` — every REST v2 route, its parameters and response fields.
- `references/services.md` — the service operations this skill covers, with request bodies.
- `references/errors.md` — error format and the codes worth handling.

Working examples (no dependencies) live in `examples/`:

- `examples/gear-client.mjs` — tiny client for Node 18+ and browsers (`fetch`), used by the others.
- `examples/live-dashboard.html` — a one-file frontend: log in, pick a facility, see devices and live values.
- `examples/dev-proxy.mjs` — local server for the frontend: serves the folder and forwards API calls to Gear.
- `examples/fleet_health.py` — fleet report: offline devices, silent devices, open alarms (Python 3, stdlib only).

`scripts/smoke.sh <base-url>` checks that the routes this skill uses exist on an instance. With
`GEAR_TOKEN` set it also makes authenticated read calls.

## Rules that save hours

1. **Data model**: Client → Facility → Device → Endpoint. An *endpoint* is one measured or controlled
   variable of a device (a temperature, a relay, a GPS position). Values, history and commands are
   always per endpoint; alarms point to a device and usually an endpoint.
2. **Every error is HTTP 500** with a JSON body `{"Exception": {"FaultCode": "...", "Message": "..."}}`.
   Never branch on the status code alone; read `FaultCode` (see `references/errors.md`).
3. **Service API bodies are wrapped**: send the parameters as top-level JSON keys with the exact
   parameter names (`{"accessToken": "...", "facilityID": 12}`), and read the result from
   `<Operation>Result` (`{"EnumDevicesResult": [...]}`). Parameter names are case-sensitive here.
4. **Put the token in the body for the Service API** (`accessToken`). REST v2 accepts
   `Authorization: Bearer <token>` or `?accessToken=`.
5. **Dates for REST v2** are UTC, `yyyy-MM-dd` or `yyyy-MM-ddTHH:mm:ss` (optionally with `Z`).
   **No milliseconds**: `new Date().toISOString()` is rejected; strip them
   (`.toISOString().slice(0, 19)`).
   Service API responses use `"/Date(ms+0000)/"` and `{Date:{...},Time:{...}}` instead of ISO strings;
   parse them with `parseGearDate()` from `examples/gear-client.mjs`.
6. **REST v2 caps every list at 500 records** (default 100, `maxCount` to change it). For more, page with
   the `incremental/{seqFrom}` routes: pass the last `SequenceNumber` + 1 until the response is empty.
7. **One filter at a time**: REST v2 list routes take exactly one of `clientID`, `facilityID`,
   `deviceID`, `endpointID`. Zero or two is an error.
8. **Latest values for up to 5 endpoints per call** with `/api/v2/endpointData/multiple?endpointIDs=1,2,3`.
   For a whole device, `DeviceService.GetDeviceLiveData` returns every endpoint with value and unit.
9. **Permissions are two layers**: the *application* the token was issued for must allow the API area
   (Devices.Read, Devices.Operate, Alarms.Acknowledge...), and the *user* must have access to that
   client/facility/device. A valid token can still get "permission denied" on one device.
10. **Commands are real**: `CommandService.ExecuteCommand` switches physical equipment. Never send one
    without the user's explicit confirmation of device, endpoint and action, and never in a loop.

## Typical workflows

**"Show me what's in my account"** → Login (`references/auth.md`) → `FacilityService.EnumAccountFacilities`
with the `AccountID` from the login response → `DeviceService.EnumDevices` per facility →
`DeviceService.GetDeviceLiveData` for the device the user cares about.

**"Export history of a sensor"** → `GET /api/v2/endpointData?endpointID=..&dateFrom=..&dateTo=..&maxCount=500`;
if it returns 500 rows, continue with `/api/v2/endpointData/incremental/{lastSeq+1}?endpointID=..` until
`Timestamp_UTC` passes `dateTo` or the page is empty.

**"Keep my system in sync"** (warehouse, BI, another app) → store the highest `SequenceNumber` per
stream and poll `/api/v2/{endpointData|alarms|alerts}/incremental/{seq+1}?clientID=..`. Empty page =
nothing new, wait and retry. Records are ordered by `SequenceNumber` ascending.

**"Build me a frontend"** → start from `examples/live-dashboard.html` and `examples/gear-client.mjs`.
**A browser cannot call Gear from another origin**: the CORS preflight gets 405 and `Authorization` is not
an allowed header. Serve the frontend behind a reverse proxy that forwards `/api/` and `/services/` to the
instance (`examples/dev-proxy.mjs` does it for local development), or call Gear from your backend. Keep
the token in memory or `sessionStorage`, never in source.

**"Which devices are failing?"** → `examples/fleet_health.py` (offline flag, hours since last data, open
alarms per device).

## What this skill does not cover

Creating or deleting entities, editing alerts and actions, device models and scripts, and the
customer-specific services. They exist in the Service API (each service lists its operations at
`/services/{core|gear}/{Service}.svc/help`), but their bodies are not documented here: read the
operation list, and ask Cloud Studio before writing to production data.
