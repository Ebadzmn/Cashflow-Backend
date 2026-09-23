# Apple subscriptions

The subscription API uses StoreKit 2, Apple's App Store Server API, and App
Store Server Notifications V2. All transaction and notification JWS values are
verified with Apple's official server library before database state changes.

## Configuration

Set the required `APPLE_*` variables through the deployment environment.
Download the In-App Purchase private key from App Store Connect and the Apple
root certificates from Apple PKI. `APPLE_PRODUCT_MAP` is the allowlist that
maps App Store product IDs to this application's existing plans and billing
cycles.

The public Apple root certificates used by `SignedDataVerifier` are stored in
`certs/apple`. Development uses the Sandbox API directly. Production tries the
Production API first and falls back to Sandbox only for a transaction-not-found
response or a bare authorization response that is subsequently validated by
Sandbox.

Example:

```env
APPLE_PRODUCT_MAP={"com.proProfessional.month":{"plan":"Pro-Professional","billingCycle":"monthly"},"com.proProfessional.yearly":{"plan":"Pro-Professional","billingCycle":"yearly"}}
```

Never commit the `.p8` private key or production credentials.

## Endpoints

Authenticated user endpoints under `/api/v1/subscription` (the existing plural
`/api/v1/subscriptions` prefix is also supported):

- `POST /verify` with `transactionId` and `productId`
- `GET /status`
- `POST /restore` with `originalTransactionId`
- `GET /history`

Admin-only endpoints:

- `POST /notifications/test`
- `POST /notifications/history`
- `GET /notifications/history/:notificationId`

Configure the App Store Notifications V2 URL as:

```text
https://YOUR_API_HOST/api/v1/apple/webhook
```

The webhook is intentionally unauthenticated at the HTTP layer; authenticity is
established by verifying Apple's signed payload. Notification UUIDs are stored
uniquely to make repeated deliveries idempotent.

## Existing data

The previous subscription schema trusted dates and purchase tokens supplied by
clients. Those records don't contain verified `productId`,
`originalTransactionId`, or Apple `environment` values. Require affected users
to call `/restore`, or backfill those fields from Apple before relying on the new
`/status` endpoint.
