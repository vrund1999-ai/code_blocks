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

/**
 * Sends a JSON request and gives the JSON answer. `offline` is the message
 * used when the server can't be reached.
 */
export async function call<T>(url: string, init: RequestInit = {}, offline?: string): Promise<T> {
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
