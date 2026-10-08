# Gear API skill for Claude Code

A [Claude Code](https://claude.com/claude-code) skill that knows the Cloud Studio Gear IoT platform API:
how to authenticate, where devices, endpoints, live values, history and alarms live, how to send a
command, and the details that usually cost an afternoon (wrapped request bodies, every error as HTTP 500,
WCF date formats, the 500-record cap).

With it, Claude can build a frontend on top of your Gear data, write a sync job to your warehouse, a
fleet-health report, or debug a failing call.

## Install

Clone it into your skills directory:

```bash
# for every project
git clone https://github.com/CloudStudioIoT/gear-api-skill ~/.claude/skills/gear-api
# or for one project
git clone https://github.com/CloudStudioIoT/gear-api-skill .claude/skills/gear-api
```

To update it later, run `git pull` inside that folder.

Then ask Claude things like *"list the offline devices of my Gear account"* or *"build me a page that
shows the live values of a facility"*.

## What you need from your Gear administrator

- The base URL of your instance.
- An **application token** for an application with the API permissions your integration needs
  (Manager → Global → Applications). Every application needs Accounts.Login; read-only integrations
  also need Accounts.Read, Facilities.Read, Devices.Read, Endpoints.Read and Facilities.ReadAlarms.
- A user for the integration, limited to your client, without two-factor authentication.

Never commit tokens or passwords. The examples read them from environment variables or a login form.

## Contents

| Path | What it is |
|------|-----------|
| `SKILL.md` | What Claude reads first: data model, rules and workflows. |
| `references/` | Authentication, REST v2 routes, Service API operations, errors. |
| `examples/gear-client.mjs` | Small client for Node 18+ and browsers. |
| `examples/live-dashboard.html` | One-file frontend: log in, pick a facility, see devices and live values. |
| `examples/dev-proxy.mjs` | Local server for the frontend (`GEAR_URL=... node dev-proxy.mjs`). Browsers cannot call Gear cross-origin. |
| `examples/fleet_health.py` | Fleet report: offline and silent devices, open alarms. Read-only. |
| `scripts/smoke.sh` | Checks that every route and operation in the skill exists on your instance. |

```bash
scripts/smoke.sh https://gear.example.com
GEAR_TOKEN=... scripts/smoke.sh https://gear.example.com    # also runs read-only calls
```

## Scope

The skill covers reading data, alarms, dashboards and sending commands. Creating or editing clients,
devices, alerts, actions and device models is possible through the API but not documented here.

## License

MIT. See [LICENSE](LICENSE).
