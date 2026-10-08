// Minimal Gear API client. Works in Node 18+ and in browsers (uses fetch). No dependencies.
//
//   import { GearClient } from './gear-client.mjs';
//   const gear = new GearClient('https://gear.example.com');
//   await gear.login(applicationToken, email, password, 3600);   // or: new GearClient(base, token)
//   const facilities = await gear.service('core/FacilityService', 'EnumAccountFacilities', { accountID: 0 });
//   const history = await gear.rest('endpointData', { endpointID: 9001, maxCount: 500 });

export class GearError extends Error {
  constructor(faultCode, message, httpStatus) {
    super(`Gear ${faultCode}: ${message}`);
    this.faultCode = String(faultCode);
    this.httpStatus = httpStatus;
  }
}

/** Gear date format: UTC, no milliseconds. */
export function gearDate(date) {
  return new Date(date).toISOString().slice(0, 19);
}

/**
 * Any date Gear returns, as a Date (or null):
 * - Service API DateTime: "/Date(1784030809603+0000)/" (milliseconds since epoch, UTC)
 * - Service API DateTimeDT: {Date: {Year, Month, Day}, Time: {Hour, Minute, Second, Millisecond}}
 * - REST v2: "2026-10-02T14:35:22" (UTC, no zone suffix)
 */
export function parseGearDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const m = /\/Date\((-?\d+)/.exec(value);
    if (m) return new Date(Number(m[1]));
    const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : value + 'Z';
    const t = Date.parse(iso);
    return Number.isNaN(t) ? null : new Date(t);
  }
  if (value.Date) {
    const d = value.Date, t = value.Time || {};
    if (!d.Year) return null; // an empty DateTimeDT comes as year 0
    return new Date(Date.UTC(d.Year, d.Month - 1, d.Day, t.Hour || 0, t.Minute || 0, t.Second || 0, t.Millisecond || 0));
  }
  return null;
}

export class GearClient {
  constructor(baseUrl, accessToken = null) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.accessToken = accessToken;
    this.accountID = 0;
  }

  /** Log in and keep the token. expirationSeconds = 0 means a token without expiry: avoid it. */
  async login(applicationToken, eMail, password, expirationSeconds = 3600) {
    const op = expirationSeconds > 0 ? 'LoginWithExpiration' : 'Login';
    const body = { applicationToken, eMail, password };
    if (expirationSeconds > 0) body.expiration = expirationSeconds;
    const r = await this.#post(`/services/core/AdminService.svc/${op}`, body, `${op}Result`);
    if (!r || !r.AccessToken) {
      throw new GearError('LOGIN', 'no access token returned (two-factor authentication or password change required?)', 200);
    }
    this.accessToken = r.AccessToken;
    this.accountID = r.Account ? r.Account.AccountID : 0;
    return r;
  }

  /** Service API call: service = 'core/DeviceService', op = 'EnumDevices'. Returns the unwrapped result. */
  async service(service, op, params = {}) {
    return this.#post(`/services/${service}.svc/${op}`, { accessToken: this.accessToken, ...params }, `${op}Result`);
  }

  /** REST v2 GET: path = 'alarms' or 'endpointData/incremental/123'. Null/undefined params are dropped. */
  async rest(path, params = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== null && v !== undefined && v !== '') qs.set(k, String(v));
    }
    const url = `${this.baseUrl}/api/v2/${path}${qs.toString() ? '?' + qs : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.accessToken}` } });
    return GearClient.#parse(res, null);
  }

  /** Every page of an incremental stream, from seqFrom, until an empty page. */
  async *incremental(stream, filter, seqFrom = 0, maxCount = 500) {
    let seq = seqFrom;
    for (;;) {
      const page = await this.rest(`${stream}/incremental/${seq}`, { ...filter, maxCount });
      if (!page.length) return;
      yield page;
      seq = Math.max(...page.map((r) => r.SequenceNumber)) + 1;
    }
  }

  async #post(path, body, resultKey) {
    const res = await fetch(this.baseUrl + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return GearClient.#parse(res, resultKey);
  }

  static async #parse(res, resultKey) {
    const text = await res.text();
    if (res.status !== 500 && !res.ok) {
      throw new GearError('HTTP', `${res.status} (wrong base URL or route?)`, res.status);
    }
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new GearError('HTTP', `${res.status} non-JSON response (wrong URL?)`, res.status);
    }
    if (data && typeof data === 'object' && (data.Exception || data.FaultCode !== undefined)) {
      const e = data.Exception || data;
      throw new GearError(e.FaultCode, e.Message || '', res.status);
    }
    if (!res.ok) throw new GearError('HTTP', `${res.status}`, res.status);
    return resultKey && data && resultKey in data ? data[resultKey] : data;
  }
}
