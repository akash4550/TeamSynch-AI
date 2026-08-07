import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const packageBinary = (packageName, binaryName) => {
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const relativeBinary = typeof packageJson.bin === 'string'
    ? packageJson.bin
    : packageJson.bin?.[binaryName];

  if (!relativeBinary) {
    throw new Error(`Package ${packageName} does not expose the ${binaryName} binary`);
  }

  return path.resolve(path.dirname(packageJsonPath), relativeBinary);
};

const services = [
  {
    name: 'api',
    cwd: path.join(projectRoot, 'apps', 'api'),
    args: [packageBinary('tsx', 'tsx'), 'watch', 'src/server.ts'],
  },
  {
    name: 'web',
    cwd: path.join(projectRoot, 'apps', 'web'),
    args: [packageBinary('vite', 'vite')],
  },
];

const children = [];
let shuttingDown = false;
let exitCode = 0;
let closedChildren = 0;
let forceExitTimer;

const isRunning = (child) =>
  child.pid && child.exitCode === null && child.signalCode === null;

const terminateProcessTree = (child, signal) => {
  if (!isRunning(child)) return;

  if (process.platform === 'win32') {
    const killer = spawn(
      'taskkill.exe',
      ['/pid', String(child.pid), '/t', '/f'],
      { stdio: 'ignore', windowsHide: true },
    );
    killer.on('error', () => child.kill());
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
};

const stopChildren = (signal, code) => {
  if (shuttingDown) return;

  shuttingDown = true;
  exitCode = code;
  for (const child of children) {
    terminateProcessTree(child.process, signal);
  }

  forceExitTimer = setTimeout(() => {
    for (const child of children) {
      terminateProcessTree(child.process, 'SIGKILL');
    }
    process.exit(exitCode);
  }, 5000);
};

for (const service of services) {
  const child = spawn(process.execPath, service.args, {
    cwd: service.cwd,
    detached: process.platform !== 'win32',
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });

  children.push({ name: service.name, process: child });

  child.on('error', (error) => {
    console.error(`[dev] Failed to start ${service.name}: ${error.message}`);
    stopChildren('SIGTERM', 1);
  });

  child.on('close', (code, signal) => {
    closedChildren += 1;

    if (!shuttingDown) {
      const reason = signal ? `signal ${signal}` : `exit code ${code ?? 1}`;
      console.error(`[dev] ${service.name} stopped unexpectedly (${reason}).`);
      stopChildren('SIGTERM', typeof code === 'number' && code !== 0 ? code : 1);
    }

    if (closedChildren === children.length) {
      clearTimeout(forceExitTimer);
      process.exit(exitCode);
    }
  });
}

process.on('SIGINT', () => stopChildren('SIGINT', 130));
process.on('SIGTERM', () => stopChildren('SIGTERM', 143));
process.on('SIGHUP', () => stopChildren('SIGHUP', 129));
if (process.platform === 'win32') {
  process.on('SIGBREAK', () => stopChildren('SIGTERM', 131));
}
