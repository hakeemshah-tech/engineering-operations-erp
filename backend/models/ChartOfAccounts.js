const mongoose = require('mongoose');

const editsSchema = {
  editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  editedAt: { type: Date, default: Date.now },
  changes: [{
    field: { type: String, required: true },
    from: { type: mongoose.Schema.Types.Mixed },
    to: { type: mongoose.Schema.Types.Mixed }
  }]
};

const chartOfAccountsSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  group: {
    type: String,
    required: true,
    // 'Uncategorized' is a bucket for ledgers imported from Tally whose parent
    // group can't be mapped to a standard ERP primary group.
    enum: ['Assets', 'Liabilities', 'Income', 'Expenses', 'Equity', 'Uncategorized']
  },
  subGroup: {
    type: String,
    required: true,
    trim: true
  },
  vatApplicable: {
    type: Boolean,
    default: false
  },
  vatRate: {
    type: mongoose.Schema.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0')
  },
  currency: {
    type: String,
    default: 'AED',
    uppercase: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Optional: the exact ledger name in Tally. When the user doesn't provide one
  // (the field is hidden in the UI), the backend auto-generates a unique name as
  // `${code} - ${name}` on save and flags it below so it stays in sync.
  tallyLedgerName: {
    type: String,
    default: '',
    trim: true
  },
  // True when tallyLedgerName was auto-generated (not hand-entered). Lets edits
  // to code/name regenerate it (and trigger a Tally rename) instead of drifting.
  tallyLedgerNameAuto: {
    type: Boolean,
    default: false
  },
  // --- Tally rename tracking ---------------------------------------------
  // The name Tally CURRENTLY knows this ledger/group by, captured the moment a
  // rename starts and held until the rename is exported + confirmed in Tally.
  // Empty string = no pending rename. The masters export emits
  //   <LEDGER ACTION="Alter" NAME="[previous]"><NAME>[current]</NAME>...
  // so Tally finds the existing record by its OLD name and renames it, instead
  // of creating a duplicate under the new name.
  previousTallyLedgerName: {
    type: String,
    default: '',
    trim: true
  },
  // Same idea for the parent group (subGroup): the group name Tally knew before
  // the user renamed it, so the export can emit a <GROUP ACTION="Alter"> rename.
  previousSubGroup: {
    type: String,
    default: '',
    trim: true
  },
  // Set when the Chart-of-Accounts masters export is acknowledged as imported
  // into Tally. Null = never synced (a "new" ledger); a date = "updated".
  lastSyncedToTally: {
    type: Date,
    default: null
  },
  // The GUID Tally holds for this ledger, captured during reconciliation of an
  // existing Tally company. When present, the export uses THIS guid (not our
  // _id) so Tally matches the existing record and updates in place.
  tallyGuid: {
    type: String,
    default: '',
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  // ERP-ONLY classification tags (e.g. "Steel", "Plumbing") used purely for
  // internal Chart-of-Accounts list filtering - so procurement users never need
  // to request a structural sub-group just to categorise a ledger. These MUST
  // NEVER be exported to Tally: they are deliberately excluded from every ledger
  // XML spec (they don't exist in Tally's ledger master).
  tags: {
    type: [String],
    default: []
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  edits: [editsSchema]
}, {
  timestamps: true
});

chartOfAccountsSchema.index({ group: 1, subGroup: 1 });
chartOfAccountsSchema.index({ isActive: 1 });
chartOfAccountsSchema.index({ tallyLedgerName: 1 });

module.exports = mongoose.model('ChartOfAccounts', chartOfAccountsSchema);
