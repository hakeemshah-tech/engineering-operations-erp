const SystemSettings = require('../../models/SystemSettings');

const DEFAULTS = {
  price3WayTolerancePct: 2,
  qty3WayToleranceAbs: 0,
  vat3WayTolerancePct: 2,
  otWeekdayMultiplier: 1.25,
  otRestDayMultiplier: 1.50,
  workingHoursPerDay: 8
};

let cache = { value: null, at: 0 };
const TTL_MS = 30 * 1000; // 30 seconds - admin tweaks picked up quickly

/** Read accounts settings with fallback to hardcoded defaults. */
async function getAccountsSettings() {
  const now = Date.now();
  if (cache.value && (now - cache.at) < TTL_MS) return cache.value;

  let stored = {};
  try {
    const doc = await SystemSettings.getSettings();
    stored = (doc && doc.accounts && doc.accounts.toObject) ? doc.accounts.toObject() : (doc?.accounts || {});
  } catch (err) {
    // Settings collection may not be ready during first boot - fall back silently.
  }

  const merged = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    const v = stored[key];
    if (v !== undefined && v !== null && Number.isFinite(Number(v))) merged[key] = Number(v);
  }

  // Non-numeric: PO type → expense-ledger code mapping (object, not a number).
  // Surfaced so expenseAccountResolver can resolve a configured default per PO type.
  if (stored.poTypeAccountMap && typeof stored.poTypeAccountMap === 'object') {
    merged.poTypeAccountMap = { ...stored.poTypeAccountMap };
  } else {
    merged.poTypeAccountMap = {};
  }

  cache = { value: merged, at: now };
  return merged;
}

function invalidateSettingsCache() {
  cache = { value: null, at: 0 };
}

module.exports = { getAccountsSettings, invalidateSettingsCache, DEFAULTS };
