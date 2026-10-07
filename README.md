# @tolokacode/checkbox

TypeScript SDK for the [Checkbox](https://checkbox.ua) API: fiscal receipts (ПРРО) in Ukraine.

- Works in Node 18+, Next.js (server side), Bun. No dependencies.
- Types are generated from the official Checkbox OpenAPI spec.
- Tested against a real Checkbox test cash register.

Free and open source. There is no paid version.

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

Errors are thrown as `CheckboxError` with `status` and the API response in `body`.

## Development

```sh
npm install
npm test                 # unit tests
CHECKBOX_LICENSE_KEY=... CHECKBOX_PIN=... npm test   # plus tests against a test register
npm run generate         # update types from the Checkbox OpenAPI spec
```

## License

[EUPL-1.2](LICENSE)
