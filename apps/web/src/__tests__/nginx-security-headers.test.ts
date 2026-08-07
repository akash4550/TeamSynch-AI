/*
 * BUG FIX (#108, 2026-08-06) pins — the production SPA must never again
 * be served without frame/content security headers. The production auth
 * cookie is SameSite=None BY DESIGN (API auth.cookie.ts), so without
 * frame-busting headers every authenticated page is clickjackable. These
 * assertions read the REAL nginx.conf shipped into the web image
 * (apps/web/Dockerfile COPYs it to /etc/nginx/conf.d/default.conf):
 *   1. the four directives exist with `always`,
 *   2. they live inside the SPA `location /` block — NOT at server level,
 *      which would duplicate helmet's headers on proxied /api/ responses,
 *   3. the file contains no C-style comments (nginx only understands '#';
 *      a stray /* block makes `nginx -t` fail and the container unbootable).
 */
import { describe, expect, it } from 'vitest';
// Vite-native raw import of the REAL shipped config (typed via
// vite/client's `*?raw` declaration — no node builtins, so the web
// app's DOM-only tsconfig stays untouched).
import conf from '../../nginx.conf?raw';

/** Extract the body of `location / { ... }` with naive brace matching. */
const extractSpaLocationBlock = (source: string): string => {
  const match = source.match(/location\s+\/\s*\{/);
  if (!match || match.index === undefined) return '';
  let depth = 0;
  const start = match.index + match[0].length - 1;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return '';
};

const spaBlock = extractSpaLocationBlock(conf);

describe('production nginx SPA security headers (BUG FIX #108)', () => {
  it('extracts the SPA location block from the shipped nginx.conf', () => {
    expect(spaBlock.length).toBeGreaterThan(0);
    expect(spaBlock).toContain('try_files $uri $uri/ /index.html;');
  });

  it('refuses framing of the authenticated app shell (clickjacking, SameSite=None cookie)', () => {
    expect(spaBlock).toContain('add_header X-Frame-Options "DENY" always;');
    expect(spaBlock).toContain(
      `add_header Content-Security-Policy "frame-ancestors 'none'" always;`,
    );
  });

  it('pins nosniff + Referrer-Policy with `always` (present on error responses too)', () => {
    expect(spaBlock).toContain('add_header X-Content-Type-Options "nosniff" always;');
    expect(spaBlock).toContain(
      'add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
    );
  });

  it('keeps the headers location-scoped (no server-level add_header duplicating helmet on /api/)', () => {
    const serverLevel = conf.slice(0, conf.indexOf('location /api/'));
    const withoutLocations = serverLevel.replace(
      /# BUG FIX \(#108[\s\S]*?(?=location)/,
      '',
    );
    expect(withoutLocations).not.toContain('add_header');
  });

  it('contains no C-style comments (nginx only understands # — stray /* breaks nginx -t)', () => {
    expect(conf).not.toContain('/*');
    expect(conf).not.toContain('*/');
  });
});
