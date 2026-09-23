const mongoose = require('mongoose');

const PRIMARY_GROUPS = ['Assets', 'Liabilities', 'Income', 'Expenses', 'Equity', 'Uncategorized'];

/**
 * A Sub-Group in our Chart of Accounts - a first-class record so it can own a
 * stable _id (used as the Tally <GUID>) and a parent primary classification.
 *
 * In Tally terms this is a "Group" whose PARENT is one of Tally's reserved
 * primary groups (resolved via tallyPrimaryGroups in the XML generator). Ledgers
 * reference a sub-group by `name`. Group names must be globally unique in Tally,
 * so `name` is unique here too.
 */
const accountGroupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  // Our internal primary classification. The XML generator maps this to the
  // exact Tally reserved primary-group name (e.g. Assets -> "Current Assets").
  group: {
    type: String,
    required: true,
    enum: PRIMARY_GROUPS
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Predefined defaults (seeded) vs. custom groups the Account Manager added.
  isSystem: {
    type: Boolean,
    default: false
  },
  // Rename tracking (mirrors ChartOfAccounts) so an Alter export can rename the
  // group in place in Tally instead of creating a duplicate.
  previousName: {
    type: String,
    default: '',
    trim: true
  },
  // For sub-groups AUTO-INGESTED from a Tally XML sync: the Tally PARENT group
  // they hang under (one of config/tallyConfig.js ALLOWED_TALLY_PARENTS). Its
  // presence marks the sub-group as Tally-owned - it counts as operational (so
  // ledgers under it export/reconcile) but is never re-emitted as a <GROUP> on
  // export (Tally already owns it). Empty for the ERP's own seeded sub-groups.
  tallyParent: {
    type: String,
    default: '',
    trim: true
  },
  // Set when the masters export is acknowledged as imported into Tally.
  // Null = never synced ("new" group); a date = "updated".
  lastSyncedToTally: {
    type: Date,
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

accountGroupSchema.index({ group: 1, name: 1 });
accountGroupSchema.index({ isActive: 1 });

module.exports = mongoose.model('AccountGroup', accountGroupSchema);
module.exports.PRIMARY_GROUPS = PRIMARY_GROUPS;
