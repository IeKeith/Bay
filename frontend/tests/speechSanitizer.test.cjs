const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
}
const { sanitizeForSpeech } = require('../src/utils/speechSanitizer.ts');

test('sanitizeForSpeech strips #, ~, comments, and formats numbers/currency', () => {
  const input = 'Order confirmed at Marina Refreshments & Sugar Cane Bar: Cold-Pressed Juice. Queue #657. Estimated wait: ~4 mins (queue ~2 mins + prep ~2 mins). Predicted pickup: 8:01 PM. Price: $9.50.';
  const output = sanitizeForSpeech(input);

  // Checks
  assert.ok(!output.includes('#'), 'Should not contain # symbol');
  assert.ok(!output.includes('~'), 'Should not contain ~ symbol');
  assert.ok(!output.includes('&'), 'Should not contain & symbol');
  assert.ok(output.includes('Queue number 657'), 'Queue #657 -> Queue number 657');
  assert.ok(output.includes('about 4 minutes'), '~4 mins -> about 4 minutes');
  assert.ok(output.includes('and'), '& -> and');
  assert.ok(output.includes('9 dollars and 50 cents'), '$9.50 -> 9 dollars and 50 cents');
});

