# CashFlowIQ API

Production-oriented Node.js/TypeScript API for cash-flow tracking, reports, OCR receipt scanning, chat, authentication, and Apple subscription verification.

## Local development

Requires Node.js 20–24 and MongoDB.

```bash
npm ci
npm run dev
```

Create a local `.env` with the required runtime values. Optional Google OAuth and Apple subscriptions remain unavailable until their feature flags and credentials are configured.

## Quality gates

```bash
npm run verify
npm audit --omit=dev --audit-level=high
```

`verify` runs the TypeScript build, ESLint, Prettier, and the Jest regression suite. CI runs the same gates on pull requests and pushes to `main`.

## Production

Build and start directly:

```bash
npm ci
npm run verify
npm run build
npm run production:prepare
npm start
```

The database preflight is mandatory before the first deployment of a release. It is idempotent and should run as a single deployment job, not from every replica.

Container builds are supported with the included `Dockerfile`. Supply production configuration through the deployment platform's secret manager and run the database preflight once before rolling out application replicas.

Notice downloads use private S3 objects and response-time presigned URLs. The
runtime AWS identity must allow `s3:GetObject` for the `notices/*` prefix.
`S3_PRESIGNED_URL_EXPIRES_IN` is optional, defaults to 900 seconds, and may be
set to at most 604800 seconds.

Health endpoints:

- `GET /health/live`
- `GET /health/ready`
