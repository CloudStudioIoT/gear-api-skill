#!/usr/bin/env bash
# Checks that every route and operation this skill teaches exists on a Gear instance.
#
#   scripts/smoke.sh https://gear.example.com
#   GEAR_TOKEN=<access token> scripts/smoke.sh https://gear.example.com   # also makes read-only calls
#
# Without a token it proves the routes exist: REST v2 answers "access token is invalid" (FaultCode 8001)
# instead of a 404 page, and each service operation is listed on its /help page.
# With a token it lists the account's facilities, the devices of the first one, its open alarms and the
# latest value of one endpoint. Nothing is written. Needs curl and python3.
set -uo pipefail

BASE="${1:?usage: smoke.sh <base-url>}"; BASE="${BASE%/}"
FAKE=00000000-0000-0000-0000-000000000001
fails=0
ok()   { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s  (%s)\n' "$1" "$2"; fails=$((fails+1)); }

echo "== $BASE"
[ "$(curl -s --max-time 20 "$BASE/api/v2/status")" = '"OK"' ] && ok "api/v2/status" || fail "api/v2/status" "not \"OK\""

echo "== REST v2 routes"
for r in "alarms/1" "alarms?clientID=1" "alarms/incremental/0?clientID=1" \
         "alerts/1" "alerts?clientID=1" "alerts/incremental/0?clientID=1" \
         "endpointData?endpointID=1" "endpointData/incremental/0?endpointID=1" "endpointData/multiple?endpointIDs=1" \
         "geozones/1" "geozones?clientID=1" "geozones/incremental/0?clientID=1" "smsUsage?clientID=1"; do
  body=$(curl -s --max-time 20 -H "Authorization: Bearer $FAKE" "$BASE/api/v2/$r")
  case "$body" in *'"FaultCode":"8001"'*) ok "GET $r" ;; *) fail "GET $r" "$(printf '%s' "$body" | head -c 80)" ;; esac
done

echo "== Service API operations"
check_ops() {  # service, operations...
  local svc=$1; shift
  local help; help=$(curl -s --max-time 30 "$BASE/services/$svc.svc/help")
  for op in "$@"; do
    case "$help" in *"help/operations/$op\""*|*"help/operations/$op<"*|*"help/operations/$op'"*) ok "$svc/$op" ;; *) fail "$svc/$op" "not on the help page" ;; esac
  done
}
check_ops core/AdminService Login LoginWithExpiration
check_ops core/FacilityService EnumAccountFacilities EnumFacilities GetFacility
check_ops gear/ClientService EnumClients
check_ops core/DeviceService EnumDevices EnumDevicesPaginated GetDevice EnumEndpointsForDevice EnumEndpointsForFacility GetDeviceLiveData
check_ops core/CommandService ExecuteCommand EnumCommandHistory
check_ops core/AlarmService EnumRecentAlarms MarkAlarmAsViewed
check_ops core/DashboardService EnumDashboards GetDashboard ExecuteDashboardToPDF

if [ -n "${GEAR_TOKEN:-}" ]; then
  echo "== Read-only calls with GEAR_TOKEN"
  BASE="$BASE" python3 - <<'PY' || fails=$((fails+1))
import json, os, urllib.request, urllib.error
B, T = os.environ["BASE"], os.environ["GEAR_TOKEN"]
def call(req):
    try:
        with urllib.request.urlopen(req, timeout=60) as r: d = json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        d = json.loads(e.read() or b"null")
    if isinstance(d, dict) and "Exception" in d: raise SystemExit("  FAIL  %s" % d["Exception"])
    return d
def svc(path, op, **p):
    p["accessToken"] = T
    r = urllib.request.Request("%s/services/%s.svc/%s" % (B, path, op), json.dumps(p).encode(), {"Content-Type": "application/json"})
    return call(r)[op + "Result"]
def rest(path):
    return call(urllib.request.Request("%s/api/v2/%s" % (B, path), headers={"Authorization": "Bearer " + T}))
fs = svc("core/FacilityService", "EnumAccountFacilities", accountID=0)
print("  ok    EnumAccountFacilities: %d facilities" % len(fs))
if fs:
    f = fs[0]
    ds = svc("core/DeviceService", "EnumDevices", facilityID=f["FacilityID"])
    print("  ok    EnumDevices(%s): %d devices" % (f["FacilityID"], len(ds)))
    al = rest("alarms?facilityID=%d&state=open" % f["FacilityID"])
    print("  ok    alarms open in facility %s: %d" % (f["FacilityID"], len(al)))
    if ds:
        es = svc("core/DeviceService", "EnumEndpointsForDevice", deviceID=ds[0]["DeviceID"])
        print("  ok    EnumEndpointsForDevice(%s): %d endpoints" % (ds[0]["DeviceID"], len(es)))
        if es:
            v = rest("endpointData/multiple?endpointIDs=%d" % es[0]["EndpointID"])
            print("  ok    endpointData/multiple(%s): %s" % (es[0]["EndpointID"], json.dumps(v)[:100]))
PY
fi

echo
[ $fails -eq 0 ] && echo "All checks passed." || { echo "$fails check(s) failed."; exit 1; }
