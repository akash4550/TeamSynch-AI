process.env.NODE_ENV = 'test';

const testDatabaseUrl =
  process.env.AUTH_TEST_DATABASE_URL
  ?? process.env.DATABASE_URL
  ?? 'postgresql://teamsynch-ai_test:teamsynch-ai_test@127.0.0.1:55433/teamsynch-ai_test';

process.env.AUTH_TEST_DATABASE_URL = testDatabaseUrl;
process.env.DATABASE_URL = testDatabaseUrl;
process.env.DIRECT_DATABASE_URL = testDatabaseUrl;
process.env.REDIS_URL =
  process.env.REDIS_URL
  ?? 'redis://127.0.0.1:56379';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET
  ?? 'test-access-token-secret-change-me-now';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET
  ?? 'test-refresh-token-secret-change-me-now';
process.env.JWT_ISSUER = 'teamsynch-ai-api-test';
process.env.JWT_ACCESS_AUDIENCE = 'teamsynch-ai-api-test';
process.env.JWT_REFRESH_AUDIENCE = 'teamsynch-ai-auth-test';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.AI_PROVIDER = 'MOCK';