const KEY_TRANSITIONS = new Set(['upgrade', 'downgrade', 'invalidated']);

function keyPlatformChanges(changes) {
  return (Array.isArray(changes) ? changes : []).filter(change =>
    KEY_TRANSITIONS.has(change?.transition_type || change?.type)
  );
}

function shouldPushDailySummary(reportType, changes, force = false) {
  if (force) return true;
  if (reportType === 'morning') return true;
  return keyPlatformChanges(changes).length > 0;
}

module.exports = { keyPlatformChanges, shouldPushDailySummary };
