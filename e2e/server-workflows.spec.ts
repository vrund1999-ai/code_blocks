import { allowFailedRequestErrors } from './support/api';
import { expect, test } from './support/fixtures';
import { build } from './support/projects';

/** Answers GET /hello?name=Ada with "Hi Ada", and has a daily schedule. */
function helloAddress() {
  const b = build('Hooks');
  const hook = b.node('server.http', { path: 'hello', method: 'GET' });
  const field = b.node('data.getField', { field: 'name' });
  const join = b.node('data.join', { a: 'Hi ' });
  const reply = b.node('server.reply');
  b.exec(hook, 'next', reply);
  b.data(hook, 'query', field, 'record');
  b.data(field, 'value', join, 'b');
  b.data(join, 'value', reply, 'value');
  b.node('server.schedule', { every: 'day', time: '09:00' });
  return b;
}

test('deploying makes a web address answer, until the workflows are stopped', async ({ appNoBoot: app, seed }) => {
  const b = helloAddress();
  await seed(b.project);
  await app.goto();
  const menu = app.serverMenu;

  await app.openServer();
  await expect(menu.getByRole('status')).toHaveText(/^Not deployed/);
  await app.deploy();
  await expect(app.globalToasts.first()).toHaveText('Deployed “Hooks”: 1 web address, 1 schedule.');
  await expect(app.serverButton).toContainText('Live');
  await expect(menu.getByLabel('Schedules')).toHaveText('Every day at 09:00');

  const address = menu.getByLabel('Web addresses').locator('code');
  await expect(address).toHaveText(`http://localhost:4173/api/hooks/${b.project.id}/hello`);
  const url = (await address.textContent())!;
  const res = await app.page.request.get(`${url}?name=Ada`);
  expect(res.status()).toBe(200);
  expect(await res.text()).toBe('Hi Ada');

  await menu.getByRole('button', { name: 'Refresh runs' }).click();
  await expect(menu.getByLabel('Recent runs')).toContainText('✓ GET /hello');

  // Changing the logic leaves the deployed copy behind until it is deployed again.
  await app.page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await app.tab('Logic');
  await app.addBlock('Reply');
  await expect(app.serverButton).toContainText('Changes not deployed');
  await app.openServer();
  await expect(menu.getByRole('button', { name: '☁ Deploy changes' })).toBeVisible();

  await menu.getByRole('button', { name: 'Stop workflows' }).click();
  await expect(menu.getByRole('status')).toHaveText(/^Not deployed/);
  await expect(app.serverButton).not.toContainText('Live');
  expect((await app.page.request.get(url)).status()).toBe(404);
});

/**
 * A sign-up app: "Join" sends the typed name as form "signup". On the server,
 * the form adds a guest row, shows a message and replies with a thank-you.
 */
function signUp() {
  const b = build('Sign up');
  const guests = b.table('Guests', { Name: 'text' });
  const box = b.element('input', 'Name box');
  const join = b.element('button', 'Join', { label: 'Join' });
  const answer = b.element('text', 'Answer', { text: '…' });

  const click = b.node('event.click', { element: join.id });
  const typed = b.node('data.getInputValue', { element: box.id });
  const rec = b.node('data.makeRecord', { fields: [{ id: 'n', name: 'name' }] });
  const send = b.node('server.sendForm', { form: 'signup' });
  const show = b.node('action.setText', { element: answer.id });
  b.exec(click, 'next', send);
  b.exec(send, 'next', show);
  b.data(typed, 'value', rec, 'f_n');
  b.data(rec, 'value', send, 'values');
  b.data(send, 'reply', show, 'text');

  const form = b.node('server.form', { form: 'signup' });
  const add = b.node('table.add', { table: guests.id });
  const msg = b.node('action.toast', { message: 'Saved on the server' });
  const field = b.node('data.getField', { field: 'name' });
  const thanks = b.node('data.join', { a: 'Thanks, ' });
  const reply = b.node('server.reply');
  b.exec(form, 'next', add);
  b.exec(add, 'next', msg);
  b.exec(msg, 'next', reply);
  b.data(form, 'values', add, 'values');
  b.data(form, 'values', field, 'record');
  b.data(field, 'value', thanks, 'b');
  b.data(thanks, 'value', reply, 'value');
  return b;
}

test('an app sends a form to its server workflow and shows the reply', async ({ appNoBoot: app, seed, consoleErrors }) => {
  await seed(signUp().project);
  await app.goto();
  const canvas = app.designCanvas;

  // Before deploying, the server has no such form.
  await app.run();
  await canvas.getByRole('textbox').fill('Ada');
  await canvas.getByRole('button', { name: 'Join' }).click();
  await expect(app.toasts().first()).toContainText('There’s no form “signup” on the server');
  await expect(app.errorPill).toBeVisible();
  await app.stop();

  await app.deploy();
  await expect(app.globalToasts.first()).toHaveText('Deployed “Sign up”: 1 form.');
  await app.page.keyboard.press('Escape');

  await app.run();
  await canvas.getByRole('textbox').fill('Ada');
  await canvas.getByRole('button', { name: 'Join' }).click();
  await expect(canvas.getByText('Thanks, Ada')).toBeVisible();
  await expect(app.toasts().first()).toHaveText('Saved on the server');
  await expect(app.errorPill).toBeHidden();
  await app.stop();

  // The row was added on the server, and the run is in the server's history.
  await app.tab('Data');
  await expect(app.dataArea.getByLabel('Row 1 Name')).toHaveValue('Ada');
  await app.openServer();
  await expect(app.serverMenu.getByLabel('Recent runs').locator('li')).toHaveCount(1);
  await expect(app.serverMenu.getByLabel('Recent runs')).toContainText('✓ Form “signup”');
  await expect(app.serverMenu.getByLabel('Recent runs')).toContainText('💬 Saved on the server');
  allowFailedRequestErrors(consoleErrors);
});

test('server blocks: the palette group, and settings problems shown when deploying', async ({ appNoBoot: app, seed }) => {
  const b = build('Problems');
  b.node('server.http', { path: 'two words' });
  await seed(b.project);
  await app.goto();
  await app.tab('Logic');

  const palette = app.page.locator('.node-palette');
  await expect(palette.locator('.node-cat-title', { hasText: 'On the server' })).toContainText('Web addresses, forms and schedules');
  await app.addBlock('On a schedule');
  await expect(app.block('server.schedule').locator('.block-sentence')).toHaveText('Every 15 minutes');

  await app.openServer();
  await app.serverMenu.getByRole('button', { name: '☁ Deploy' }).click();
  await expect(app.serverMenu.getByRole('alert')).toContainText('Left out: Give the web address a name');
  await expect(app.serverMenu.getByLabel('Schedules')).toHaveText('Every 15 minutes');
  await app.serverMenu.getByRole('button', { name: 'show me' }).click();
  await expect(app.inspectorField('Web address name').locator('input')).toHaveValue('two words');
});
