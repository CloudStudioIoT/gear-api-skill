# REST v2

Base: `{base}/api/v2/` (the same routes also answer under `{base}/services/gear/APIService_v2.svc/`).
All routes are `GET` except `Uplink`. Responses are plain JSON (no `...Result` wrapper).
Auth: `Authorization: Bearer <token>` or `?accessToken=<token>`.

Shared rules:

- `maxCount`: default 100, maximum 500. A larger value is silently capped at 500, so a full page means "there may be more".
- Dates (`dateFrom`, `dateTo`): UTC, `yyyy-MM-dd` or `yyyy-MM-ddTHH:mm:ss`, optional `Z`. No milliseconds.
- List routes take **exactly one** of `clientID`, `facilityID`, `deviceID`, `endpointID`.
- `incremental/{seqFrom}` returns records with `SequenceNumber >= seqFrom`, ascending. Store the highest
  you received and ask for `highest + 1` next time. An empty array means nothing new.
- New *and modified* records get a new, higher `SequenceNumber`: an alarm appears again when it closes.

## Health

| Route | Returns |
|-------|---------|
| `GET status` | `"OK"` without auth. Use it to check the base URL. |

## Endpoint data (values)

| Route | Params | Notes |
|-------|--------|-------|
| `GET endpointData` | `endpointID` (required), `dateFrom`, `dateTo`, `maxCount` | History of one endpoint. |
| `GET endpointData/incremental/{seqFrom}` | one of `clientID`/`facilityID`/`deviceID`/`endpointID`, `maxCount` | Sync stream. |
| `GET endpointData/multiple` | `endpointIDs` = comma-separated, **max 5** | Latest value of each endpoint. |

`EndpointData` fields (only the ones that apply to the endpoint type are filled; the rest are `null`):

| Field | Type | Meaning |
|-------|------|---------|
| `EndpointID` | int | |
| `Description` | string | Endpoint name |
| `Timestamp_UTC` | string | `yyyy-MM-ddTHH:mm:ss`, UTC |
| `SequenceNumber` | long | Sync cursor |
| `Value` | double? | Scalar sensors (temperature, level, counters, IAS zones) |
| `IsOn` | bool? | Relays, plugs, lights |
| `DimLevel` | int? | Dimmers, 0-100 |
| `Position`, `IsMoving` | int?, bool? | Blinds and closures |
| `ActiveEnergy`, `ReactiveEnergy`, `ApparentEnergy` | double? | Energy meters |
| `Latitude`, `Longitude`, `LocationFlags` | double?, double?, int? | GPS trackers. Flags bitmask: 1 moving, 2 no position (lat/lon are 0, not real), 4 malfunction, 8 low precision |

## Alarms

| Route | Params |
|-------|--------|
| `GET alarms/{alarmID}` | — |
| `GET alarms` | one of the four filters, `dateFrom`, `dateTo`, `state` = `open` \| `closed` \| `all` (default all), `maxCount` |
| `GET alarms/incremental/{seqFrom}` | one of the four filters, `maxCount` |

`Alarm` fields: `AlarmID`, `AlarmTypeID`, `AlarmTypeDescription`, `AlarmSeverityID`,
`AlarmSeverityDescription`, `DeviceID`, `DeviceDescription`, `EndpointID` (nullable), `Details`,
`DateTimeCreated_UTC`, `DateTimeClosed_UTC` (null while open), `MTTRMinutes`, `SequenceNumber`.

## Alerts (alarm rules)

| Route | Params |
|-------|--------|
| `GET alerts/{alertID}` | — |
| `GET alerts` | one of `clientID`/`facilityID`/`deviceID`/`endpointID`, `maxCount` |
| `GET alerts/incremental/{seqFrom}` | same filters, `maxCount` |

An alert with `Enabled = false` in the incremental stream means it was deleted.

## Geozones

| Route | Params |
|-------|--------|
| `GET geozones/{geoZoneID}` | — |
| `GET geozones` | `clientID`, `maxCount` |
| `GET geozones/incremental/{seqFrom}` | `clientID`, `maxCount` |

## SMS usage

`GET smsUsage?clientID=..&period=yyyy-MM` — SMS sent in the month. Needs the `SMSUsage.Read` API
permission, which applications created before it existed do not have.

## Uplink (sending data in)

`POST Uplink/{deviceID}` with the raw payload as body. The device's model script decodes it, exactly as
if it came from the network. Needs `Devices.Operate`. For integrations that push data, this is the
entry point; the device and its model must already exist in Gear.

## Not available

There is no REST v2 route to list clients, facilities, devices or endpoints, to send commands or to
read dashboards: use the Service API (`services.md`).
