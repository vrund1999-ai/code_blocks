// Sending web requests from the server: for *Fetch from API* blocks in server
// workflows, and for the app's requests sent through the server (fetchRoutes.ts).

import type { HttpRequest, HttpResponse } from '@code-blocks/engine/types';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import { Agent, buildConnector } from 'undici';

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

// Addresses on the server's own network: this computer, the local network,
// and the cloud's metadata service (169.254.169.254). A hosted server must
// not let projects reach them.
const PRIVATE = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  PRIVATE.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  PRIVATE.addSubnet(net, prefix, 'ipv6');
}

/** Whether `address` (an IP address) is on a private network. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '');
  const family = isIP(ip);
  if (family === 4) return PRIVATE.check(ip, 'ipv4');
  if (family === 6) return PRIVATE.check(ip, 'ipv6');
  return false;
}

export const privateAddressProblem = (host: string) =>
  `The server can’t send requests to ${host}: it’s on the server’s own network.`;

let allowPrivate = false;

/**
 * Lets requests reach private addresses such as localhost, for a server that
 * runs on your own computer. Hosted servers keep them blocked (the default).
 */
export function allowPrivateAddresses(allow: boolean) {
  allowPrivate = allow;
}

/** Looks up the host's addresses, refusing private ones. */
const checkedLookup: typeof dnsLookup = ((hostname: string, options: object, callback: (...args: unknown[]) => void) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses: LookupAddress[]) => {
    if (err) return callback(err);
    if (!allowPrivate && addresses.some((a) => isPrivateAddress(a.address))) {
      return callback(new RequestProblem(privateAddressProblem(hostname)));
    }
    if ((options as { all?: boolean }).all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}) as typeof dnsLookup;

const connectChecked = buildConnector({ lookup: checkedLookup } as buildConnector.BuildOptions);

/**
 * Checks every connection, including redirects. Hosts written as IP addresses
 * skip the lookup, so they're checked here too.
 */
const dispatcher = new Agent({
  connect: (opts, callback) => {
    if (!allowPrivate && isPrivateAddress(opts.hostname)) {
      callback(new RequestProblem(privateAddressProblem(opts.hostname)), null);
      return;
    }
    connectChecked(opts, callback);
  },
});

/** The RequestProblem behind a failed fetch, if there is one. */
const problemIn = (err: unknown): RequestProblem | undefined => {
  for (let e = err; e instanceof Error; e = e.cause) if (e instanceof RequestProblem) return e;
  return undefined;
};

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
    const res = await fetch(url, {
      method,
      headers,
      body,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      // Node's fetch takes undici's dispatcher; the DOM types don't know it.
      dispatcher,
    } as RequestInit);
    return { status: res.status, statusText: res.statusText, text: await readText(res, where) };
  } catch (err) {
    if (timeout.aborted && !signal?.aborted) {
      throw new RequestProblem(`${where} took more than ${FETCH_TIMEOUT_MS / 1000} seconds to answer.`);
    }
    throw problemIn(err) ?? err;
  }
}
