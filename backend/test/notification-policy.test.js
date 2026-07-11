const test = require('node:test');
const assert = require('node:assert/strict');
const { keyPlatformChanges, shouldPushDailySummary } = require('../notificationPolicy');

test('morning summary is retained while unchanged noon and evening reports stay quiet', () => {
  assert.equal(shouldPushDailySummary('morning', []), true);
  assert.equal(shouldPushDailySummary('noon', []), false);
  assert.equal(shouldPushDailySummary('evening', [{ transition_type: 'entered' }]), false);
});

test('key transitions and explicit override allow a notification', () => {
  const changes = [{ transition_type: 'upgrade' }, { transition_type: 'entered' }];
  assert.deepEqual(keyPlatformChanges(changes), [changes[0]]);
  assert.equal(shouldPushDailySummary('noon', changes), true);
  assert.equal(shouldPushDailySummary('evening', [], true), true);
});
