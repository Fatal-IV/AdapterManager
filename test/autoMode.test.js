const assert = require('assert');
const { decideAutoModeActions } = require('../src/main/autoMode');

function test_ethernet_up_disables_wifi() {
  const adapters = [
    { type: 'ethernet', status: 'up' },
    { type: 'wifi', status: 'up' }
  ];
  const actions = decideAutoModeActions(adapters);
  assert.deepStrictEqual(actions, [{ type: 'wifi', enable: false }]);
}

function test_ethernet_down_enables_wifi() {
  const adapters = [
    { type: 'ethernet', status: 'down' },
    { type: 'wifi', status: 'down' }
  ];
  const actions = decideAutoModeActions(adapters);
  assert.deepStrictEqual(actions, [{ type: 'wifi', enable: true }]);
}

function test_no_change_when_already_correct() {
  const adapters = [
    { type: 'ethernet', status: 'up' },
    { type: 'wifi', status: 'down' }
  ];
  assert.deepStrictEqual(decideAutoModeActions(adapters), []);
}

function test_ethernet_idle_treated_as_disconnected() {
  const adapters = [
    { type: 'ethernet', status: 'idle' },
    { type: 'wifi', status: 'down' }
  ];
  assert.deepStrictEqual(decideAutoModeActions(adapters), [{ type: 'wifi', enable: true }]);
}

module.exports = {
  test_ethernet_up_disables_wifi,
  test_ethernet_down_enables_wifi,
  test_no_change_when_already_correct,
  test_ethernet_idle_treated_as_disconnected
};
