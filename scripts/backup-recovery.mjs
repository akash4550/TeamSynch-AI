import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const backupsDirectory = path.join(repositoryRoot, 'backups');

const testComposeFile = path.join(
  repositoryRoot,
  'docker-compose.test.yml',
);
const productionComposeFile = path.join(
  repositoryRoot,
  'docker-compose.production.yml',
);
const productionEnvironmentFile = path.join(
  repositoryRoot,
  '.env.production',
);
const verificationComposeFile = path.join(
  repositoryRoot,
  'docker-compose.backup-verify.yml',
);
const testInfrastructureRunner = path.join(
  repositoryRoot,
  'scripts',
  'test-infrastructure.mjs',
);

const action = process.argv[2];
const requestedBackup = process.argv[3];

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const verificationDatabaseUrl =
  'postgresql://teamsynch-ai_restore:teamsynch-ai_restore@127.0.0.1:55434/teamsynch-ai_restore';

const sourceConfigurations = {
  test: {
    label: 'test',
    composeFile: testComposeFile,
  },
  production: {
    label: 'production',
    composeFile: productionComposeFile,
    environmentFile: productionEnvironmentFile,
  },
};

const representativeSnapshotSql = `
SELECT 'Client', COUNT(*)::text FROM "Client"
UNION ALL SELECT 'Organization', COUNT(*)::text FROM "Organization"
UNION ALL SELECT 'Project', COUNT(*)::text FROM "Project"
UNION ALL SELECT 'Task', COUNT(*)::text FROM "Task"
UNION ALL SELECT 'User', COUNT(*)::text FROM "User"
UNION ALL
SELECT '_prisma_migrations', COUNT(*)::text
FROM "_prisma_migrations"
WHERE "finished_at" IS NOT NULL
ORDER BY 1;
`;

const drillFixtureSql = `
BEGIN;

INSERT INTO "Organization" (
  "id",
  "name",
  "slug",
  "createdAt",
  "updatedAt"
)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  'Backup Verification Organization',
  'backup-verification-organization',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "User" (
  "id",
  "organizationId",
  "firstName",
  "lastName",
  "email",
  "password",
  "createdAt",
  "updatedAt"
)
VALUES (
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'Backup',
  'Verifier',
  'backup-verifier@example.test',
  'not-a-real-login-password',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Project" (
  "id",
  "organizationId",
  "name",
  "key",
  "ownerId",
  "createdAt",
  "updatedAt"
)
VALUES (
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  'Backup Verification Project',
  'BVR',
  '10000000-0000-4000-8000-000000000002',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Task" (
  "id",
  "organizationId",
  "projectId",
  "title",
  "reporterId",
  "position",
  "createdAt",
  "updatedAt"
)
VALUES (
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003',
  'Verify restored task data',
  '10000000-0000-4000-8000-000000000002',
  1.000000,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Client" (
  "id",
  "organizationId",
  "name",
  "ownerId",
  "createdAt",
  "updatedAt"
)
VALUES (
  '10000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000001',
  'Backup Verification Client',
  '10000000-0000-4000-8000-000000000002',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

COMMIT;
`;

const fixtureVerificationSql = `
SELECT
  o."slug",
  u."email",
  p."key",
  t."title",
  c."name"
FROM "Organization" o
JOIN "User" u ON u."organizationId" = o."id"
JOIN "Project" p ON p."organizationId" = o."id"
JOIN "Task" t ON t."projectId" = p."id"
JOIN "Client" c ON c."organizationId" = o."id"
WHERE o."id" = '10000000-0000-4000-8000-000000000001';
`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: process.env,
    shell:
      process.platform === 'win32'
      && command.endsWith('.cmd'),
    stdio: 'inherit',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${command} failed with exit code ${result.status ?? 1}.`,
    );
  }
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: process.env,
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }

    throw new Error(
      `${command} failed with exit code ${result.status ?? 1}.`,
    );
  }

  return result.stdout.trim();
}

function composeArguments(configuration, argumentsToAppend) {
  const argumentsList = ['compose'];

  if (configuration.environmentFile) {
    argumentsList.push(
      '--env-file',
      configuration.environmentFile,
    );
  }

  argumentsList.push(
    '-f',
    configuration.composeFile,
    ...argumentsToAppend,
  );

  return argumentsList;
}

function queryDatabase(configuration, sql) {
  return runCapture(
    'docker',
    composeArguments(configuration, [
      'exec',
      '-T',
      'postgres',
      'sh',
      '-c',
      'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --tuples-only --no-align --field-separator "|" --set ON_ERROR_STOP=1 --command "$1"',
      'sh',
      sql,
    ]),
  );
}

function parseSnapshot(rawSnapshot) {
  const snapshot = {};

  for (const line of rawSnapshot.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      continue;
    }

    const [name, count] = trimmedLine.split('|');

    if (!name || count === undefined) {
      throw new Error(`Unexpected snapshot output: ${trimmedLine}`);
    }

    snapshot[name] = count;
  }

  return snapshot;
}

function calculateSha256(filePath) {
  return createHash('sha256')
    .update(readFileSync(filePath))
    .digest('hex')
    .toUpperCase();
}

function timestamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function ensureSourceConfiguration(configuration) {
  if (!existsSync(configuration.composeFile)) {
    throw new Error(
      `Compose file not found: ${configuration.composeFile}`,
    );
  }

  if (
    configuration.environmentFile
    && !existsSync(configuration.environmentFile)
  ) {
    throw new Error(
      'Production backup requires the local .env.production file.',
    );
  }
}

function createBackup(configuration) {
  ensureSourceConfiguration(configuration);
  mkdirSync(backupsDirectory, { recursive: true });

  const backupName =
    `teamsynch-ai-${configuration.label}-${timestamp()}.dump`;
  const backupPath = path.join(backupsDirectory, backupName);
  const manifestPath = `${backupPath}.manifest.json`;
  const containerBackupPath = `/tmp/${backupName}`;

  const sourceSnapshot = parseSnapshot(
    queryDatabase(configuration, representativeSnapshotSql),
  );

  try {
    run(
      'docker',
      composeArguments(configuration, [
        'exec',
        '-T',
        'postgres',
        'sh',
        '-c',
        'pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format custom --file "$1"',
        'sh',
        containerBackupPath,
      ]),
    );

    run(
      'docker',
      composeArguments(configuration, [
        'cp',
        `postgres:${containerBackupPath}`,
        backupPath,
      ]),
    );
  } finally {
    spawnSync(
      'docker',
      composeArguments(configuration, [
        'exec',
        '-T',
        'postgres',
        'rm',
        '-f',
        containerBackupPath,
      ]),
      {
        cwd: repositoryRoot,
        env: process.env,
        stdio: 'ignore',
      },
    );
  }

  const manifest = {
    formatVersion: 1,
    backupFile: backupName,
    createdAt: new Date().toISOString(),
    source: configuration.label,
    bytes: statSync(backupPath).size,
    sha256: calculateSha256(backupPath),
    representativeSnapshot: sourceSnapshot,
  };

  writeFileSync(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  console.log(`Backup created: ${backupPath}`);
  console.log(`Manifest created: ${manifestPath}`);
  console.log(`Bytes: ${manifest.bytes}`);
  console.log(`SHA256: ${manifest.sha256}`);

  return backupPath;
}

function validateVerificationTarget() {
  const rawConfiguration = runCapture('docker', [
    'compose',
    '-f',
    verificationComposeFile,
    'config',
    '--format',
    'json',
  ]);
  const configuration = JSON.parse(rawConfiguration);
  const postgres = configuration.services?.postgres;
  const environment = postgres?.environment ?? {};
  const publishedPort = (postgres?.ports ?? []).find(
    (port) =>
      String(port.target) === '5432'
      && String(port.published) === '55434'
      && port.host_ip === '127.0.0.1',
  );

  if (
    configuration.name !== 'teamsynch-ai-backup-verify'
    || environment.POSTGRES_USER !== 'teamsynch-ai_restore'
    || environment.POSTGRES_DB !== 'teamsynch-ai_restore'
    || !publishedPort
  ) {
    throw new Error(
      'Refusing restore because the target is not the dedicated isolated verification database.',
    );
  }
}

function assertVerificationDatabaseUrl(rawUrl) {
  const databaseUrl = new URL(rawUrl);
  const hostname = databaseUrl.hostname.toLowerCase();
  const port = databaseUrl.port || '5432';
  const username = decodeURIComponent(databaseUrl.username);
  const databaseName = decodeURIComponent(
    databaseUrl.pathname.replace(/^\//, ''),
  );

  if (
    databaseUrl.protocol !== 'postgresql:'
    || hostname !== '127.0.0.1'
    || port !== '55434'
    || username !== 'teamsynch-ai_restore'
    || databaseName !== 'teamsynch-ai_restore'
  ) {
    throw new Error(
      'Refusing migration verification outside the isolated restore database.',
    );
  }

  return rawUrl;
}

function verifyMigrationCompatibility() {
  const safeDatabaseUrl = assertVerificationDatabaseUrl(
    verificationDatabaseUrl,
  );

  console.log(
    'Applying committed migrations to the isolated restored database.',
  );

  run(
    npmCommand,
    ['run', 'migrate:deploy', '--workspace=api'],
    {
      env: {
        ...process.env,
        DATABASE_URL: safeDatabaseUrl,
        DIRECT_DATABASE_URL: safeDatabaseUrl,
      },
    },
  );
}

function findLatestBackup() {
  if (!existsSync(backupsDirectory)) {
    throw new Error('No backups directory exists.');
  }

  const backupFiles = readdirSync(backupsDirectory)
    .filter((name) => name.endsWith('.dump'))
    .map((name) => path.join(backupsDirectory, name))
    .sort(
      (left, right) =>
        statSync(right).mtimeMs - statSync(left).mtimeMs,
    );

  if (backupFiles.length === 0) {
    throw new Error('No backup files were found.');
  }

  return backupFiles[0];
}

function resolveBackupPath() {
  if (!requestedBackup) {
    return findLatestBackup();
  }

  return path.resolve(repositoryRoot, requestedBackup);
}

function resetVerificationDatabase() {
  validateVerificationTarget();

  run('docker', [
    'compose',
    '-f',
    verificationComposeFile,
    'down',
    '-v',
    '--remove-orphans',
  ]);

  run('docker', [
    'compose',
    '-f',
    verificationComposeFile,
    'up',
    '-d',
    '--wait',
  ]);
}

function verifyBackup(backupPath) {
  const manifestPath = `${backupPath}.manifest.json`;

  if (!existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }

  if (!existsSync(manifestPath)) {
    throw new Error(`Backup manifest not found: ${manifestPath}`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const actualHash = calculateSha256(backupPath);

  if (actualHash !== manifest.sha256) {
    throw new Error('Backup SHA-256 verification failed.');
  }

  resetVerificationDatabase();

  const backupName = path.basename(backupPath);
  const containerBackupPath = `/tmp/${backupName}`;
  const verificationConfiguration = {
    composeFile: verificationComposeFile,
  };

  try {
    run('docker', [
      'compose',
      '-f',
      verificationComposeFile,
      'cp',
      backupPath,
      `postgres:${containerBackupPath}`,
    ]);

    run(
      'docker',
      composeArguments(verificationConfiguration, [
        'exec',
        '-T',
        'postgres',
        'pg_restore',
        '--list',
        containerBackupPath,
      ]),
      { stdio: 'ignore' },
    );

    run(
      'docker',
      composeArguments(verificationConfiguration, [
        'exec',
        '-T',
        'postgres',
        'sh',
        '-c',
        'pg_restore --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --no-owner --no-privileges --exit-on-error "$1"',
        'sh',
        containerBackupPath,
      ]),
    );

    verifyMigrationCompatibility();

    const restoredSnapshot = parseSnapshot(
      queryDatabase(
        verificationConfiguration,
        representativeSnapshotSql,
      ),
    );

    if (
      JSON.stringify(restoredSnapshot)
      !== JSON.stringify(manifest.representativeSnapshot)
    ) {
      console.error('Expected snapshot:', manifest.representativeSnapshot);
      console.error('Restored snapshot:', restoredSnapshot);
      throw new Error(
        'Restored representative row counts do not match the backup manifest.',
      );
    }

    if (manifest.source === 'test') {
      const restoredFixture = queryDatabase(
        verificationConfiguration,
        fixtureVerificationSql,
      );

      const expectedFixture =
        'backup-verification-organization'
        + '|backup-verifier@example.test'
        + '|BVR'
        + '|Verify restored task data'
        + '|Backup Verification Client';

      if (restoredFixture.trim() !== expectedFixture) {
        throw new Error(
          'The deterministic recovery fixture did not restore correctly.',
        );
      }
    }

    console.log(`Verified backup: ${backupPath}`);
    console.log(`SHA256: ${actualHash}`);
    console.log('Representative schema and row counts match.');
  } finally {
    spawnSync(
      'docker',
      [
        'compose',
        '-f',
        verificationComposeFile,
        'exec',
        '-T',
        'postgres',
        'rm',
        '-f',
        containerBackupPath,
      ],
      {
        cwd: repositoryRoot,
        env: process.env,
        stdio: 'ignore',
      },
    );
  }
}

function seedDrillFixture() {
  const testConfiguration = sourceConfigurations.test;

  run(
    'docker',
    composeArguments(testConfiguration, [
      'exec',
      '-T',
      'postgres',
      'sh',
      '-c',
      'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 --command "$1"',
      'sh',
      drillFixtureSql,
    ]),
  );
}

function cleanupVerificationDatabase() {
  validateVerificationTarget();

  run('docker', [
    'compose',
    '-f',
    verificationComposeFile,
    'down',
    '-v',
    '--remove-orphans',
  ]);
}

function main() {
  switch (action) {
    case 'create-test':
      createBackup(sourceConfigurations.test);
      break;

    case 'create-production':
      createBackup(sourceConfigurations.production);
      break;

    case 'verify':
      verifyBackup(resolveBackupPath());
      break;

    case 'drill': {
      run(process.execPath, [testInfrastructureRunner, 'start']);
      seedDrillFixture();
      const backupPath = createBackup(sourceConfigurations.test);
      verifyBackup(backupPath);
      break;
    }

    case 'cleanup':
      cleanupVerificationDatabase();
      break;

    default:
      console.error(
        'Usage: node scripts/backup-recovery.mjs <create-test|create-production|verify [backup]|drill|cleanup>',
      );
      process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
}
