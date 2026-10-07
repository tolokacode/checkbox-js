import { describe, expect, it } from 'vitest';
import { good, kop, nextTime, orderReceipt } from '../src/index.js';

describe('receipt helpers', () => {
  it('converts hryvnias to kopecks', () => {
    expect(kop('450.50')).toBe(45050);
    expect(kop(19.99)).toBe(1999);
    expect(kop(0.1 + 0.2)).toBe(30);
  });

  it('splits a line into price per unit', () => {
    expect(good({ code: 'sku', name: 'Футболка', quantity: 2, total: 90000, uktzed: '6109' })).toEqual({
      good: { code: 'sku', name: 'Футболка', price: 45000, uktzed: '6109' },
      quantity: 2000,
    });
  });

  it('sells a discounted line as one item when it does not split evenly', () => {
    expect(good({ code: 1, name: 'Чашка', quantity: 3, total: 10000 })).toEqual({
      good: { code: '1', name: 'Чашка × 3', price: 10000 },
      quantity: 1000,
    });
  });

  it('handles weight', () => {
    expect(good({ code: 'apples', name: 'Яблука', quantity: 1.5, total: 6000 })).toEqual({
      good: { code: 'apples', name: 'Яблука', price: 4000 },
      quantity: 1500,
    });
  });

  it('adds shipping as a line', () => {
    const receipt = orderReceipt({ lines: [{ code: 'a', name: 'A', quantity: 1, total: 10000 }], shipping: 7000 });
    expect(receipt.goods[1]).toEqual({ good: { code: 'shipping', name: 'Доставка', price: 7000 }, quantity: 1000 });
    expect(receipt.discounts).toEqual([]);
    expect(receipt.sum).toBe(17000);
  });

  it('adds shipping as a surcharge and an order discount', () => {
    const receipt = orderReceipt({
      lines: [{ code: 'a', name: 'A', quantity: 2, total: 20000 }],
      shipping: 7000,
      shippingAs: 'surcharge',
      discount: 5000,
      tax: ['А'],
    });
    expect(receipt.goods).toHaveLength(1);
    expect(receipt.goods[0].good.tax).toEqual(['А']);
    expect(receipt.discounts).toEqual([
      { type: 'EXTRA_CHARGE', mode: 'VALUE', value: 7000, name: 'Доставка' },
      { type: 'DISCOUNT', mode: 'VALUE', value: 5000, name: 'Знижка' },
    ]);
    expect(receipt.sum).toBe(22000);
  });

  it('skips free lines', () => {
    expect(orderReceipt({ lines: [{ code: 'gift', name: 'Подарунок', quantity: 1, total: 0 }] }).goods).toEqual([]);
  });

  it('finds the next close time in Kyiv', () => {
    expect(nextTime('23:50', 'Europe/Kyiv', new Date('2026-07-01T12:00:00Z')).toISOString()).toBe('2026-07-01T20:50:00.000Z');
    expect(nextTime('23:50', 'Europe/Kyiv', new Date('2026-07-01T21:00:00Z')).toISOString()).toBe('2026-07-02T20:50:00.000Z');
    expect(nextTime('23:50', 'Europe/Kyiv', new Date('2026-01-15T12:00:00Z')).toISOString()).toBe('2026-01-15T21:50:00.000Z');
  });

  it('handles the DST switch', () => {
    expect(nextTime('23:50', 'Europe/Kyiv', new Date('2026-03-28T22:00:00Z')).toISOString()).toBe('2026-03-29T20:50:00.000Z');
  });
});
