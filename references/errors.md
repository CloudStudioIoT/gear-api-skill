# Errors

Every failure comes back as **HTTP 500** with this body, in both APIs:

```json
{"Exception": {"ClassName": "ServiceException", "FaultCode": "8001", "FaultData": "", "Message": "The access token is invalid or has expired"}}
```

`FaultCode` is a string here. Some older paths return the short form `{"FaultCode": 1001}` with a
number: accept both. `Message` is in the account's language; branch on `FaultCode`, show `Message`.

An unknown route returns an HTML "resource cannot be found" page (404), not JSON: if you get HTML,
the URL is wrong.

| FaultCode | Meaning | What to do |
|-----------|---------|-----------|
| 1001 | Invalid login details | Wrong e-mail or password. Do not retry in a loop: accounts get locked. |
| 1015 | Captcha required | Too many failed logins for that account. Stop and let a person log in. |
| 8000 | Application token invalid, or the application lacks an API permission | The message names the missing permission. Ask the instance administrator to add it to the application. |
| 8001 | Access token invalid or expired | Log in again. |
| 8002 | Account disabled | The user behind the token was suspended. |
| 8004 | Access token lacks permission on that object | The user cannot see or operate that client, facility or device. |
| 18004 | Command access denied | The user cannot operate that endpoint. |
| 4008 | No driver for device model | `Uplink` or a command to a device whose model has no driver or script. |
| 100000 | Mandatory field missing | A body key is missing or misspelled (names are case-sensitive). |
| 100004 | Invalid parameter value | Wrong value: two filters at once, bad date format, more than 5 `endpointIDs`. |
| 100001 | Unexpected exception | Server-side error. Report it with the request (without the token). |

Retries: retry only on network errors and timeouts, with backoff. A 500 with a `FaultCode` is an answer,
not a transient failure.
