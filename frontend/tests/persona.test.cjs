const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) =>
    module._compile(
      ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
      }).outputText,
      filename
    );
}

const { resolvePersonaName, buildWelcomeMessage } = require('../src/utils/persona.ts');

test('resolvePersonaName correctly extracts persona name from avatars', () => {
  const avatars = [
    { id: 'av-meeks', name: 'cc051_meeks', role: 'Meeks - Friendly Guide' },
    { id: 'av-mei', name: 'cc076a06_female_xr_01', role: 'Mei - Satay Specialist' },
    { id: 'av-raj', name: 'cc069a02_male_01', role: 'Raj - Family Planner' },
    { id: 'av-aya', name: 'cc046_vroid_female', role: 'Aya - Dietary Advisor' },
  ];

  assert.equal(resolvePersonaName(avatars, 'av-meeks'), 'Meeks');
  assert.equal(resolvePersonaName(avatars, 'av-mei'), 'Mei');
  assert.equal(resolvePersonaName(avatars, 'av-raj'), 'Raj');
  assert.equal(resolvePersonaName(avatars, 'av-aya'), 'Aya');
  assert.equal(resolvePersonaName(avatars, 'unknown'), 'Mei');
});

test('buildWelcomeMessage mentions 7:00 PM and reflects chosen avatar', () => {
  const meeksMsg = buildWelcomeMessage('Meeks');
  assert.ok(meeksMsg.includes("I'm Meeks"), 'Should mention chosen avatar name');
  assert.ok(meeksMsg.includes("7:00 PM"), 'Should mention simulated 7:00 PM time');
  assert.ok(meeksMsg.includes("7:45 PM Supertree Light Show"), 'Should mention show target');

  const rajMsg = buildWelcomeMessage('Raj');
  assert.ok(rajMsg.includes("I'm Raj"), 'Should reflect Raj');
  assert.ok(rajMsg.includes("7:00 PM"), 'Should mention simulated 7:00 PM time');
});
