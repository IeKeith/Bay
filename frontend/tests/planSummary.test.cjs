const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// Compile the actual TS/TSX modules for Node's built-in test runner.
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, filename);
  };
}
const { selectedPlanItems, addSelection, foodTiming } = require('../src/utils/planSummary.ts');
const { PlanSummary } = require('../src/components/PlanSummary.tsx');
const food = { stallId: 7, stallName: 'Katong Laksa Kitchen', dishName: 'Laksa', price: 'SGD $6.50', prepMinutes: 7, queueMinutes: 5, estimatedTotalWait: 12 };
const message = { id: 'a', role: 'assistant', content: '', suggestedFood: food, orderState: 'idle' };
const render = messages => renderToStaticMarkup(React.createElement(PlanSummary, { messages }));

test('empty summary excludes unselected recommendations', () => {
  assert.equal(selectedPlanItems([message]).length, 0);
  assert.match(render([message]), /Add food from the chat/);
});
test('multiple selections, repeated clicks and checkout retention', () => {
  let messages = [message, { ...message, id: 'b' }];
  messages = addSelection(addSelection(messages, 'a'), 'a');
  assert.equal(selectedPlanItems(messages).length, 1);
  messages = addSelection(messages, 'b');
  messages[0] = { ...messages[0], orderState: 'checked_out', queueNumber: 123 };
  messages = addSelection(messages, 'a');
  assert.equal(selectedPlanItems(messages).length, 2);
  assert.equal(messages[0].orderState, 'checked_out');
  const html = render(messages);
  for (const text of ['Katong Laksa Kitchen', 'Laksa', '7 min', '5 min', '12 min', 'Queue #123']) assert.ok(html.includes(text));
});
test('missing and invalid timing cannot become a made-up estimate', () => {
  for (const value of [undefined, -1, NaN, '5', Infinity]) {
    const invalidFood = { ...food, queueMinutes: value };
    assert.equal(foodTiming(invalidFood).total, undefined);
    assert.match(render([{ ...message, suggestedFood: invalidFood, orderState: 'added' }]), /Unavailable/);
  }
  assert.equal(foodTiming({ ...food, prepMinutes: 0, queueMinutes: 0 }).total, 0);
  assert.equal(foodTiming({ ...food, estimatedTotalWait: 99 }).total, 12);
});
