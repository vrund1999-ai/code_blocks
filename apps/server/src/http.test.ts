import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { allowPrivateAddresses, isPrivateAddress, privateAddressProblem, RequestProblem, sendRequest } from './http';

describe('isPrivateAddress', () => {
  it.each([
    ['127.0.0.1', true],
    ['10.1.2.3', true],
    ['172.20.0.1', true],
    ['192.168.1.10', true],
    ['169.254.169.254', true],
    ['100.64.0.1', true],
    ['0.0.0.0', true],
    ['::1', true],
    ['[::1]', true],
    ['::ffff:127.0.0.1', true],
    ['fd00::1', true],
    ['fe80::1', true],
    ['8.8.8.8', false],
    ['172.32.0.1', false],
    ['2606:4700:4700::1111', false],
    ['example.com', false],
  ])('%s → %s', (address, expected) => {
    expect(isPrivateAddress(address)).toBe(expected);
  });
});

describe('sendRequest', () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = createServer((_req, res) => res.end('hello'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
  afterEach(() => allowPrivateAddresses(false));

  it('refuses addresses on the server’s own network, written as an IP or a name', async () => {
    for (const host of ['127.0.0.1', 'localhost']) {
      const sent = sendRequest({ method: 'GET', url: `http://${host}:${port}/`, headers: {} });
      await expect(sent).rejects.toBeInstanceOf(RequestProblem);
      await expect(sent).rejects.toThrow(privateAddressProblem(host));
    }
  });

  it('reaches them when private addresses are allowed', async () => {
    allowPrivateAddresses(true);
    const res = await sendRequest({ method: 'GET', url: `http://127.0.0.1:${port}/`, headers: {} });
    expect(res).toMatchObject({ status: 200, text: 'hello' });
  });
});
