// Calls the Code Blocks server. In development the editor's dev server
// forwards /api to it.

/** The server can't be reached at all (rather than refusing a request). */
export class OfflineError extends Error {
  constructor(message = 'Can’t reach the Code Blocks server, so rows can’t be loaded or saved.') {
    super(message);
    this.name = 'OfflineError';
  }
}

/** The server refused a request. `status` is its HTTP status, such as 404 for a missing row. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Requests sent with `call` that haven't been answered yet. */
const inFlight = new Set<Promise<unknown>>();

/**
 * Waits until every request sent with `call` has been answered, including
 * ones sent while waiting, or until `ms` have passed. Signing out waits for
 * this, so a request sent just before isn't answered after the session ends.
 */
export async function requestsSettled(ms = 5000): Promise<void> {
  let late = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      late = true;
      resolve();
    }, ms);
  });
  try {
    while (inFlight.size && !late) await Promise.race([Promise.allSettled([...inFlight]), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends a JSON request and gives the JSON answer. `offline` is the message
 * used when the server can't be reached.
 */
export function call<T>(url: string, init: RequestInit = {}, offline?: string): Promise<T> {
  const request = send<T>(url, init, offline);
  inFlight.add(request);
  void request.then(
    () => inFlight.delete(request),
    () => inFlight.delete(request),
  );
  return request;
}

async function send<T>(url: string, init: RequestInit, offline?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
  } catch {
    throw new OfflineError(offline);
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (res.ok && body) return body;
  // The dev server's proxy answers 5xx with no JSON when the server isn't running.
  if (!body?.error?.message) {
    if (res.status >= 500) throw new OfflineError(offline);
    throw new ApiError(`The server answered with error ${res.status}.`, res.status);
  }
  throw new ApiError(body.error.message, res.status);
}
