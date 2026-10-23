import { createServer, type Server, type Socket } from 'node:net';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { sha256Hex } from '../runs/ids.ts';
import type { BrokerRequest, BrokerResponse, BrokerResult } from '../contracts/broker.ts';
import type { Stores } from '../db/store/index.ts';
import type { EmitEvent } from '../agent/loop.ts';

export interface BrokerHandle {
  readonly socketPath: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface BrokerOptions {
  readonly runId: string;
  readonly workDir: string;
  readonly tokenHash: string;
  readonly allowlist: readonly string[];
  readonly maxBytes: number;
  readonly stores: Stores;
  readonly emit: EmitEvent;
}

export function createBroker(options: BrokerOptions): BrokerHandle {
  const socketPath = path.join(options.workDir, '.brz', 'broker.sock');
  let server: Server | null = null;

  const handleRequest = async (req: BrokerRequest): Promise<BrokerResponse> => {
    const at = new Date().toISOString();
    const base: Omit<BrokerResponse, 'ok'> = { protocol: 'brz-broker/1', requestId: req.requestId, at };

    // auth
    const presentedHash = sha256Hex(req.token);
    if (presentedHash !== options.tokenHash || req.runId !== options.runId) {
      logAttempt(options, req, 'denied', 'invalid_token');
      return { ...base, ok: false, error: { code: 'unauthorized', message: 'The request is not authorized.' } };
    }
    if (req.protocol !== 'brz-broker/1') {
      return { ...base, ok: false, error: { code: 'internal_error', message: 'Protocol mismatch.' } };
    }

    if (req.capability === 'credential') {
      logAttempt(options, req, 'denied', 'capability_disabled');
      return { ...base, ok: false, error: { code: 'capability_disabled', message: 'Credential capability is disabled in Phase 1.' } };
    }

    if (req.capability === 'fetch') {
      const payload = req.payload as { kind: 'fetch'; url: string; method?: string; headers?: Record<string, string> };
      const url = parseSafeUrl(payload.url);
      if (url === null) {
        logAttempt(options, req, 'denied', 'invalid_url');
        return { ...base, ok: false, error: { code: 'invalid_url', message: 'The URL is not valid.' } };
      }
      // scheme check
      const insecureOk = options.allowlist.includes(url.hostname.toLowerCase()) && (process.env['BRZ_EGRESS_ALLOW_INSECURE'] ?? '').split(',').map((s) => s.trim().toLowerCase()).includes(url.hostname.toLowerCase());
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && insecureOk)) {
        logAttempt(options, req, 'denied', 'invalid_url');
        return { ...base, ok: false, error: { code: 'invalid_url', message: 'Only HTTPS is allowed.' } };
      }
      // method check
      const method = (payload.method ?? 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        logAttempt(options, req, 'denied', 'invalid_url');
        return { ...base, ok: false, error: { code: 'invalid_url', message: 'Only GET and HEAD are allowed.' } };
      }
      // allowlist
      const { matchAllowlist } = await import('./allowlist.ts');
      if (!matchAllowlist(url.hostname, options.allowlist)) {
        logAttempt(options, req, 'denied', 'host_not_allowlisted');
        return { ...base, ok: false, error: { code: 'egress_denied', message: 'The host is not allowlisted.' } };
      }
      // perform fetch (no redirects)
      const start = Date.now();
      let status = 0;
      let headers: Record<string, string> = {};
      let body = '';
      let bytes = 0;
      let truncated = false;
      try {
        const res = await fetch(url.toString(), { method, redirect: 'manual', headers: stripHeaders(payload.headers ?? {}) });
        if (res.status >= 300 && res.status < 400) {
          logAttempt(options, req, 'denied', 'redirect_not_allowed', 0, Date.now() - start);
          return { ...base, ok: false, error: { code: 'egress_denied', message: 'Redirects are not allowed.' } };
        }
        status = res.status;
        res.headers.forEach((v, k) => { if (k.toLowerCase() !== 'set-cookie') headers[k] = v; });
        const buf = await res.arrayBuffer();
        const text = new TextDecoder().decode(buf);
        if (text.length > options.maxBytes) {
          body = text.slice(0, options.maxBytes);
          truncated = true;
        } else {
          body = text;
        }
        bytes = Math.min(text.length, options.maxBytes);
      } catch (e) {
        logAttempt(options, req, 'denied', 'broker_error', 0, Date.now() - start);
        return { ...base, ok: false, error: { code: 'internal_error', message: 'The broker could not complete the request.' } };
      }
      const duration = Date.now() - start;
      logAttempt(options, req, 'allowed', 'allowed', bytes, duration);
      const result: BrokerResult = { kind: 'fetch', status, headers, body, bytes, truncated };
      return { ...base, ok: true, result };
    }

    if (req.capability === 'file_out') {
      const payload = req.payload as { kind: 'file_out'; path: string; maxBytes: number };
      // simplified: read from work dir
      const target = path.join(options.workDir, payload.path);
      try {
        const content = await fs.readFile(target, 'utf8');
        const truncated = content.length > payload.maxBytes;
        const out = truncated ? content.slice(0, payload.maxBytes) : content;
        const { createHash } = await import('node:crypto');
        const sha = createHash('sha256').update(out).digest('hex');
        logAttempt(options, req, 'allowed', 'allowed', out.length, 0);
        const result: BrokerResult = { kind: 'file_out', content: out, bytes: out.length, sha256: sha };
        return { ...base, ok: true, result };
      } catch {
        logAttempt(options, req, 'denied', 'path_not_allowed');
        return { ...base, ok: false, error: { code: 'path_not_allowed', message: 'The path is not available.' } };
      }
    }

    logAttempt(options, req, 'denied', 'unknown_capability' as any);
    return { ...base, ok: false, error: { code: 'unknown_capability', message: 'Unknown capability.' } };
  };

  return {
    socketPath,
    async start() {
      await fs.mkdir(path.dirname(socketPath), { recursive: true, mode: 0o700 });
      try { await fs.unlink(socketPath); } catch { /* ignore */ }
      server = createServer((socket: Socket) => {
        let buf = '';
        socket.on('data', (chunk) => {
          buf += chunk.toString('utf8');
          // try parse when complete (newline-delimited)
          if (buf.includes('\n')) {
            const idx = buf.indexOf('\n');
            const line = buf.slice(0, idx);
            buf = buf.slice(idx + 1);
            let req: BrokerRequest;
            try { req = JSON.parse(line); } catch {
              socket.write(JSON.stringify({ protocol: 'brz-broker/1', requestId: '', ok: false, at: new Date().toISOString(), error: { code: 'internal_error', message: 'bad json' } }) + '\n');
              return;
            }
            void handleRequest(req).then((res) => {
              socket.write(JSON.stringify(res) + '\n');
            });
          }
        });
      });
      await new Promise<void>((resolve, reject) => {
        server!.listen(socketPath, () => resolve());
        server!.on('error', reject);
      });
      await fs.chmod(socketPath, 0o600);
    },
    async stop() {
      if (server) {
        await new Promise<void>((resolve) => server!.close(() => resolve()));
        server = null;
      }
      try { await fs.unlink(socketPath); } catch { /* ignore */ }
    },
  };
}

function parseSafeUrl(raw: string): URL | null {
  try { return new URL(raw); } catch { return null; }
}

function stripHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    const kl = k.toLowerCase();
    if (kl === 'host' || kl === 'authorization' || kl === 'cookie' || kl.startsWith('proxy-')) continue;
    out[k] = v;
  }
  return out;
}

function logAttempt(options: BrokerOptions, req: BrokerRequest, verdict: 'allowed' | 'denied', reason: string, bytes: number | null = null, durationMs: number | null = null) {
  const url = req.capability === 'fetch' ? (req.payload as any).url : null;
  const host = url ? (() => { try { return new URL(url).hostname; } catch { return null; } })() : null;
  options.stores.egress.append({
    runId: options.runId,
    at: new Date().toISOString(),
    capability: req.capability as any,
    url,
    host,
    verdict,
    reason,
    origin: 'agent',
    bytes,
    durationMs,
  });
  options.emit('egress.attempt', 'executing', `Egress ${verdict}`, {
    capability: req.capability,
    url,
    host,
    verdict,
    reason,
    summary: `${req.capability} ${verdict}: ${reason}`,
  });
}