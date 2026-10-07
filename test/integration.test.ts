import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Checkbox, orderReceipt } from '../src/index.js';

const licenseKey = process.env.CHECKBOX_LICENSE_KEY;
const pinCode = process.env.CHECKBOX_PIN;

describe.skipIf(!licenseKey || !pinCode)('Checkbox test register', () => {
  const checkbox = licenseKey && pinCode ? new Checkbox({ licenseKey, pinCode }) : (null as unknown as Checkbox);
  const goods = [{ good: { code: 'sdk-test', name: 'SDK test', price: 1000 }, quantity: 2000 }];

  it('is a test register', async () => {
    const cashier = await checkbox.me();
    expect(cashier.full_name).toBeTruthy();
  });

  it('sells and returns', async () => {
    await checkbox.ensureShift();
    const sale = await checkbox.sell({ id: randomUUID(), goods, payments: [{ type: 'CASHLESS', value: 2000, label: 'Інтернет еквайринг' }] });
    const done = await checkbox.waitForReceipt(sale.id);
    expect(done.status).toBe('DONE');
    expect(done.fiscal_code).toMatch(/^TEST-/);
    expect(done.total_sum).toBe(2000);

    const pdf = await checkbox.receiptPdf(sale.id);
    expect(new TextDecoder().decode(pdf.slice(0, 4))).toBe('%PDF');

    const back = await checkbox.returnReceipt({ id: randomUUID(), goods, payments: [{ type: 'CASHLESS', value: 2000, label: 'Інтернет еквайринг' }], related_receipt_id: sale.id });
    expect((await checkbox.waitForReceipt(back.id)).type).toBe('RETURN');
  }, 60000);

  it('runs a prepayment chain', async () => {
    await checkbox.ensureShift();
    const pre = await checkbox.prepayment({ id: randomUUID(), goods, payments: [{ type: 'CASHLESS', value: 500, label: 'Інтернет еквайринг' }] });
    expect(pre.pre_payment_relation_id).toBeTruthy();
    await checkbox.waitForReceipt(pre.id);
    const after = await checkbox.afterPayment(pre.pre_payment_relation_id!, { id: randomUUID(), payments: [{ type: 'CASHLESS', value: 1500, label: 'Переказ через ННПП' }] });
    expect((await checkbox.waitForReceipt(after.id)).status).toBe('DONE');
    const returned = await checkbox.returnPrepayment(pre.pre_payment_relation_id!);
    expect(returned.length).toBe(2);
  }, 90000);

  it('sells an order with shipping and a discount', async () => {
    await checkbox.ensureShift();
    const order = orderReceipt({
      lines: [
        { code: 'sdk-cup', name: 'SDK cup', quantity: 3, total: 10000 },
        { code: 'sdk-tea', name: 'SDK tea', quantity: 0.25, total: 5000 },
      ],
      shipping: 7000,
      shippingAs: 'surcharge',
      discount: 2000,
    });
    const sale = await checkbox.sell({ id: randomUUID(), goods: order.goods, discounts: order.discounts, payments: [{ type: 'CASHLESS', value: order.sum, label: 'Інтернет еквайринг' }] });
    const done = await checkbox.waitForReceipt(sale.id);
    expect(done.status).toBe('DONE');
    expect(done.total_sum).toBe(order.sum);
  }, 60000);
});
