/**
 * External id generation for the fixture transport.
 *
 * In live mode the control plane mints the id and the browser never does.
 * In fixture mode the console has to mint one so a locally submitted run
 * looks like a real one: `run_` plus 26 Crockford base32 characters, which is
 * the shape the API contract fixes.
 *
 * This is a *fixture-mode* concern only. It is never used to address
 * anything on a server.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function pick(byte: number): string {
  const char = ALPHABET[byte % 32];
  return char ?? '0';
}

export function newRunId(now: number = Date.now()): string {
  let time = now;
  const chars: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    chars.push(pick(time % 32));
    time = Math.floor(time / 32);
  }
  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  for (const byte of random) {
    chars.push(pick(byte));
  }
  return `run_${chars.join('')}`;
}

export function newSandboxId(now: number = Date.now()): string {
  const random = new Uint8Array(10);
  crypto.getRandomValues(random);
  const chars: string[] = [];
  for (const byte of random) {
    chars.push(pick(byte));
  }
  return `sbx_${String(now % 100_000).padStart(5, '0')}${chars.join('').slice(0, 11)}`;
}
