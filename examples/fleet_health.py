#!/usr/bin/env python3
"""Fleet health report for a Gear client: offline devices, silent devices and open alarms.

Python 3.8+, standard library only. Read-only: it never changes anything in Gear.

Configuration (environment variables):
  GEAR_URL          base URL of the instance, e.g. https://gear.example.com
  GEAR_TOKEN        access token; or, to log in instead:
  GEAR_APP_TOKEN, GEAR_EMAIL, GEAR_PASSWORD
  GEAR_CLIENT_ID    optional: only this client's facilities (default: every facility of the account)
  SILENT_HOURS      optional: hours without data to call a device silent (default 24)

Usage:
  python3 fleet_health.py            # table on stdout
  python3 fleet_health.py --csv > fleet.csv
"""
import csv
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

BASE = os.environ.get("GEAR_URL", "").rstrip("/")
SILENT_HOURS = float(os.environ.get("SILENT_HOURS", "24"))


class GearError(Exception):
    pass


def _call(req):
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode("utf-8")
    except urllib.error.HTTPError as e:  # Gear answers every error with HTTP 500 and a JSON body
        body = e.read().decode("utf-8", "replace")
        if e.code != 500 or not body:
            raise GearError("HTTP %d (wrong GEAR_URL or route?)" % e.code)
    try:
        data = json.loads(body) if body else None
    except ValueError:
        raise GearError("non-JSON response (wrong GEAR_URL?): " + body[:120])
    if isinstance(data, dict) and ("Exception" in data or "FaultCode" in data):
        e = data.get("Exception", data)
        raise GearError("FaultCode %s: %s" % (e.get("FaultCode"), e.get("Message", "")))
    return data


def service(path, op, **params):
    """Service API: POST /services/{path}.svc/{op} with a wrapped body; returns {op}Result."""
    body = json.dumps(dict(params)).encode("utf-8")
    req = urllib.request.Request("%s/services/%s.svc/%s" % (BASE, path, op), data=body,
                                 headers={"Content-Type": "application/json"})
    return (_call(req) or {}).get(op + "Result")


def rest(path, token, **params):
    """REST v2: GET /api/v2/{path}."""
    qs = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    req = urllib.request.Request("%s/api/v2/%s%s" % (BASE, path, "?" + qs if qs else ""),
                                 headers={"Authorization": "Bearer " + token})
    return _call(req)


def parse_date(value):
    """Gear dates: "/Date(ms+0000)/" (Service API) or "yyyy-MM-ddTHH:mm:ss" UTC (REST v2)."""
    if not value:
        return None
    m = re.match(r"/Date\((-?\d+)", value)
    if m:
        d = datetime.fromtimestamp(int(m.group(1)) / 1000, tz=timezone.utc) if int(m.group(1)) > 0 else None
        return d
    return datetime.strptime(value[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)


def get_token():
    token = os.environ.get("GEAR_TOKEN")
    if token:
        return token
    r = service("core/AdminService", "LoginWithExpiration",
                applicationToken=os.environ["GEAR_APP_TOKEN"], eMail=os.environ["GEAR_EMAIL"],
                password=os.environ["GEAR_PASSWORD"], expiration=3600)
    if not r or not r.get("AccessToken"):
        raise GearError("login returned no access token (two-factor authentication or password change required?)")
    return r["AccessToken"]


def main():
    if not BASE:
        sys.exit("Set GEAR_URL (and GEAR_TOKEN, or GEAR_APP_TOKEN + GEAR_EMAIL + GEAR_PASSWORD).")
    token = get_token()
    client_id = os.environ.get("GEAR_CLIENT_ID")
    if client_id:
        facilities = service("core/FacilityService", "EnumFacilities", accessToken=token, clientID=int(client_id))
    else:
        facilities = service("core/FacilityService", "EnumAccountFacilities", accessToken=token, accountID=0)

    now = datetime.now(timezone.utc)
    rows = []
    for f in sorted(facilities, key=lambda x: x["Description"]):
        devices = service("core/DeviceService", "EnumDevices", accessToken=token, facilityID=f["FacilityID"])
        # One call per facility for open alarms; capped at 500 by the API.
        alarms = rest("alarms", token, facilityID=f["FacilityID"], state="open", maxCount=500)
        open_by_device = {}
        for a in alarms:
            open_by_device[a["DeviceID"]] = open_by_device.get(a["DeviceID"], 0) + 1
        for d in devices:
            last = parse_date(d.get("LastDataDateTime"))
            hours = round((now - last).total_seconds() / 3600, 1) if last else None
            problems = []
            if not d.get("IsOnline"):
                problems.append("offline")
            if hours is None:
                problems.append("never sent data")
            elif hours > SILENT_HOURS:
                problems.append("silent %sh" % int(hours))
            if open_by_device.get(d["DeviceID"]):
                problems.append("%d open alarm(s)" % open_by_device[d["DeviceID"]])
            rows.append({
                "facility": f["Description"], "device": d["Description"], "device_id": d["DeviceID"],
                "model": d.get("DeviceModel") or "", "online": bool(d.get("IsOnline")),
                "hours_since_data": "" if hours is None else hours,
                "open_alarms": open_by_device.get(d["DeviceID"], 0), "problems": ", ".join(problems),
            })

    if "--csv" in sys.argv:
        w = csv.DictWriter(sys.stdout, fieldnames=list(rows[0].keys()) if rows else ["device"])
        w.writeheader()
        w.writerows(rows)
        return

    bad = [r for r in rows if r["problems"]]
    print("%d devices in %d facilities; %d with problems.\n" % (len(rows), len(facilities), len(bad)))
    for r in sorted(bad, key=lambda r: (r["facility"], r["device"])):
        print("%-28.28s  %-32.32s  %s" % (r["facility"], r["device"], r["problems"]))


if __name__ == "__main__":
    try:
        main()
    except GearError as e:
        sys.exit("Gear: %s" % e)
