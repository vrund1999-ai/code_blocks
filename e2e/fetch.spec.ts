import { allowFailedRequestErrors, API, fakeApi } from './support/api';
import { expect, test } from './support/fixtures';
import { build } from './support/projects';

/** A "Load" button that fetches `url` and puts the result into the "Out" text. */
function loadButtonProject(fetchConfig: Record<string, unknown>) {
  const b = build('Weather');
  const button = b.element('button', 'Load', { label: 'Load' });
  const out = b.element('text', 'Out', { text: '' });
  const click = b.node('event.click', { element: button.id });
  const fetch = b.node('action.fetch', fetchConfig);
  const set = b.node('action.setText', { element: out.id });
  b.exec(click, 'next', fetch);
  b.exec(fetch, 'next', set);
  b.data(fetch, 'result', set, 'text');
  return { b, fetch };
}

test('“Fetch from API” loads JSON and picks one field', async ({ appNoBoot: app, seed }) => {
  const requests = await fakeApi(app.page, '/weather', { json: { current: { temp: 21, sky: 'sunny' } } });
  const { b } = loadButtonProject({ url: 'api.example.test/weather', field: 'current.temp' });
  await seed(b.project);
  await app.goto();

  await app.tab('Logic');
  const block = app.block('action.fetch');
  await expect(block.locator('.block-sentence')).toHaveText('Load data from api.example.test');
  await expect(block.locator('.pin-row.in .pin-label')).toHaveText(['Web address', 'Pick field', 'Headers']);

  await app.run();
  await app.logicPreview.getByRole('button', { name: 'Load' }).click();
  await expect(app.logicPreview.locator('.el-text')).toHaveText('21');
  expect(requests.map((r) => `${r.method()} ${r.url()}`)).toEqual([`GET ${API}/weather`]);

  // Changing the picked field on the block changes what the app shows.
  await app.stop();
  await block.locator('.pin-row.in', { hasText: 'Pick field' }).locator('input').fill('current.sky');
  await app.run();
  await app.logicPreview.getByRole('button', { name: 'Load' }).click();
  await expect(app.logicPreview.locator('.el-text')).toHaveText('sunny');
});

test('a list loaded from an API shows up as List cards', async ({ appNoBoot: app, seed }) => {
  await fakeApi(app.page, '/people', { json: { results: [{ name: 'Ada' }, { name: 'Bo' }] } });
  const b = build('People');
  const people = b.variable('people', 'list', []);
  const list = b.element('list', 'People List');
  list.props.items = { kind: 'variable', variableId: people.id };
  const name = b.element('text', 'Name', {}, list);
  name.props.text = { kind: 'item', field: 'name' };
  const load = b.node('event.screenLoad', { screen: b.screen.id });
  const fetch = b.node('action.fetch', { url: `${API}/people`, field: 'results' });
  const save = b.node('action.setVariable', { variable: people.id });
  b.exec(load, 'next', fetch);
  b.exec(fetch, 'next', save);
  b.data(fetch, 'result', save, 'value');
  await seed(b.project);
  await app.goto();

  await app.run();
  await expect(app.designCanvas.locator('.list-card .el-text')).toHaveText(['Ada', 'Bo']);
});

test('switching to Post adds a “Send” input that sends records as JSON', async ({ appNoBoot: app, seed }) => {
  const requests = await fakeApi(app.page, '/people', { status: 201, json: { id: 7 } });
  const { b } = loadButtonProject({ url: `${API}/people`, field: 'id' });
  b.node('data.makeRecord', { fields: [{ id: 'n', name: 'name' }], f_n: 'Ada' }, { x: 380, y: 420 });
  await seed(b.project);
  await app.goto();
  await app.tab('Logic');

  const block = app.block('action.fetch');
  await block.getByLabel('Method').selectOption('POST');
  await expect(block.locator('.block-sentence')).toHaveText('Send data to api.example.test');
  await expect(block.locator('.pin-row.in .pin-label')).toHaveText(['Web address', 'Pick field', 'Headers', 'Send']);
  await expect(app.edges).toHaveCount(3);
  await app.connect(app.block('data.makeRecord'), 'value', block, 'body');
  await expect(app.edges).toHaveCount(4);

  await app.run();
  await app.logicPreview.getByRole('button', { name: 'Load' }).click();
  await expect(app.logicPreview.locator('.el-text')).toHaveText('7');
  expect(requests).toHaveLength(1);
  expect(requests[0].method()).toBe('POST');
  expect(requests[0].postDataJSON()).toEqual({ name: 'Ada' });
  expect(await requests[0].headerValue('content-type')).toBe('application/json');
  await app.stop();

  // Back to Get: nothing is sent, so the input and its wire go away.
  await block.getByLabel('Method').selectOption('GET');
  await expect(block.locator('.pin-row.in .pin-label')).toHaveText(['Web address', 'Pick field', 'Headers']);
  await expect(app.edges).toHaveCount(3);
});

test('an error answer runs “If it fails” with the problem', async ({ appNoBoot: app, seed, consoleErrors }) => {
  await fakeApi(app.page, '/weather', { status: 503, json: { message: 'down' } });
  const { b, fetch } = loadButtonProject({ url: `${API}/weather` });
  const say = b.node('action.toast');
  b.exec(fetch, 'failed', say);
  b.data(fetch, 'error', say, 'message');
  await seed(b.project);
  await app.goto();

  await app.run();
  await app.designCanvas.getByRole('button', { name: 'Load' }).click();
  await expect(app.toasts()).toHaveText(['api.example.test answered with error 503 (Service Unavailable).']);
  await expect(app.errorPill).toBeHidden();
  await expect(app.designCanvas.locator('.el-text')).toHaveText('');
  allowFailedRequestErrors(consoleErrors);
});

test('an unreachable API with no “If it fails” shows an error on the block', async ({
  appNoBoot: app,
  seed,
  consoleErrors,
}) => {
  await fakeApi(app.page, '/weather', 'unreachable');
  const { b } = loadButtonProject({ url: `${API}/weather` });
  await seed(b.project);
  await app.goto();

  await app.run();
  await app.designCanvas.getByRole('button', { name: 'Load' }).click();
  await expect(app.errorPill).toBeVisible();
  await expect(app.toasts().first()).toContainText('Couldn’t reach api.example.test');
  await app.errorPill.click();
  await expect(app.block('action.fetch').locator('.block')).toHaveClass(/has-error/);
  allowFailedRequestErrors(consoleErrors);
});

test('“Send from: the server” reaches APIs that block apps in a browser', async ({ appNoBoot: app, seed, consoleErrors }) => {
  // The Code Blocks server's own health check doesn't allow other sites (CORS),
  // so the app can't read it, but the server can.
  const { b } = loadButtonProject({ url: 'http://127.0.0.1:8787/api/health', field: 'ok' });
  await seed(b.project);
  await app.goto();

  await app.run();
  await app.designCanvas.getByRole('button', { name: 'Load' }).click();
  await expect(app.toasts().first()).toContainText('for those, set “Send from” to “The server”.');
  await app.stop();
  allowFailedRequestErrors(consoleErrors);

  await app.tab('Logic');
  const block = app.block('action.fetch');
  await block.getByLabel('Send from').selectOption('server');
  await expect(block.locator('.block-sentence')).toHaveText('Load data from 127.0.0.1:8787 through the server');
  await app.run();
  await app.logicPreview.getByRole('button', { name: 'Load' }).click();
  await expect(app.logicPreview.locator('.el-text')).toHaveText('true');
  await expect(app.errorPill).toBeHidden();
});

test('the server says when it can’t reach an address', async ({ appNoBoot: app, seed, consoleErrors }) => {
  const { b } = loadButtonProject({ url: 'http://127.0.0.1:1/nothing', via: 'server' });
  await seed(b.project);
  await app.goto();

  await app.run();
  await app.designCanvas.getByRole('button', { name: 'Load' }).click();
  await expect(app.errorPill).toBeVisible();
  await expect(app.toasts().first()).toContainText(
    'The server couldn’t reach 127.0.0.1:1. Check the web address and your internet connection.',
  );
  allowFailedRequestErrors(consoleErrors);
});
