const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
}
const { createCheckout, submitOrder } = require('../src/utils/checkout.ts');
const { PlanSummary } = require('../src/components/PlanSummary.tsx');
const { addSelection } = require('../src/utils/planSummary.ts');
const food = { dishId: '7-1', stallId: 7, stallName: 'Laksa Kitchen', dishName: 'Laksa', price: '$6' };
const receipt = { orderId: 'run-42', queueNumber: 42, prepMinutes: 7, queueMinutes: 3, estimatedTotalWait: 10, estimatedPickupTime: '2026-09-06T00:05:00+08:00' };

test('checkout uses server receipt and suppresses concurrent and completed repeated clicks', async () => {
  let resolve, requests = 0;
  const checkout = createCheckout(dishId => {
    assert.equal(dishId, '7-1'); requests++;
    return new Promise(r => resolve = r);
  });
  const states = [];
  const update = (...args) => states.push(args);
  const first = checkout('m', food, update);
  await checkout('m', food, update);
  assert.equal(requests, 1);
  assert.deepEqual(states, [['submitting']]);
  resolve(receipt);
  assert.deepEqual(await first, receipt);
  await checkout('m', food, update);
  assert.equal(requests, 1);
  assert.deepEqual(states[1], ['checked_out', receipt]);
});

test('failure preserves added selection and permits retry without fake confirmation', async () => {
  let calls = 0;
  const checkout = createCheckout(async () => { if (++calls === 1) throw Error('Offline'); return receipt; });
  const states = [];
  assert.equal(await checkout('m', food, (...s) => states.push(s)), undefined);
  assert.deepEqual(states[1], ['added', undefined, 'Offline']);
  assert.deepEqual(await checkout('m', food, (...s) => states.push(s)), receipt);
});

test('missing dish ID fails without request; adding a selection does not checkout', async () => {
  const checkout = createCheckout(() => { throw Error('must not submit'); });
  const messages = addSelection([{ id: 'm', suggestedFood: food }], 'm');
  assert.equal(messages[0].orderState, 'added');
  const states = [];
  await checkout('m', { ...food, dishId: undefined }, (...s) => states.push(s));
  assert.equal(states[1][0], 'added');
  assert.match(states[1][2], /fresh recommendation/);
});

test('HTTP checkout sends only dish ID and handles server rejection', async () => {
  const original = global.fetch;
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, '/api/orders');
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), { dishId: '7-1' });
      return { ok: true, json: async () => receipt };
    };
    assert.deepEqual(await submitOrder('', '7-1'), receipt);
    global.fetch = async () => ({ ok: false });
    await assert.rejects(submitOrder('', '7-1'), /Checkout failed/);
  } finally { global.fetch = original; }
});

test('summary renders server timing and Singapore pickup across midnight', () => {
  const html = renderToStaticMarkup(React.createElement(PlanSummary, { messages: [{
    id: 'm', orderState: 'checked_out', suggestedFood: { ...food, ...receipt }, ...receipt,
  }] }));
  for (const text of ['Queue #42', '10 min', '06 Sept', '00:05', 'SGT', 'Accelerated demo-simulation']) assert.ok(html.includes(text), text);
});
