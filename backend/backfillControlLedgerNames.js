const mongoose = require('mongoose');
require('dotenv').config();

const ChartOfAccounts = require('./models/ChartOfAccounts');
const { isReservedTallyGroup } = require('./utils/tally/buildLedgerMaster');

/**
 * One-time migration for EXISTING installs.
 *
 * The trade control ledgers 1300-AR-TRADE / 2100-AP-TRADE were originally seeded
 * with a NAME + tallyLedgerName identical to a reserved Tally group
 * ("Sundry Debtors" / "Sundry Creditors"). Tally cannot hold a *ledger* named
 * after a built-in *group*, so those ledgers are flagged non-postable during
 * reconciliation and can never capture a GUID - they show "will sync" but the
 * sync count stays 0 and the CoA badge stays "Not Synced" forever.
 *
 * This renames them to valid, non-colliding control-account names so they export
 * and reconcile like any other ledger. Voucher builders identify these lines by
 * CODE, not name, so posting is unaffected.
 *
 * Idempotent: only rewrites a ledger still carrying the old reserved name. Safe
 * to re-run. Also scans for any OTHER ledger whose Tally name collides with a
 * reserved group and reports it (does not auto-rename those - they may be custom).
 */
const RENAMES = [
  { code: '1300-AR-TRADE', newName: 'Trade Debtors (Control)' },
  { code: '2100-AP-TRADE', newName: 'Trade Creditors (Control)' }
];

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const fixed = [];
    for (const { code, newName } of RENAMES) {
      const acc = await ChartOfAccounts.findOne({ code });
      if (!acc) continue;

      const nameCollides = isReservedTallyGroup(acc.name);
      const tallyCollides = isReservedTallyGroup(acc.tallyLedgerName);
      // Only migrate while a reserved group name is still in place. Once renamed
      // (or if it was hand-set to some other custom name), leave it untouched -
      // this keeps the script idempotent and non-destructive.
      if (!nameCollides && !tallyCollides) continue;

      acc.name = newName;
      acc.tallyLedgerName = newName;
      acc.tallyLedgerNameAuto = false;
      // The old name never validly existed in Tally, so do NOT emit an Alter
      // rename (Tally would fail to find "Sundry Debtors" as a ledger). Clear any
      // stale rename marker so the next export is a clean Create.
      acc.previousTallyLedgerName = '';
      // Reset the sync state to "never synced": the masters-export ACK stamps
      // lastSyncedToTally on ALL active ledgers, so these broken ones may carry a
      // stale timestamp even though they never truly reached Tally. Clearing it
      // keeps the badge honest ("Not Synced") and lets the user export the newly
      // named ledger cleanly (and avoids the name-lock engaging prematurely).
      acc.lastSyncedToTally = null;
      acc.tallyGuid = '';
      await acc.save();
      fixed.push(`${code} → "${newName}"`);
    }

    // Report any remaining ledgers whose Tally-facing name collides with a
    // reserved group (these will silently fail to sync until renamed).
    const active = await ChartOfAccounts.find({ isActive: true }).select('code name tallyLedgerName').lean();
    const stillColliding = active.filter(a =>
      isReservedTallyGroup(a.tallyLedgerName || '') || isReservedTallyGroup(a.name || '')
    );

    console.log('[Control-Ledger-Names Backfill]');
    console.log(`  Renamed (${fixed.length}):`, fixed.join(', ') || 'none (already migrated)');
    if (stillColliding.length) {
      console.log('  ⚠️  Ledgers still named after a reserved Tally group (rename these to let them sync):');
      for (const a of stillColliding) {
        console.log(`      ${a.code} - name:"${a.name}" tally:"${a.tallyLedgerName}"`);
      }
    } else {
      console.log('  No ledgers remain named after a reserved Tally group. ✅');
    }
    process.exit(0);
  } catch (err) {
    console.error('[Control-Ledger-Names Backfill] failed:', err);
    process.exit(1);
  }
}

run();
