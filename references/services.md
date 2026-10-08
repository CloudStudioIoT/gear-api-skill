# Service API

`POST {base}/services/{area}/{Service}.svc/{Operation}`, `Content-Type: application/json`.

- The body is a JSON object whose keys are the operation's parameter names, **case-sensitive**.
- The response is `{"<Operation>Result": <value>}`.
- Put `accessToken` in the body.
- Every service lists its operations at `{base}/services/{area}/{Service}.svc/help`. The help page names
  the operations but cannot show the bodies; the ones below are taken from the source.

```bash
curl -s -X POST "$GEAR/services/core/DeviceService.svc/EnumDevices" \
  -H 'Content-Type: application/json' \
  -d "{\"accessToken\":\"$GEAR_TOKEN\",\"facilityID\":123}"
```

**Dates in Service API responses** are not ISO strings:

- `DateTime` fields come as `"/Date(1784030809603+0000)/"`: milliseconds since the epoch, UTC.
- `DateTimeDT` fields (alarm and endpoint timestamps) come as
  `{"Date": {"Year": 2026, "Month": 10, "Day": 2}, "Time": {"Hour": 14, "Minute": 35, "Second": 22, "Millisecond": 0}}`.
- Both are UTC. A never-set `DateTime` comes as year 1 (`"/Date(-62135596800000+0000)/"`) and an
  empty `DateTimeDT` as year 0: treat them as empty.

`parseGearDate()` in `examples/gear-client.mjs` handles all of them, and the REST v2 format too.

The permission column is the **API permission** the token's application needs (see `auth.md`); the user
also needs access to the object.

## Account and structure

| Operation | Body | Returns | API permission |
|-----------|------|---------|----------------|
| `core/AdminService.svc/Login` | `applicationToken`, `eMail`, `password` | `AccessTokenResponse` | (application must exist) |
| `core/AdminService.svc/LoginWithExpiration` | same + `expiration` (seconds) | `AccessTokenResponse` | |
| `core/FacilityService.svc/EnumAccountFacilities` | `accessToken`, `accountID` (0 = me) | `Facility[]` | Accounts.Read |
| `core/FacilityService.svc/EnumFacilities` | `accessToken`, `clientID` | `Facility[]` | Facilities.Read |
| `core/FacilityService.svc/GetFacility` | `accessToken`, `facilityID` | `Facility` | Facilities.Read |
| `gear/ClientService.svc/EnumClients` | `accessToken` | `Client[]` | MasterEntities.Read (clients the user can see) |

`Facility` useful fields: `FacilityID`, `ClientID`, `Description`, `IsOnline`, `Location` (`Latitude`,
`Longitude`), `TimeZoneID`, `DefaultDashboardID`, `OperationalStatus`.

## Devices and endpoints

| Operation | Body | Returns | API permission |
|-----------|------|---------|----------------|
| `core/DeviceService.svc/EnumDevices` | `accessToken`, `facilityID` | `Device[]` | Facilities.Read |
| `core/DeviceService.svc/EnumDevicesPaginated` | `accessToken`, `facilityID`, `pageSize`, `pageIndex` (0-based), `filterText` | `{TotalPageCount, Devices[]}` | Facilities.Read |
| `core/DeviceService.svc/GetDevice` | `accessToken`, `deviceID` | `Device` | Devices.Read |
| `core/DeviceService.svc/EnumEndpointsForDevice` | `accessToken`, `deviceID` | `Endpoint[]` | Endpoints.Read |
| `core/DeviceService.svc/EnumEndpointsForFacility` | `accessToken`, `facilityID` | `Endpoint[]` | Endpoints.Read |
| `core/DeviceService.svc/GetDeviceLiveData` | `accessToken`, `deviceID` | `DeviceData` | Devices.Read |

`Device` useful fields: `DeviceID`, `Description`, `FacilityID`, `ClientID`, `Address` (the network
address: DevEUI, IMEI...), `DeviceModel`, `DeviceModelID`, `TechnologyID`, `IsOnline`,
`LastDataDateTime` (UTC, null if it never sent), `LastActivity`, `FirmwareVersion`, `GeoLocation`,
`NumberOfEndpoints`.

`Endpoint` useful fields: `EndpointID`, `DeviceID`, `Description`, `EndpointType`, `VariableTypeID`,
`IASEndpointSubType`, `AccessType`, `Hidden`, `OperationSecurityLevel`, `Tags`.

`DeviceData` (live view of one device): `Device.Description`, `Device.LastUpdate`, `Device.AlarmCount`,
`Device.Batteries`, `Device.RSSIStatuses`, and `Device.Endpoints[]`, each with `Value` (already
formatted as text), `ValueUnit`, `IsOnline` and `ExtendedEndpoint` (the endpoint plus raw values:
`ScalarValue`, `IsOn`, `Level`, `LocationTrackerData`...). Use it to show a device; use REST
`endpointData` to compute with numbers.

## Commands

| Operation | Body | Returns | API permission |
|-----------|------|---------|----------------|
| `core/CommandService.svc/ExecuteCommand` | `accessToken`, `command`, `timeoutSeconds`, `password` | `DeviceCommandResponse` | Devices.Operate |
| `core/CommandService.svc/EnumCommandHistory` | `accessToken`, `deviceID`, `endpointID`, `dateFrom`, `dateTo`, `maxCount` | `DeviceCommandLogEntry[]` | Devices.Read |

`command` is a `DeviceCommand`: `DeviceID`, `EndpointID` and **one** of the typed sub-commands:

```json
{
  "accessToken": "...",
  "command": {"DeviceID": 501, "EndpointID": 9001, "OnOff": {"CommandType": 0}},
  "timeoutSeconds": 30,
  "password": null
}
```

- `OnOff.CommandType`: 0 turn on, 1 turn off, 2 toggle. Optional `AutomaticOverrideMinutes`.
- `Custom`: `{"CommandID": <id>, "CommandData": "<text>"}` for device-model-specific commands.
- `Dimmer`, `Closure`, `Thermostat` and `Management` exist for those endpoint types.
- `password`: only for endpoints with `OperationSecurityLevel` high, which ask the user to retype the
  password. Otherwise `null`.

`DeviceCommandResponse`: `ResponseType` (0 success, 1 error, 2 unsupported), `ErrorCode`,
`ErrorMessage`, `ResponseData`. Many radio devices (LoRaWAN, NB-IoT) apply the command at their next
uplink: success means *accepted*, and the new state shows up in the endpoint data later.

**Always confirm with the user before executing a command**, naming the device, endpoint and action.

## Alarms

Read alarms with REST v2 (`rest-v2.md`). The Service API adds:

| Operation | Body | Returns | API permission |
|-----------|------|---------|----------------|
| `core/AlarmService.svc/EnumRecentAlarms` | `accessToken`, `clientID`, `sinceAlarmID` (null = start), `maxCount` | `{HighestAlarmID, IsInitialState, Items[]}` | Facilities.ReadAlarms |
| `core/AlarmService.svc/MarkAlarmAsViewed` | `accessToken`, `clientID`, `alarmID`, `expectedUSN`, `comment` | `{Success, ErrorCode, NewUpdateSequenceNumber}` | Alarms.Acknowledge |

`MarkAlarmAsViewed` is the acknowledge. `expectedUSN` is the alarm's `UpdateSequenceNumber` (from
`EnumRecentAlarms` items, `Alarm.UpdateSequenceNumber`): if someone else changed the alarm first,
`Success` is false and you must re-read it.

## Dashboards

| Operation | Body | Returns | API permission |
|-----------|------|---------|----------------|
| `core/DashboardService.svc/EnumDashboards` | `accessToken`, `facilityID` | `Dashboard[]` | — |
| `core/DashboardService.svc/GetDashboard` | `accessToken`, `dashboardID` | `Dashboard` | Dashboards.Read |
| `core/DashboardService.svc/ExecuteDashboardToPDF` | `accessToken`, `dashboardID`, `facilityID`, `currentParameters` (`[]`) | URL of the generated PDF | Dashboards.Read |

Rendering widget data yourself (`GetDashboardWidgetData`) depends on each widget type's definition and is
out of scope; to show live values, build from `GetDeviceLiveData` or REST v2 instead.
