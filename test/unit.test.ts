import { describe, expect, it } from 'vitest';
import { Checkbox, CheckboxError } from '../src/index.js';

function fakeFetch(routes: Record<string, (init: RequestInit) => [number, unknown]>) {
  const calls: { path: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const path = `${init.method} ${new URL(url).pathname.replace('/api/v1', '')}`;
    calls.push({ path, init });
    const route = routes[path];
    if (!route) {
      return new Response('not found', { status: 404 });
    }
    const [status, body] = route(init);
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

describe('Checkbox', () => {
  it('signs in with the PIN and sends the token and license key', async () => {
    const { fetch, calls } = fakeFetch({
      'POST /cashier/signinPinCode': () => [200, { access_token: 'tok' }],
      'GET /cashier/me': () => [200, { full_name: 'Test' }],
    });
    const checkbox = new Checkbox({ licenseKey: 'lic', pinCode: '123', fetch });
    expect(await checkbox.me()).toEqual({ full_name: 'Test' });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ pin_code: '123' });
    const headers = calls[1].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers['X-License-Key']).toBe('lic');
  });

  it('signs in again when the token expires', async () => {
    let n = 0;
    const { fetch, calls } = fakeFetch({
      'POST /cashier/signinPinCode': () => [200, { access_token: `tok${++n}` }],
      'GET /cashier/me': (init) => ((init.headers as Record<string, string>).Authorization === 'Bearer tok1' ? [401, { message: 'expired' }] : [200, { ok: true }]),
    });
    const checkbox = new Checkbox({ licenseKey: 'lic', pinCode: '123', fetch });
    expect(await checkbox.me()).toEqual({ ok: true });
    expect(calls.map((c) => c.path)).toEqual(['POST /cashier/signinPinCode', 'GET /cashier/me', 'POST /cashier/signinPinCode', 'GET /cashier/me']);
  });

  it('returns null when there is no shift and opens one', async () => {
    let status: string | null = null;
    const { fetch } = fakeFetch({
      'POST /cashier/signinPinCode': () => [200, { access_token: 'tok' }],
      'GET /cashier/shift': () => [200, status ? { status } : null],
      'POST /shifts': () => ((status = 'OPENED'), [202, { status: 'OPENING' }]),
    });
    const checkbox = new Checkbox({ licenseKey: 'lic', pinCode: '123', fetch });
    expect(await checkbox.currentShift()).toBeNull();
    expect((await checkbox.ensureShift()).status).toBe('OPENED');
  });

  it('marks goods as returned', async () => {
    const { fetch, calls } = fakeFetch({
      'POST /cashier/signinPinCode': () => [200, { access_token: 'tok' }],
      'POST /receipts/sell': () => [201, { id: 'r1' }],
    });
    const checkbox = new Checkbox({ licenseKey: 'lic', pinCode: '123', fetch });
    await checkbox.returnReceipt({ goods: [{ good: { code: '1', name: 'A', price: 100 }, quantity: 1000 }], payments: [] });
    expect(JSON.parse(String(calls[1].init.body)).goods[0].is_return).toBe(true);
  });

  it('throws CheckboxError with the message from the API', async () => {
    const { fetch } = fakeFetch({
      'POST /cashier/signinPinCode': () => [200, { access_token: 'tok' }],
      'POST /receipts/sell': () => [422, { message: 'Зміна не відкрита' }],
    });
    const checkbox = new Checkbox({ licenseKey: 'lic', pinCode: '123', fetch });
    const error = await checkbox.sell({ goods: [], payments: [] }).catch((e) => e);
    expect(error).toBeInstanceOf(CheckboxError);
    expect(error.status).toBe(422);
    expect(error.message).toBe('Checkbox: Зміна не відкрита');
  });

  it('needs a PIN or login and password', () => {
    expect(() => new Checkbox({ licenseKey: 'lic' })).toThrow();
  });
});
