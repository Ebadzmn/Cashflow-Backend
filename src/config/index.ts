import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envResult = dotenv.config({ path: envPath });
  if (envResult.error) {
    throw new Error(`Unable to load environment file: ${envPath}`);
  }
}

type NodeEnvironment = 'development' | 'test' | 'production';

const requiredEnv = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is not configured in the process environment or ${envPath}`,
    );
  }
  return value;
};

const optionalEnv = (name: string) => process.env[name]?.trim() || '';

const parsePositiveInteger = (
  name: string,
  fallback?: number,
  maximum = Number.MAX_SAFE_INTEGER,
) => {
  const rawValue = process.env[name]?.trim();
  if (!rawValue && fallback !== undefined) return fallback;
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(
      `${name} must be a positive integer no greater than ${maximum}`,
    );
  }
  return value;
};

const parseBoolean = (name: string, fallback?: boolean) => {
  const rawValue = process.env[name]?.trim().toLowerCase();
  if (!rawValue && fallback !== undefined) return fallback;
  if (rawValue === 'true') return true;
  if (rawValue === 'false') return false;
  throw new Error(`${name} must be either true or false`);
};

const commaSeparated = (value: string) =>
  value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

const nodeEnvValue = requiredEnv('NODE_ENV');
if (!['development', 'test', 'production'].includes(nodeEnvValue)) {
  throw new Error('NODE_ENV must be development, test, or production');
}
const nodeEnv = nodeEnvValue as NodeEnvironment;
const isProduction = nodeEnv === 'production';

const databaseUrl = requiredEnv('DATABASE_URL');
if (!/^mongodb(?:\+srv)?:\/\//.test(databaseUrl)) {
  throw new Error('DATABASE_URL must be a MongoDB connection string');
}

const corsOrigins = commaSeparated(requiredEnv('CORS_ORIGINS'));
if (!corsOrigins.length) throw new Error('CORS_ORIGINS cannot be empty');
if (isProduction && corsOrigins.includes('*')) {
  throw new Error('CORS_ORIGINS cannot contain * in production');
}
for (const origin of corsOrigins.filter(origin => origin !== '*')) {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`CORS_ORIGINS contains an invalid origin: ${origin}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`CORS origin must use HTTP or HTTPS: ${origin}`);
  }
  if (parsed.origin !== origin) {
    throw new Error(
      `CORS origin must not include a path or trailing slash: ${origin}`,
    );
  }
  if (isProduction && parsed.protocol !== 'https:') {
    throw new Error(`Production CORS origins must use HTTPS: ${origin}`);
  }
}

const jwtSecret = requiredEnv('JWT_SECRET');
const jwtRefreshSecret = requiredEnv('JWT_REFRESH_SECRET');
const jwtExpireIn = requiredEnv('JWT_EXPIRE_IN');
const jwtRefreshExpireIn = requiredEnv('JWT_REFRESH_EXPIRE_IN');
for (const [name, value] of [
  ['JWT_EXPIRE_IN', jwtExpireIn],
  ['JWT_REFRESH_EXPIRE_IN', jwtRefreshExpireIn],
] as const) {
  if (!/^[1-9]\d*(?:s|m|h|d|w|y)$/.test(value)) {
    throw new Error(`${name} must be a duration such as 15m, 24h, or 30d`);
  }
}
if (isProduction) {
  if (jwtSecret.length < 32 || jwtRefreshSecret.length < 32) {
    throw new Error('JWT secrets must each contain at least 32 characters');
  }
  if (jwtSecret === jwtRefreshSecret) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be different');
  }
}

const bcryptSaltRounds = parsePositiveInteger(
  'BCRYPT_SALT_ROUNDS',
  undefined,
  15,
);
if (bcryptSaltRounds < 10) {
  throw new Error('BCRYPT_SALT_ROUNDS must be at least 10');
}

const googleOAuthEnabled = parseBoolean('GOOGLE_OAUTH_ENABLED', false);
const googleClientId = googleOAuthEnabled
  ? requiredEnv('GOOGLE_OAUTH_CLIENT_ID')
  : optionalEnv('GOOGLE_OAUTH_CLIENT_ID');
const googleClientSecret = googleOAuthEnabled
  ? requiredEnv('GOOGLE_OAUTH_CLIENT_SECRET')
  : optionalEnv('GOOGLE_OAUTH_CLIENT_SECRET');
const googleCallbackUrl = googleOAuthEnabled
  ? requiredEnv('GOOGLE_OAUTH_CALLBACK_URL')
  : optionalEnv('GOOGLE_OAUTH_CALLBACK_URL');
const frontendOAuthCallbackUrl = googleOAuthEnabled
  ? requiredEnv('FRONTEND_OAUTH_CALLBACK_URL')
  : optionalEnv('FRONTEND_OAUTH_CALLBACK_URL');
if (isProduction && googleOAuthEnabled) {
  for (const [name, value] of [
    ['GOOGLE_OAUTH_CALLBACK_URL', googleCallbackUrl],
    ['FRONTEND_OAUTH_CALLBACK_URL', frontendOAuthCallbackUrl],
  ] as const) {
    if (new URL(value).protocol !== 'https:') {
      throw new Error(`${name} must use HTTPS in production`);
    }
  }
}

const appleSubscriptionsEnabled = parseBoolean(
  'APPLE_SUBSCRIPTIONS_ENABLED',
  false,
);
const appleValue = (name: string) =>
  appleSubscriptionsEnabled ? requiredEnv(name) : optionalEnv(name);
const applePrivateKey = optionalEnv('APPLE_PRIVATE_KEY');
const applePrivateKeyPath = optionalEnv('APPLE_PRIVATE_KEY_PATH');
if (appleSubscriptionsEnabled && !applePrivateKey && !applePrivateKeyPath) {
  throw new Error(
    'APPLE_PRIVATE_KEY or APPLE_PRIVATE_KEY_PATH is required when Apple subscriptions are enabled',
  );
}
if (
  appleSubscriptionsEnabled &&
  applePrivateKeyPath &&
  !fs.existsSync(path.resolve(applePrivateKeyPath))
) {
  throw new Error(
    `APPLE_PRIVATE_KEY_PATH does not exist: ${applePrivateKeyPath}`,
  );
}
const appleProductMap = appleValue('APPLE_PRODUCT_MAP');
if (appleSubscriptionsEnabled) {
  let parsedProductMap: unknown;
  try {
    parsedProductMap = JSON.parse(appleProductMap);
  } catch {
    throw new Error('APPLE_PRODUCT_MAP must be valid JSON');
  }
  if (
    !parsedProductMap ||
    typeof parsedProductMap !== 'object' ||
    !Object.keys(parsedProductMap).length
  ) {
    throw new Error('APPLE_PRODUCT_MAP must contain at least one product');
  }
}

const emailPort = parsePositiveInteger('EMAIL_PORT', undefined, 65_535);
const emailFrom = requiredEnv('EMAIL_FROM');
const superAdminPassword = requiredEnv('SUPER_ADMIN_PASSWORD');
const superAdminEmail = requiredEnv('SUPER_ADMIN_EMAIL');
for (const [name, value] of [
  ['EMAIL_FROM', emailFrom],
  ['SUPER_ADMIN_EMAIL', superAdminEmail],
] as const) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error(`${name} must be a valid email address`);
  }
}
if (isProduction && superAdminPassword.length < 12) {
  throw new Error('SUPER_ADMIN_PASSWORD must contain at least 12 characters');
}

const ocrLanguageDataPath =
  optionalEnv('OCR_LANGUAGE_DATA_PATH') || process.cwd();
if (
  isProduction &&
  !fs.existsSync(path.join(ocrLanguageDataPath, 'eng.traineddata'))
) {
  throw new Error(
    'OCR_LANGUAGE_DATA_PATH must contain eng.traineddata in production',
  );
}

const cloudfrontDomain = optionalEnv('CLOUDFRONT_DOMAIN').replace(/\/$/, '');
if (cloudfrontDomain) {
  let cloudfrontUrl: URL;
  try {
    cloudfrontUrl = new URL(cloudfrontDomain);
  } catch {
    throw new Error('CLOUDFRONT_DOMAIN must be a valid URL');
  }
  if (cloudfrontUrl.origin !== cloudfrontDomain) {
    throw new Error('CLOUDFRONT_DOMAIN must not include a path');
  }
  if (isProduction && cloudfrontUrl.protocol !== 'https:') {
    throw new Error('CLOUDFRONT_DOMAIN must use HTTPS in production');
  }
}

const s3PresignedUrlExpiresIn = parsePositiveInteger(
  'S3_PRESIGNED_URL_EXPIRES_IN',
  15 * 60,
  7 * 24 * 60 * 60,
);

const config = {
  ip_address: requiredEnv('IP_ADDRESS'),
  database_url: databaseUrl,
  node_env: nodeEnv,
  port: String(parsePositiveInteger('PORT', undefined, 65_535)),
  database_server_selection_timeout_ms: String(
    parsePositiveInteger('DATABASE_SERVER_SELECTION_TIMEOUT_MS', 10_000),
  ),
  cors_origins: corsOrigins,
  socket_ping_timeout_ms: String(
    parsePositiveInteger('SOCKET_PING_TIMEOUT_MS', 60_000),
  ),
  socket: {
    eventRateLimitWindowMs: parsePositiveInteger(
      'SOCKET_EVENT_RATE_LIMIT_WINDOW_MS',
      60_000,
    ),
    eventRateLimitMax: parsePositiveInteger('SOCKET_EVENT_RATE_LIMIT_MAX', 120),
  },
  bcrypt_salt_rounds: String(bcryptSaltRounds),
  trust_proxy_hops: parsePositiveInteger('TRUST_PROXY_HOPS', 1, 10),
  http: {
    requestTimeoutMs: parsePositiveInteger('HTTP_REQUEST_TIMEOUT_MS', 30_000),
    headersTimeoutMs: parsePositiveInteger('HTTP_HEADERS_TIMEOUT_MS', 65_000),
    keepAliveTimeoutMs: parsePositiveInteger(
      'HTTP_KEEP_ALIVE_TIMEOUT_MS',
      60_000,
    ),
    shutdownTimeoutMs: parsePositiveInteger('SHUTDOWN_TIMEOUT_MS', 15_000),
  },
  rateLimit: {
    windowMs: parsePositiveInteger('RATE_LIMIT_WINDOW_MS', 15 * 60_000),
    max: parsePositiveInteger('RATE_LIMIT_MAX', 300),
    authMax: parsePositiveInteger('AUTH_RATE_LIMIT_MAX', 20),
    expensiveMax: parsePositiveInteger('EXPENSIVE_RATE_LIMIT_MAX', 30),
  },
  jwt: {
    jwt_secret: jwtSecret,
    jwt_expire_in: jwtExpireIn,
    jwt_refresh_secret: jwtRefreshSecret,
    jwt_refresh_expire_in: jwtRefreshExpireIn,
  },
  email: {
    from: emailFrom,
    user: requiredEnv('EMAIL_USER'),
    port: String(emailPort),
    host: requiredEnv('EMAIL_HOST'),
    pass: requiredEnv('EMAIL_PASS'),
  },
  brand: {
    logo_url: optionalEnv('BRAND_LOGO_URL'),
  },
  storage: {
    s3: {
      bucket: requiredEnv('AWS_BUCKET'),
      region: requiredEnv('AWS_REGION'),
      presignedUrlExpiresIn: s3PresignedUrlExpiresIn,
    },
    cloudfrontDomain,
  },
  ocr: {
    languageDataPath: ocrLanguageDataPath,
  },
  super_admin: {
    email: superAdminEmail,
    password: superAdminPassword,
  },
  oauth: {
    google: {
      enabled: googleOAuthEnabled,
      clientID: googleClientId,
      clientSecret: googleClientSecret,
      callbackURL: googleCallbackUrl,
    },
    frontendCallbackURL: frontendOAuthCallbackUrl,
  },
  apple: {
    enabled: appleSubscriptionsEnabled,
    issuerId: appleValue('APPLE_ISSUER_ID'),
    keyId: appleValue('APPLE_KEY_ID'),
    bundleId: appleValue('APPLE_BUNDLE_ID'),
    appAppleId: appleValue('APPLE_APP_ID'),
    privateKey: applePrivateKey,
    privateKeyPath: applePrivateKeyPath,
    rootCertificatePaths: appleValue('APPLE_ROOT_CERTIFICATE_PATHS'),
    productMap: appleProductMap,
    statusCacheMs: String(
      parsePositiveInteger('APPLE_STATUS_CACHE_MS', 60_000, 5 * 60_000),
    ),
  },
};

if (config.http.headersTimeoutMs <= config.http.keepAliveTimeoutMs) {
  throw new Error(
    'HTTP_HEADERS_TIMEOUT_MS must exceed HTTP_KEEP_ALIVE_TIMEOUT_MS',
  );
}

export default config;
