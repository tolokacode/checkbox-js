import type { components } from './schema.js';

type Good = components['schemas']['GoodItemPayload'];
type Discount = components['schemas']['DiscountPayload'];

export interface OrderLine {
  code: string | number;
  name: string;
  /** Pieces, or kilograms etc. Can be fractional: 1.5 */
  quantity: number;
  /** Line total in kopecks after discounts. */
  total: number;
  uktzed?: string;
  tax?: number[] | string[];
}

export interface OrderReceiptInput {
  lines: OrderLine[];
  /** Shipping in kopecks. */
  shipping?: number;
  shippingAs?: 'line' | 'surcharge';
  shippingName?: string;
  /** Order discount in kopecks that is not already in the line totals. */
  discount?: number;
  discountName?: string;
  tax?: number[] | string[];
}

export interface OrderReceipt {
  goods: Good[];
  discounts: Discount[];
  /** What the customer pays, in kopecks. */
  sum: number;
}

/** Hryvnias to kopecks: kop('450.50') === 45050 */
export function kop(amount: number | string): number {
  return Math.round(Number(amount) * 100);
}

export function good(line: OrderLine, tax?: number[] | string[]): Good {
  const quantity = Math.round(line.quantity * 1000);
  const total = Math.round(line.total);
  // Checkbox needs a whole price per unit. When the total does not split evenly, sell the line as one item.
  const even = quantity > 0 && (total * 1000) % quantity === 0;
  const details: Good['good'] = {
    code: String(line.code),
    name: (even ? line.name : `${line.name} × ${line.quantity}`).slice(0, 256),
    price: even ? (total * 1000) / quantity : total,
  };
  if (line.uktzed) {
    details.uktzed = line.uktzed;
  }
  if (line.tax ?? tax) {
    details.tax = line.tax ?? tax;
  }
  return { good: details, quantity: even ? quantity : 1000 };
}

export function goodsSum(goods: Good[]): number {
  return Math.round(goods.reduce((sum, item) => sum + (item.good.price * item.quantity) / 1000, 0));
}

/** Turns order lines into goods, discounts and the sum to pay. */
export function orderReceipt(input: OrderReceiptInput): OrderReceipt {
  const goods = input.lines.filter((line) => line.total > 0).map((line) => good(line, input.tax));
  const discounts: Discount[] = [];
  const shipping = Math.round(input.shipping ?? 0);
  const shippingName = input.shippingName ?? 'Доставка';

  if (shipping > 0 && input.shippingAs === 'surcharge') {
    discounts.push({ type: 'EXTRA_CHARGE', mode: 'VALUE', value: shipping, name: shippingName });
  } else if (shipping > 0) {
    goods.push(good({ code: 'shipping', name: shippingName, quantity: 1, total: shipping }, input.tax));
  }

  const discount = Math.round(input.discount ?? 0);
  if (discount > 0) {
    discounts.push({ type: 'DISCOUNT', mode: 'VALUE', value: discount, name: input.discountName ?? 'Знижка' });
  }

  const surcharge = input.shippingAs === 'surcharge' ? shipping : 0;
  return { goods, discounts, sum: goodsSum(goods) + surcharge - discount };
}

/** Next time this clock time happens in a time zone, e.g. for openShift({ autoCloseAt: nextTime('23:50') }). */
export function nextTime(time: string, timeZone = 'Europe/Kyiv', now = new Date()): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const today = wallClock(now, timeZone);
  for (const day of [0, 1, 2]) {
    const date = zoned(today.year, today.month, today.day + day, hours, minutes, timeZone);
    if (date > now) {
      return date;
    }
  }
  throw new Error(`Checkbox: bad time ${time}`);
}

function wallClock(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

function zoned(year: number, month: number, day: number, hours: number, minutes: number, timeZone: string): Date {
  const wanted = Date.UTC(year, month - 1, day, hours, minutes);
  let date = new Date(wanted);
  for (let i = 0; i < 2; i++) {
    const clock = wallClock(date, timeZone);
    const shown = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second);
    date = new Date(date.getTime() + wanted - shown);
  }
  return date;
}
