# Authentication

## The two tokens

| Token | What it identifies | Where it comes from |
|-------|--------------------|--------------------|
| **Application token** (GUID) | The *application* calling the API, and which API areas it may use | Created by a Gear global administrator in the Manager, **Global → Applications**. Each application has a list of API permissions (Devices.Read, Devices.Operate, Alarms.Acknowledge, ...). |
| **Access token** (GUID) | A user session, issued for one application | `AdminService.Login` with the application token plus the user's e-mail and password. |

An access token can do what **both** allow: the API permissions of its application, and the data
permissions of its user (which clients, facilities and devices that account can see or operate). For an
integration, ask the instance administrator for an application with only the permissions you need and a
dedicated user restricted to the right client.

The Gear web app has its own application token (visible in `/gear/manager/environment.js`). Do not
reuse it for integrations: its permissions are the web app's, and it changes per instance.

## Login

```http
POST {base}/services/core/AdminService.svc/Login
Content-Type: application/json

{"applicationToken": "<APPLICATION_TOKEN>", "eMail": "user@example.com", "password": "<PASSWORD>"}
```

Note the parameter name `eMail` (capital M). The application needs the `Accounts.Login` permission;
without it the answer is FaultCode 8000 "...missing permission Core.Accounts.Login".

Response:

```json
{
  "LoginResult": {
    "AccessToken": "8c1d...-...",
    "Account": {"AccountID": 1234, "EMail": "user@example.com", "Firstname": "Ana", "Lastname": "Ruiz", "LanguageCode": "en"},
    "LoginType": 1,
    "PasswordExpired": false,
    "MustChangePassword": false
  }
}
```

The response has no facilities or client: call `FacilityService.EnumAccountFacilities` with
`"accountID": 0` (0 = the token's own account) to find them. Each facility carries its `ClientID`.

## Token lifetime

- `Login` issues a token **with no practical expiry**. Treat it like a password: never commit it, never
  log it, never ship it inside a frontend bundle.
- For scripts and short sessions prefer **`LoginWithExpiration`**, same body plus `"expiration": <seconds>`:

```json
{"applicationToken": "...", "eMail": "...", "password": "...", "expiration": 3600}
```

- An invalid or expired token returns `FaultCode 8001` ("The access token is invalid or has expired").

## Using the token

| API | How |
|-----|-----|
| REST v2 (`/api/v2/...`) | Header `Authorization: Bearer <token>` (preferred) or query `?accessToken=<token>` |
| Service API (`/services/...svc/...`) | Body key `"accessToken": "<token>"`. Always put it in the body: not every operation reads the header. |

## Accounts with two-factor authentication

If the user's client enforces 2FA, `Login` answers with a `VerificationCode` whose status is not
`NotRequired` and **no access token**. A script cannot complete that step. Use a dedicated integration
user without 2FA, created by the client administrator for that purpose.

Always check `LoginResult.AccessToken` is present before using it; also stop if `PasswordExpired` or
`MustChangePassword` is true.
