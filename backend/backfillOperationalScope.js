const mongoose = require('mongoose');
require('dotenv').config();

const ChartOfAccounts = require('./models/ChartOfAccounts');
const AccountGroup = require('./models/AccountGroup');
const { isOperationalAccount, isOperationalGroup, OPERATIONAL_SUBGROUPS, refreshOperationalScope } = require('./utils/accounts/operationalScope');

/**
 * One-time migration for EXISTING installs: deactivate (isActive=false) every
 * ChartOfAccounts ledger and AccountGroup sub-group that falls OUTSIDE the
 * operational scope (Equity/Share Capital/Retained Earnings, Fixed Assets,
 * Provisions, Purchase Accounts, Direct Incomes, Loans, Deposits, …).
 *
 * Non-destructive & reversible: rows are kept in the DB, only flipped inactive,
 * so they're hidden from the CoA UI and excluded from every Tally sync. Re-run
 * safe (idempotent). To restore one, set isActive=true again.
 */
async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    // Load Tally-ingested sub-groups into scope so they're kept operational
    // (never deactivated as "out of scope") by this migration.
    await refreshOperationalScope();

    const [ledgers, groups] = await Promise.all([
      ChartOfAccounts.find({ isActive: true }).select('code name group subGroup').lean(),
      AccountGroup.find({ isActive: true }).select('name group').lean()
    ]);

    const staleLedgers = ledgers.filter(a => !isOperationalAccount(a));
    const staleGroups = groups.filter(g => !isOperationalGroup(g));

    if (staleLedgers.length) {
      await ChartOfAccounts.updateMany(
        { _id: { $in: staleLedgers.map(a => a._id) } },
        { $set: { isActive: false } }
      );
    }
    if (staleGroups.length) {
      await AccountGroup.updateMany(
        { _id: { $in: staleGroups.map(g => g._id) } },
        { $set: { isActive: false } }
      );
    }

    console.log('[Operational-Scope Backfill]');
    console.log('  Operational sub-groups kept:', OPERATIONAL_SUBGROUPS.join(', '));
    console.log(`  Ledgers deactivated (${staleLedgers.length}):`, staleLedgers.map(a => a.code).join(', ') || 'none');
    console.log(`  Sub-groups deactivated (${staleGroups.length}):`, staleGroups.map(g => g.name).join(', ') || 'none');
    process.exit(0);
  } catch (err) {
    console.error('[Operational-Scope Backfill] failed:', err);
    process.exit(1);
  }
}

run();
