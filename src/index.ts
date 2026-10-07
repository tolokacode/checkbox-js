import type { components } from './schema.js';

export type Schemas = components['schemas'];
export type ReceiptPayload = Schemas['ReceiptSellPayload'];
export type PrepaymentPayload = Schemas['PrePaymentReceiptPayload'];
export type AfterPaymentPayload = Schemas['AfterPaymentReceiptPayload'];
export type Receipt = Schemas['ReceiptModel'];
export type Shift = Schemas['ShiftWithCashRegisterModel'];
export type Cashier = Schemas['CashierModel'];

export interface CheckboxOptions {
  /** Cash register license key (X-License-Key). */
  licenseKey: string;
  /** Cashier PIN code. Use this or login + password. */
  pinCode?: string;
  login?: string;
  password?: string;
  baseUrl?: string;
  clientName?: string;
  clientVersion?: string;
  fetch?: typeof fetch;
}

export class CheckboxError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'CheckboxError';
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class Checkbox {
  private token: string | undefined;
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;

  constructor(private readonly options: CheckboxOptions) {
    if (!options.pinCode && !(options.login && options.password)) {
      throw new Error('Checkbox: pass pinCode, or login and password');
    }
    this.baseUrl = (options.baseUrl ?? 'https://api.checkbox.in.ua').replace(/\/$/, '') + '/api/v1';
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async signIn(): Promise<string> {
    const result = this.options.pinCode
      ? await this.send<Schemas['CashierAccessTokenResponseModel']>('POST', '/cashier/signinPinCode', { pin_code: this.options.pinCode }, false)
      : await this.send<Schemas['CashierAccessTokenResponseModel']>('POST', '/cashier/signin', { login: this.options.login, password: this.options.password }, false);
    this.token = result.access_token;
    return this.token;
  }

  async signOut(): Promise<void> {
    await this.request('POST', '/cashier/signout');
    this.token = undefined;
  }

  me(): Promise<Cashier> {
    return this.request('GET', '/cashier/me');
  }

  /** The cashier's current shift, or null when there is none. */
  async currentShift(): Promise<Shift | null> {
    return (await this.request<Shift | null>('GET', '/cashier/shift')) ?? null;
  }

  openShift(options: { autoCloseAt?: Date } = {}): Promise<Shift> {
    return this.request('POST', '/shifts', options.autoCloseAt ? { auto_close_at: options.autoCloseAt.toISOString() } : {});
  }

  closeShift(): Promise<Shift> {
    return this.request('POST', '/shifts/close', {});
  }

  /** Opens a shift if none is open and waits until it is OPENED. */
  async ensureShift(options: { autoCloseAt?: Date; timeoutMs?: number } = {}): Promise<Shift> {
    let shift = await this.currentShift();
    if (!shift || shift.status === 'CLOSED') {
      await this.openShift(options);
    }
    const until = Date.now() + (options.timeoutMs ?? 15000);
    while (Date.now() < until) {
      shift = await this.currentShift();
      if (shift?.status === 'OPENED') {
        return shift;
      }
      await sleep(1000);
    }
    throw new CheckboxError('Checkbox: the shift did not open in time', 0, shift);
  }

  /** Creates a sale receipt. Pass your own `id` (UUID) to make retries safe. */
  sell(receipt: ReceiptPayload): Promise<Receipt> {
    return this.request('POST', '/receipts/sell', receipt);
  }

  /** Creates a return receipt: marks every good as returned. */
  returnReceipt(receipt: ReceiptPayload): Promise<Receipt> {
    return this.sell({ ...receipt, goods: receipt.goods.map((good) => ({ ...good, is_return: true })) });
  }

  receipt(id: string): Promise<Receipt> {
    return this.request('GET', `/receipts/${encodeURIComponent(id)}`);
  }

  /** Waits until the receipt is fiscalized (DONE) or fails (ERROR). */
  async waitForReceipt(id: string, timeoutMs = 30000): Promise<Receipt> {
    const until = Date.now() + timeoutMs;
    let receipt = await this.receipt(id);
    while (receipt.status !== 'DONE' && receipt.status !== 'ERROR' && Date.now() < until) {
      await sleep(1000);
      receipt = await this.receipt(id);
    }
    return receipt;
  }

  receiptPdf(id: string): Promise<ArrayBuffer> {
    return this.request('GET', `/receipts/${encodeURIComponent(id)}/pdf`, undefined, 'binary');
  }

  receiptPng(id: string): Promise<ArrayBuffer> {
    return this.request('GET', `/receipts/${encodeURIComponent(id)}/png`, undefined, 'binary');
  }

  receiptHtml(id: string): Promise<string> {
    return this.request('GET', `/receipts/${encodeURIComponent(id)}/html`, undefined, 'text');
  }

  receiptText(id: string): Promise<string> {
    return this.request('GET', `/receipts/${encodeURIComponent(id)}/text`, undefined, 'text');
  }

  sendReceiptEmail(id: string, emails: string[]): Promise<unknown> {
    return this.request('POST', `/receipts/${encodeURIComponent(id)}/email`, emails);
  }

  /** Prepayment receipt: lists the whole order, payments hold only the prepaid part. */
  prepayment(receipt: PrepaymentPayload): Promise<Receipt> {
    return this.request('POST', '/prepayment-receipts', receipt);
  }

  /** After-payment receipt for the rest. `relationId` is `pre_payment_relation_id` from the prepayment receipt. */
  afterPayment(relationId: string, receipt: AfterPaymentPayload): Promise<Receipt> {
    return this.request('POST', `/prepayment-receipts/${encodeURIComponent(relationId)}`, receipt);
  }

  /** Returns every receipt in a prepayment chain. */
  returnPrepayment(relationId: string): Promise<Receipt[]> {
    return this.request('POST', `/prepayment-receipts/${encodeURIComponent(relationId)}/return`, {});
  }

  /** X report for the current shift. */
  xReport(): Promise<Schemas['ReportModel']> {
    return this.request('POST', '/reports');
  }

  async request<T>(method: string, path: string, body?: unknown, as: 'json' | 'text' | 'binary' = 'json'): Promise<T> {
    if (!this.token) {
      await this.signIn();
    }
    try {
      return await this.send<T>(method, path, body, true, as);
    } catch (error) {
      if (error instanceof CheckboxError && error.status === 401) {
        await this.signIn();
        return this.send<T>(method, path, body, true, as);
      }
      throw error;
    }
  }

  private async send<T>(method: string, path: string, body: unknown, auth: boolean, as: 'json' | 'text' | 'binary' = 'json'): Promise<T> {
    const headers: Record<string, string> = {
      'X-License-Key': this.options.licenseKey,
      'X-Client-Name': this.options.clientName ?? '@tolokacode/checkbox',
      'X-Client-Version': this.options.clientVersion ?? '0.1.0',
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (auth && this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await this.fetch(this.baseUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      let data: unknown = text;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
      throw new CheckboxError(`Checkbox: ${errorMessage(data) || response.statusText}`, response.status, data);
    }
    if (as === 'binary') {
      return (await response.arrayBuffer()) as T;
    }
    const text = await response.text();
    if (as === 'text') {
      return text as T;
    }
    return (text ? JSON.parse(text) : null) as T;
  }
}

function errorMessage(data: unknown): string {
  if (data && typeof data === 'object') {
    const value = data as { message?: unknown; detail?: unknown };
    if (typeof value.message === 'string') {
      return value.message;
    }
    if (typeof value.detail === 'string') {
      return value.detail;
    }
    if (Array.isArray(value.detail) && value.detail[0]?.msg) {
      return String(value.detail[0].msg);
    }
  }
  return typeof data === 'string' ? data.slice(0, 200) : '';
}
