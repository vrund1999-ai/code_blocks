import { expect, test } from './support/fixtures';
import { build } from './support/projects';

/**
 * GET /weather shows the secret as a message and replies with its length, so
 * a test can tell the real value was used while it stays hidden.
 */
function weather() {
  const b = build('Weather');
  const hook = b.node('server.http', { path: 'weather', method: 'GET' });
  const key = b.node('server.secret', { name: 'WEATHER_KEY' });
  const msg = b.node('action.toast');
  const length = b.node('text.length');
  const join = b.node('data.join', { a: 'Length: ' });
  const reply = b.node('server.reply');
  b.exec(hook, 'next', msg);
  b.exec(msg, 'next', reply);
  b.data(key, 'value', msg, 'message');
  b.data(key, 'value', length, 'text');
  b.data(length, 'value', join, 'b');
  b.data(join, 'value', reply, 'value');
  return b;
}

test('secrets are kept on the server, used by server workflows and never shown', async ({ appNoBoot: app, seed }) => {
  await seed(weather().project);
  await app.goto();
  const menu = app.serverMenu;
  const secrets = menu.getByRole('region', { name: 'Secrets' });

  await app.openServer();
  await expect(secrets).toContainText('No secrets yet.');
  await secrets.getByLabel('Secret name').fill('my key');
  await secrets.getByLabel('Secret value').fill('abcd1234');
  await secrets.getByRole('button', { name: 'Add secret' }).click();
  await expect(secrets.getByRole('alert')).toContainText('letters, numbers and _');

  await secrets.getByLabel('Secret name').fill('WEATHER_KEY');
  await expect(secrets.getByLabel('Secret value')).toHaveAttribute('type', 'password');
  await secrets.getByLabel('Secret value').press('Enter');
  await expect(app.globalToasts.first()).toHaveText('Saved the secret “WEATHER_KEY”.');
  await expect(secrets.getByLabel('Saved secrets')).toContainText('WEATHER_KEY');
  await expect(secrets.getByLabel('Secret value')).toHaveValue('');
  await expect(app.page.locator('body')).not.toContainText('abcd1234');

  // Trying the workflow uses the real value, and hides it in what comes back.
  await app.page.keyboard.press('Escape');
  await app.tab('Logic');
  await app.block('server.http').click({ position: { x: 20, y: 10 } });
  const panel = app.inspector.getByRole('region', { name: 'Try it' });
  await panel.getByRole('button', { name: '▶ Try it' }).click();
  await expect(panel.getByLabel('Reply')).toHaveText('Length: 8');
  await expect(panel.getByRole('status', { name: 'Try result' })).toContainText('💬 •••');
  await expect(app.page.getByRole('region', { name: 'Run log' })).toContainText('Message: “•••”');
  await expect(app.page.locator('body')).not.toContainText('abcd1234');

  // Replacing keeps the name; deleting asks once more.
  await app.openServer();
  await secrets.getByRole('button', { name: 'Replace WEATHER_KEY' }).click();
  await expect(secrets.getByLabel('Secret name')).toHaveValue('WEATHER_KEY');
  await expect(secrets.getByLabel('Secret value')).toBeFocused();
  await secrets.getByLabel('Secret value').fill('a-longer-key');
  await secrets.getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(app.globalToasts.last()).toHaveText('Replaced the secret “WEATHER_KEY”.');

  await secrets.getByRole('button', { name: 'Delete WEATHER_KEY' }).click();
  await secrets.getByRole('button', { name: 'Really delete' }).click();
  await expect(secrets).toContainText('No secrets yet.');
  await app.page.keyboard.press('Escape');

  // Escape also clears the selection, so pick the block again.
  await app.block('server.http').click({ position: { x: 20, y: 10 } });
  await panel.getByRole('button', { name: '▶ Try it' }).click();
  await expect(panel.getByRole('status', { name: 'Try result' })).toContainText(
    'There’s no secret “WEATHER_KEY” on the server. Add it in ☁ Server → Secrets.',
  );
});

test('the Secret block stops with a message in the app', async ({ appNoBoot: app, seed }) => {
  const b = build('Leaky');
  const button = b.element('button', 'Show', { label: 'Show' });
  const click = b.node('event.click', { element: button.id });
  const key = b.node('server.secret', { name: 'API_KEY' });
  const msg = b.node('action.toast');
  b.exec(click, 'next', msg);
  b.data(key, 'value', msg, 'message');
  await seed(b.project);
  await app.goto();

  await app.run();
  await app.designCanvas.getByRole('button', { name: 'Show' }).click();
  await expect(app.toasts().first()).toContainText('Secrets only work in server workflows, so they never reach the app.');
  await expect(app.errorPill).toBeVisible();
});
