const mongoose = require('mongoose');

const D0 = () => mongoose.Types.Decimal128.fromString('0');

const supplierBillLineSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true },
  materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },
  quantity: { type: mongoose.Schema.Types.Decimal128, required: true },
  unitPrice: { type: mongoose.Schema.Types.Decimal128, required: true },
  lineTotal: { type: mongoose.Schema.Types.Decimal128, required: true },
  vatCode: {
    type: String,
    enum: ['STD-5', 'ZER-0', 'EXM', 'OOS', 'RCM'],
    default: 'STD-5'
  },
  vatRate: { type: mongoose.Schema.Types.Decimal128, default: () => mongoose.Types.Decimal128.fromString('5') },
  vatAmount: { type: mongoose.Schema.Types.Decimal128, default: D0 },
  expenseAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'ChartOfAccounts' }
}, { _id: true });

const matchExceptionSchema = new mongoose.Schema({
  lineIndex: { type: Number },
  kind: { type: String, enum: ['PRICE_VARIANCE', 'QTY_VARIANCE', 'VAT_VARIANCE', 'MISSING_GRN'] },
  expected: { type: mongoose.Schema.Types.Mixed },
  actual: { type: mongoose.Schema.Types.Mixed },
  variancePct: { type: mongoose.Schema.Types.Decimal128 },
  resolved: { type: Boolean, default: false },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: { type: Date },
  resolutionNote: { type: String }
}, { _id: true });

const supplierBillSchema = new mongoose.Schema({
  billNumber: {
    type: String,
    required: true,
    trim: true
  },
  billDate: { type: Date, required: true },
  dueDate: { type: Date },
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  },
  supplierTRN: { type: String, trim: true },
  purchaseOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder'
  },
  grnNumber: { type: String, trim: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  lines: { type: [supplierBillLineSchema], validate: v => Array.isArray(v) && v.length > 0 },
  subtotal: { type: mongoose.Schema.Types.Decimal128, default: D0 },
  vatAmount: { type: mongoose.Schema.Types.Decimal128, default: D0 },
  totalAmount: { type: mongoose.Schema.Types.Decimal128, default: D0 },
  vatBreakdown: [{
    vatCode: { type: String },
    taxableAmount: { type: mongoose.Schema.Types.Decimal128 },
    vatAmount: { type: mongoose.Schema.Types.Decimal128 }
  }],
  matchExceptions: [matchExceptionSchema],
  status: {
    type: String,
    enum: ['draft', 'matched', 'journalized', 'paid', 'cancelled'],
    default: 'draft',
    index: true
  },
  journalEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry' },
  notes: { type: String, trim: true },
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

supplierBillSchema.index({ supplierId: 1, billNumber: 1 }, { unique: true });
supplierBillSchema.index({ purchaseOrderId: 1 });
supplierBillSchema.index({ status: 1, billDate: -1 });

module.exports = mongoose.model('SupplierBill', supplierBillSchema);
