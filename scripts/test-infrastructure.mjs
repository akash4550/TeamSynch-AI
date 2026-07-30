import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const composeFile = path.join(repositoryRoot, 'docker-compose.test.yml');

const localDatabaseUrl =
  'postgresql://teamsynch-ai_test:teamsynch-ai_test@127.0.0.1:55433/teamsynch-ai_test';
const localRedisUrl = 'redis://127.0.0.1:56379';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const action = process.argv[2];

function run(command, args, environment = process.env) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
    env: environment,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function assertSafeTestDatabaseUrl(rawUrl) {
  let databaseUrl;

  try {
    databaseUrl = new URL(rawUrl);
  } catch {
    throw new Error('The test database URL is invalid.');
  }

  const protocolAllowed =
    databaseUrl.protocol === 'postgresql:'
    || databaseUrl.protocol === 'postgres:';
  const hostname = databaseUrl.hostname.toLowerCase();
  const hostnameAllowed =
    hostname === '127.0.0.1'
    || hostname === 'localhost';
  const port = databaseUrl.port || '5432';
  const portAllowed = port === '5432' || port === '55433';
  const username = decodeURIComponent(databaseUrl.username);
  const databaseName = decodeURIComponent(
    databaseUrl.pathname.replace(/^\//, ''),
  );

  if (
    !protocolAllowed
    || !hostnameAllowed
    || !portAllowed
    || username !== 'teamsynch-ai_test'
    || !['teamsynch-ai_test', 'teamsynch-ai_test_db'].includes(databaseName)
  ) {
    throw new Error(
      'Refusing to use a database that is not the dedicated local test database.',
    );
  }

  return rawUrl;
}

function createTestEnvironment(databaseUrl, redisUrl = localRedisUrl) {
  const safeDatabaseUrl = assertSafeTestDatabaseUrl(databaseUrl);

  return {
    ...process.env,
    NODE_ENV: 'test',
    AUTH_TEST_DATABASE_URL: safeDatabaseUrl,
    DATABASE_URL: safeDatabaseUrl,
    DIRECT_DATABASE_URL: safeDatabaseUrl,
    REDIS_URL: redisUrl,
  };
}

function startInfrastructure() {
  run('docker', [
    'compose',
    '-f',
    composeFile,
    'up',
    '-d',
    '--wait',
  ]);
}

function migrate(databaseUrl) {
  const safeUrl = new URL(assertSafeTestDatabaseUrl(databaseUrl));

  console.log(
    `Applying migrations to ${safeUrl.hostname}:${safeUrl.port || '5432'}${safeUrl.pathname}`,
  );

  run(
    npmCommand,
    ['run', 'migrate:deploy', '--workspace=api'],
    createTestEnvironment(databaseUrl),
  );
}

switch (action) {
  case 'start':
    startInfrastructure();
    migrate(localDatabaseUrl);
    break;

  case 'reset':
    run('docker', [
      'compose',
      '-f',
      composeFile,
      'down',
      '-v',
      '--remove-orphans',
    ]);
    startInfrastructure();
    migrate(localDatabaseUrl);
    break;

  case 'stop':
    run('docker', [
      'compose',
      '-f',
      composeFile,
      'down',
      '--remove-orphans',
    ]);
    break;

  case 'status':
    run('docker', ['compose', '-f', composeFile, 'ps']);
    break;

  case 'migrate': {
    const databaseUrl =
      process.env.AUTH_TEST_DATABASE_URL
      ?? localDatabaseUrl;

    migrate(databaseUrl);
    break;
  }

  case 'test':
    startInfrastructure();
    migrate(localDatabaseUrl);
    run(
      npmCommand,
      ['run', 'test', '--workspace=api', '--', '--runInBand'],
      createTestEnvironment(localDatabaseUrl),
    );
    break;

  default:
    console.error(
      'Usage: node scripts/test-infrastructure.mjs <start|reset|stop|status|migrate|test>',
    );
    process.exit(1);
}
