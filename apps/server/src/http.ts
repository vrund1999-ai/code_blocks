// Sending web requests from the server: for *Fetch from API* blocks in server
// workflows, and for the app's requests sent through the server (fetchRoutes.ts).

import type { HttpRequest, HttpResponse } from '@code-blocks/engine/types';

/** A request that takes longer than this counts as failed. */
export const FETCH_TIMEOUT_MS = 30_000;

/** The biggest answer read. Bigger ones count as failed. */
export const MAX_ANSWER_BYTES = 5 * 1024 * 1024;

/** The request failed in a way worth telling the person about. */
export class RequestProblem extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestProblem';
  }
}

async function readText(res: Response, where: string): Promise<string> {
  const tooBig = () => new RequestProblem(`${where} answered with more than ${MAX_ANSWER_BYTES / 1024 / 1024} MB of data, which is too much.`);
  if (Number(res.headers.get('content-length') ?? 0) > MAX_ANSWER_BYTES) {
    await res.body?.cancel();
    throw tooBig();
  }
  if (!res.body) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.byteLength;
    if (size > MAX_ANSWER_BYTES) throw tooBig();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Sends `req` and reads the answer as text. Rejects with a RequestProblem
 * when it takes too long or the answer is too big, and with fetch's own
 * error when the address can't be reached. `signal` stops it early.
 */
export async function sendRequest({ method, url, headers, body }: HttpRequest, signal?: AbortSignal): Promise<HttpResponse> {
  const where = (() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  })();
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method, headers, body, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    return { status: res.status, statusText: res.statusText, text: await readText(res, where) };
  } catch (err) {
    if (timeout.aborted && !signal?.aborted) {
      throw new RequestProblem(`${where} took more than ${FETCH_TIMEOUT_MS / 1000} seconds to answer.`);
    }
    throw err;
  }
}
