import request from 'supertest';
import app from '../src/app';
import config from '../src/config';

describe('production HTTP safeguards', () => {
  it('returns hardened liveness metadata without framework disclosure', async () => {
    const response = await request(app)
      .get('/health/live')
      .set('X-Request-Id', 'test-request-123');

    expect(response.status).toBe(200);
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-request-id']).toBe('test-request-123');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'cashflow-api',
      requestId: 'test-request-123',
    });
  });

  it('fails readiness while MongoDB is disconnected', async () => {
    const response = await request(app).get('/health/ready');
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      status: 'not_ready',
      database: 'disconnected',
    });
  });

  it('rejects an origin outside the configured allowlist', async () => {
    const originalOrigins = [...config.cors_origins];
    config.cors_origins.splice(
      0,
      config.cors_origins.length,
      'https://app.example',
    );
    const response = await request(app)
      .get('/health/live')
      .set('Origin', 'https://untrusted.example');
    config.cors_origins.splice(
      0,
      config.cors_origins.length,
      ...originalOrigins,
    );

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.requestId).toEqual(expect.any(String));
  });

  it('fails closed when Google OAuth is disabled', async () => {
    const response = await request(app).get('/api/v1/oauth/google');
    expect(response.status).toBe(503);
    expect(response.body.message).toBe('Google OAuth is not enabled');
  });
});
