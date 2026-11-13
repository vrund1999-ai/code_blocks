import type { Page, Request } from '@playwright/test';

/** A fake web API on another origin, so tests never touch the real internet. */
export const API = 'https://api.example.test';

export interface FakeAnswer {
  status?: number;
  json?: unknown;
  body?: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE',
  'Access-Control-Allow-Headers': '*',
};

/**
 * Answers requests to `API + path` with `answer`, or makes them fail to
 * connect when `answer` is 'unreachable'. Returns the requests it received
 * (CORS preflights are answered but not recorded).
 */
export async function fakeApi(page: Page, path: string, answer: FakeAnswer | 'unreachable') {
  const requests: Request[] = [];
  await page.route(`${API}${path}`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    requests.push(req);
    if (answer === 'unreachable') return route.abort('connectionrefused');
    await route.fulfill({
      status: answer.status ?? 200,
      headers: { ...CORS, 'Content-Type': answer.json !== undefined ? 'application/json' : 'text/plain' },
      body: answer.json !== undefined ? JSON.stringify(answer.json) : (answer.body ?? ''),
    });
  });
  return requests;
}

/** Failed requests log a console error in the browser; drop those the test expects. */
export function allowFailedRequestErrors(consoleErrors: string[]) {
  const rest = consoleErrors.filter((e) => !/Failed to load resource|net::ERR_|Failed to fetch|Cross-Origin Request Blocked|NetworkError when attempting to fetch/i.test(e));
  consoleErrors.splice(0, consoleErrors.length, ...rest);
}
