import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const webUrl = new URL(process.env.SMOKE_WEB_URL || 'http://127.0.0.1:8080');
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 120_000);
const retryIntervalMs = 2_000;
const expectedAIProvider = process.env.AI_PROVIDER || 'OPENAI';
const expectedAIModel = process.env.AI_MODEL || 'ci-openai-model';
const smokeOrganizationId = process.env.SMOKE_AUTH_ORGANIZATION_ID
  || '11111111-1111-4111-8111-111111111111';
const smokeEmail = process.env.SMOKE_AUTH_EMAIL || 'production-smoke@example.com';
const smokePassword = process.env.SMOKE_AUTH_PASSWORD || 'SmokePassword123!';

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchUntilReady(url, validate) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = await response.text();
      validate(body, response);
      return body;
    } catch (error) {
      lastError = error;
      await delay(retryIntervalMs);
    }
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || 'unknown error'}`);
}

function findChromiumBrowser() {
  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env['ProgramFiles(x86)'];
  const localAppData = process.env.LOCALAPPDATA;
  const candidates = [
    process.env.SMOKE_BROWSER_PATH,
    process.env.SMOKE_CHROME_PATH,
    programFiles && path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    programFilesX86 && path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    localAppData && path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    programFiles && path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    programFilesX86 && path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    localAppData && path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    'msedge',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate)) {
      if (existsSync(candidate)) {
        return candidate;
      }
      continue;
    }

    const result = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (result.status === 0) {
      return candidate;
    }
  }

  throw new Error('A Chromium browser is required for the production render smoke test');
}

function assertBrowserRender(chromePath) {
  const userDataDirectory = mkdtempSync(path.join(tmpdir(), 'teamsynch-ai-smoke-'));
  let result;

  try {
    result = spawnSync(
      chromePath,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        `--user-data-dir=${userDataDirectory}`,
        '--virtual-time-budget=5000',
        '--dump-dom',
        webUrl.href,
      ],
      { encoding: 'utf8', timeout: 30_000 },
    );
  } finally {
    rmSync(userDataDirectory, { recursive: true, force: true });
  }

  if (result.status !== 0) {
    throw new Error(`Headless browser failed: ${result.stderr || result.error?.message || 'unknown error'}`);
  }

  const root = result.stdout.match(/<div id="root"[^>]*>([\s\S]*?)<\/div>/i);
  if (!root || !root[1].trim()) {
    throw new Error('React did not render content into #root');
  }
}

async function assertSocketProxy() {
  const socketUrl = new URL('/socket.io/?EIO=4&transport=websocket', webUrl);
  socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';

  await new Promise((resolve, reject) => {
    const socket = new WebSocket(socketUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('Timed out waiting for the Socket.IO authentication response'));
    }, 10_000);

    socket.addEventListener('message', (event) => {
      const message = String(event.data);

      if (message.startsWith('0')) {
        socket.send(`40${JSON.stringify({ token: 'invalid-production-smoke-token' })}`);
        return;
      }

      if (message === '2') {
        socket.send('3');
        return;
      }

      if (message.startsWith('44') && message.includes('Authentication error')) {
        clearTimeout(timer);
        socket.close();
        resolve();
      }
    });

    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('WebSocket upgrade through the production web boundary failed'));
    });
  });
}

function cookieFrom(response) {
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  const refreshCookie = setCookies.find((value) => value.startsWith('teamsynch-ai_refresh='));
  if (!refreshCookie) {
    throw new Error('Authentication response did not set the refresh cookie');
  }
  return { header: refreshCookie, pair: refreshCookie.split(';', 1)[0] };
}

async function jsonResponse(pathname, options, expectedStatus) {
  const response = await fetch(new URL(pathname, webUrl), {
    ...options,
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json();
  if (response.status !== expectedStatus) {
    throw new Error(`${pathname} returned HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  return { response, body };
}

async function assertAuthenticationBoundary() {
  const origin = webUrl.origin;
  const login = await jsonResponse('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      organizationId: smokeOrganizationId,
      email: smokeEmail,
      password: smokePassword,
    }),
  }, 200);

  if (typeof login.body.data?.accessToken !== 'string' || login.body.data.refreshToken !== undefined) {
    throw new Error('Login did not return the browser-safe token contract');
  }
  const loginCookie = cookieFrom(login.response);
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api/v1/auth']) {
    if (!loginCookie.header.includes(attribute)) {
      throw new Error(`Refresh cookie is missing ${attribute}`);
    }
  }
  if (/;\s*Domain=/i.test(loginCookie.header)) {
    throw new Error('Refresh cookie unexpectedly declares a Domain attribute');
  }

  const me = await jsonResponse('/api/v1/auth/me', {
    headers: { Authorization: `Bearer ${login.body.data.accessToken}` },
  }, 200);
  if (
    me.body.data?.user?.organizationId !== smokeOrganizationId ||
    me.body.data?.organization?.id !== smokeOrganizationId
  ) {
    throw new Error('/me did not return the authoritative smoke session');
  }

  const refresh = await jsonResponse('/api/v1/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: loginCookie.pair, Origin: origin },
    body: '{}',
  }, 200);
  if (typeof refresh.body.data?.accessToken !== 'string' || refresh.body.data.refreshToken !== undefined) {
    throw new Error('Refresh did not return the browser-safe token contract');
  }
  const rotatedCookie = cookieFrom(refresh.response);
  if (rotatedCookie.pair === loginCookie.pair) {
    throw new Error('Refresh cookie was not rotated');
  }

  await jsonResponse('/api/v1/auth/me', {
    headers: { Authorization: `Bearer ${refresh.body.data.accessToken}` },
  }, 200);

  const logout = await jsonResponse('/api/v1/auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: rotatedCookie.pair, Origin: origin },
    body: '{}',
  }, 200);
  const clearedCookie = cookieFrom(logout.response);
  if (
    !/Max-Age=0/i.test(clearedCookie.header) &&
    !/Expires=Thu, 01 Jan 1970 00:00:00 GMT/i.test(clearedCookie.header)
  ) {
    throw new Error('Logout did not clear the refresh cookie');
  }

  await jsonResponse('/api/v1/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: rotatedCookie.pair, Origin: origin },
    body: '{}',
  }, 401);
}

const indexHtml = await fetchUntilReady(webUrl, (body) => {
  if (!body.includes('id="root"')) {
    throw new Error('Production HTML does not contain #root');
  }
});
console.log('PASS web image serves the production application');

const scriptSources = [...indexHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
if (scriptSources.length === 0) {
  throw new Error('Production HTML does not reference a JavaScript bundle');
}

for (const source of scriptSources) {
  const bundle = await fetchUntilReady(new URL(source, webUrl), () => {});
  if (bundle.includes('http://localhost:4000') || bundle.includes('https://localhost:4000')) {
    throw new Error(`Production browser bundle contains a localhost API dependency: ${source}`);
  }
}
console.log('PASS production browser bundle has no localhost API dependency');

await fetchUntilReady(new URL('/api/v1/system/ready', webUrl), (body) => {
  const payload = JSON.parse(body);

    if (
    payload.status !== 'ready' ||
    payload.database !== 'connected' ||
    payload.redis !== 'connected' ||
    payload.ai?.provider !== expectedAIProvider ||
    payload.ai?.model !== expectedAIModel ||
    payload.ai?.configured !== true
  ) {
    throw new Error(`Unexpected API readiness payload: ${body}`);
  }
});

console.log('PASS API readiness confirms database, Redis, and AI configuration through Nginx');

await assertSocketProxy();
console.log('PASS Socket.IO WebSocket upgrade reaches API authentication through Nginx');

await assertAuthenticationBoundary();
console.log('PASS login, refresh, /me, and logout use browser-safe transport through Nginx');

assertBrowserRender(findChromiumBrowser());
console.log('PASS React mounts in a headless browser from the production web image');
