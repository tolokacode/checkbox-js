# @tolokacode/checkbox

TypeScript SDK for the [Checkbox](https://checkbox.ua) API: fiscal receipts (ПРРО) in Ukraine.

- Works in Node 18+, Next.js (server side), Bun. No dependencies.
- Types are generated from the official Checkbox OpenAPI spec.
- Tested against a real Checkbox test cash register.

## Install

```sh
npm install @tolokacode/checkbox
```

## Usage

```ts
import { randomUUID } from 'node:crypto';
import { Checkbox } from '@tolokacode/checkbox';

const checkbox = new Checkbox({
  licenseKey: process.env.CHECKBOX_LICENSE_KEY!,
  pinCode: process.env.CHECKBOX_PIN!,
});

await checkbox.ensureShift();

const receipt = await checkbox.sell({
  id: randomUUID(),
  goods: [{ good: { code: 'sku-1', name: 'Футболка', price: 45000 }, quantity: 1000 }],
  payments: [{ type: 'CASHLESS', value: 45000, label: 'Інтернет еквайринг' }],
  delivery: { emails: ['client@example.com'] },
});

const done = await checkbox.waitForReceipt(receipt.id);
console.log(done.fiscal_code, `https://check.checkbox.ua/${receipt.id}`);
```

Amounts are in kopecks, quantities in thousandths (`1000` = 1 piece).

## From an order to a receipt

`orderReceipt()` does the math that every shop needs. It takes line totals after discounts, adds shipping and an order discount, and returns the goods, discounts and the sum to pay.

```ts
import { kop, nextTime, orderReceipt } from '@tolokacode/checkbox';

const order = orderReceipt({
  lines: [
    { code: 'sku-1', name: 'Футболка', quantity: 2, total: kop('900.00'), uktzed: '6109100010' },
    { code: 'sku-2', name: 'Чашка', quantity: 3, total: kop('100.00') },
  ],
  shipping: kop(70),
  shippingAs: 'surcharge', // or 'line' (default): shipping is a separate good
  discount: kop(20),       // a discount that is not in the line totals, e.g. a negative fee
});

await checkbox.ensureShift({ autoCloseAt: nextTime('23:50') });
await checkbox.sell({
  id: randomUUID(),
  goods: order.goods,
  discounts: order.discounts,
  payments: [{ type: 'CASHLESS', value: order.sum, label: 'Інтернет еквайринг' }],
  header: 'Магазин «Толока»',
  footer: 'Замовлення №1024. Дякуємо!',
});
```

Checkbox needs a whole price per unit. A line that does not split evenly, like 3 cups for 100.00, goes on the receipt as one item: `Чашка × 3`.

`nextTime('23:50')` is the next 23:50 in Kyiv. The shift then closes by itself every night.

## Serverless, logs, several registers

```ts
const checkbox = new Checkbox({
  licenseKey,
  pinCode,
  token: await cache.get('checkbox-token'),           // skip sign-in on every call
  onToken: (token) => cache.set('checkbox-token', token),
  onRequest: (log) => console.log(log.method, log.path, log.status, log.error ?? ''),
});
```

For several cash registers or legal entities, create one `Checkbox` per register.

A retry of `sell()` with the same `id` returns the receipt that already exists, so it never makes a second one.

| Method | What it does |
|---|---|
| `signIn()`, `signOut()`, `me()` | Cashier session. Sign-in happens on the first call and again when the token expires. |
| `currentShift()`, `openShift()`, `closeShift()`, `ensureShift()` | Shifts. `ensureShift()` opens one if needed and waits until it is open. |
| `sell()`, `returnReceipt()` | Sale and return receipts. Pass your own `id` so retries don't create duplicates. |
| `receipt()`, `waitForReceipt()` | Get a receipt, wait until it is fiscalized. |
| `receiptPdf()`, `receiptPng()`, `receiptHtml()`, `receiptText()`, `sendReceiptEmail()` | Receipt files and email. |
| `prepayment()`, `afterPayment()`, `returnPrepayment()` | Prepayment and after-payment receipts, e.g. for cash on delivery. |
| `xReport()` | X report for the current shift. |
| `request()` | Any other endpoint, with the same auth. |
| `orderReceipt()`, `good()`, `kop()`, `nextTime()` | Helpers to build a receipt from an order. |

Errors are thrown as `CheckboxError` with `status` and the API response in `body`.

## Development

```sh
npm install
npm test                 # unit tests
CHECKBOX_LICENSE_KEY=... CHECKBOX_PIN=... npm test   # plus tests against a test register
npm run generate         # update types from the Checkbox OpenAPI spec
```

To release, bump the version and push to `main`:

```sh
npm version minor --no-git-tag-version   # or patch / major
git commit -s -am "Release 0.2.0" && git push
```

When the version in `package.json` is not on npm yet, the Publish workflow tests, publishes and creates a GitHub release.

## License

[MIT](LICENSE)
