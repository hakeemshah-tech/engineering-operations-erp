const mongoose = require('mongoose');
const { toNumber, equalsDecimal128 } = require('../utils/accounts/decimalHelpers');

const journalLineSchema = new mongoose.Schema({
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChartOfAccounts',
    required: true
  },
  debit: {
    type: mongoose.Schema.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0')
  },
  credit: {
    type: mongoose.Schema.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0')
  },
  costCenter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  vatCode: {
    type: String,
    enum: ['STD-5', 'ZER-0', 'EXM', 'OOS', 'RCM', null],
    default: null
  },
  vatAmount: {
    type: mongoose.Schema.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0')
  },
  description: { type: String, trim: true }
}, { _id: true });

const sourceSchema = new mongoose.Schema({
  kind: {
    type: String,
    required: true,
    enum: ['PURCHASE_ORDER', 'SUPPLIER_BILL', 'SALES_CLAIM', 'SALARY_RUN', 'MANUAL']
  },
  purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder' },
  grnNumber: { type: String, trim: true },
  supplierBill: { type: mongoose.Schema.Types.ObjectId, ref: 'SupplierBill' },
  salesClaim: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesClaim' },
  salaryRun: { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryRun' },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' }
}, { _id: false });

const journalEntrySchema = new mongoose.Schema({
  entryNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  entryDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  narration: {
    type: String,
    trim: true
  },
  voucherType: {
    type: String,
    required: true,
    enum: ['PURCHASE', 'SALES', 'PAYMENT', 'RECEIPT', 'JOURNAL', 'CONTRA']
  },
  lines: {
    type: [journalLineSchema],
    validate: {
      validator: v => Array.isArray(v) && v.length >= 2,
      message: 'A journal entry must have at least two lines'
    }
  },
  source: { type: sourceSchema, required: true },
  status: {
    type: String,
    enum: ['DRAFT', 'POSTED', 'REVERSED'],
    default: 'DRAFT',
    index: true
  },
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  postedAt: { type: Date },
  reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reversedAt: { type: Date },
  reversalOf: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry' },
  tallySyncStatus: {
    type: String,
    enum: ['PENDING', 'DOWNLOADED', 'SYNCED', 'FAILED'],
    default: 'PENDING',
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  edits: [{
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    editedAt: { type: Date, default: Date.now },
    changes: [{
      field: { type: String, required: true },
      from: { type: mongoose.Schema.Types.Mixed },
      to: { type: mongoose.Schema.Types.Mixed }
    }]
  }]
}, {
  timestamps: true
});

journalEntrySchema.pre('validate', function(next) {
  const lines = this.lines || [];

  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of lines) {
    const d = toNumber(line.debit);
    const c = toNumber(line.credit);
    if (d < 0 || c < 0) {
      return next(new Error('Journal line debit/credit must be non-negative'));
    }
    if (d > 0 && c > 0) {
      return next(new Error('A journal line cannot have both debit and credit populated'));
    }
    if (d === 0 && c === 0) {
      return next(new Error('A journal line must have either a debit or a credit amount'));
    }
    totalDebit += d;
    totalCredit += c;
  }

  if (!equalsDecimal128(totalDebit, totalCredit, 4)) {
    return next(new Error(
      `Journal not balanced: debits ${totalDebit.toFixed(4)} vs credits ${totalCredit.toFixed(4)}`
    ));
  }

  const src = this.source;
  if (src) {
    const refFields = ['purchaseOrder', 'supplierBill', 'salesClaim', 'salaryRun', 'project'];
    const populatedRefs = refFields.filter(f => src[f]);
    if (src.kind !== 'MANUAL' && populatedRefs.length === 0) {
      return next(new Error(`Non-manual source (${src.kind}) requires at least one source reference`));
    }
  }

  next();
});

journalEntrySchema.index({ tallySyncStatus: 1, entryDate: 1 });
journalEntrySchema.index({ 'source.kind': 1, 'source.purchaseOrder': 1 });
journalEntrySchema.index(
  { 'source.purchaseOrder': 1, 'source.grnNumber': 1, 'source.supplierBill': 1 },
  {
    unique: true,
    partialFilterExpression: {
      'source.kind': 'SUPPLIER_BILL',
      'source.purchaseOrder': { $exists: true },
      'source.supplierBill': { $exists: true }
    }
  }
);
journalEntrySchema.index({ entryDate: -1 });
journalEntrySchema.index({ status: 1, voucherType: 1 });

module.exports = mongoose.model('JournalEntry', journalEntrySchema);
