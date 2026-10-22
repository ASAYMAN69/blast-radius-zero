/**
 * A tiny method+path router over `node:http`.
 *
 * Patterns are literal segments plus `:name` parameters. There are eight
 * routes; a framework would be more code than this.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export interface RouteContext {
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  readonly url: URL;
  readonly params: Readonly<Record<string, string>>;
  readonly requestId: string;
}

export type RouteHandler = (ctx: RouteContext) => Promise<void>;

interface Route {
  readonly method: string;
  readonly segments: readonly string[];
  readonly handler: RouteHandler;
}

export interface RouteMatch {
  readonly handler: RouteHandler;
  readonly params: Record<string, string>;
}

export class Router {
  readonly #routes: Route[] = [];

  add(method: string, pattern: string, handler: RouteHandler): this {
    this.#routes.push({
      method: method.toUpperCase(),
      segments: splitPath(pattern),
      handler,
    });
    return this;
  }

  match(method: string, pathname: string): RouteMatch | null {
    const target = splitPath(pathname);
    for (const route of this.#routes) {
      if (route.method !== method.toUpperCase()) continue;
      const params = matchSegments(route.segments, target);
      if (params !== null) return { handler: route.handler, params };
    }
    return null;
  }

  /** True when the path exists under a different method. Used only for a 404. */
  hasPath(pathname: string): boolean {
    const target = splitPath(pathname);
    return this.#routes.some((route) => matchSegments(route.segments, target) !== null);
  }
}

function splitPath(value: string): string[] {
  const pathname = value.split('?', 1)[0] ?? '';
  return pathname.split('/').filter((segment) => segment.length > 0);
}

function matchSegments(
  pattern: readonly string[],
  target: readonly string[],
): Record<string, string> | null {
  if (pattern.length !== target.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < pattern.length; index += 1) {
    const expected = pattern[index];
    const actual = target[index];
    if (expected === undefined || actual === undefined) return null;
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeURIComponent(actual);
      continue;
    }
    if (expected !== actual) return null;
  }
  return params;
}
