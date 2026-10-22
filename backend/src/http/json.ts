/**
 * Request-body reading and parsing.
 *
 * The body is size-capped BEFORE it is parsed, the content type is checked
 * before anything is read, and every failure is an `ApiError` with a machine
 * code — never a 500.
 */

import type { IncomingMessage } from 'node:http';
import { ApiError } from './errors.ts';

/** Phase 1 request bodies are small: a goal plus a few source files. */
export const MAX_BODY_BYTES = 1_048_576;

export function isJsonContentType(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase();
  return mediaType === 'application/json';
}

/** Read the request body as text, capped at `maxBytes`. */
export function readBody(req: IncomingMessage, maxBytes: number = MAX_BODY_BYTES): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    let settled = false;

    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      // Drain whatever is still in flight so the socket can carry our response.
      req.resume();
      reject(error);
    };

    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      received += chunk.byteLength;
      if (received > maxBytes) {
        fail(new ApiError('payload_too_large'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });

    req.on('error', () => {
      fail(new ApiError('invalid_request', [{ field: 'body', issue: 'The request body could not be read.' }]));
    });

    req.on('aborted', () => {
      fail(new ApiError('invalid_request', [{ field: 'body', issue: 'The request was aborted.' }]));
    });
  });
}

/** Read and parse a JSON body. A body that is not an object is `invalid_request`. */
export async function readJsonObject(
  req: IncomingMessage,
  maxBytes: number = MAX_BODY_BYTES,
): Promise<Record<string, unknown>> {
  if (!isJsonContentType(req.headers['content-type'])) {
    throw new ApiError('unsupported_media_type');
  }
  const text = await readBody(req, maxBytes);
  if (text.trim().length === 0) {
    throw new ApiError('invalid_request', [{ field: 'body', issue: 'A JSON body is required.' }]);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError('invalid_request', [{ field: 'body', issue: 'The body is not valid JSON.' }]);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiError('invalid_request', [{ field: 'body', issue: 'The body must be a JSON object.' }]);
  }
  return parsed as Record<string, unknown>;
}
