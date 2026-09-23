const mongoose = require('mongoose');

const D0 = () => mongoose.Types.Decimal128.fromString('0');

const salesClaimLineSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true },
  milestoneRef: { type: String, trim: true },
  amount: { type: mongoose.Schema.Types.Decimal128, required: true },
  revenueAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'ChartOfAccounts' }
}, { _id: true });

const salesClaimSchema = new mongoose.Schema({
  claimNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  claimPeriod: {
    from: { type: Date, required: true },
    to: { type: Date, required: true }
  },
  claimDate: { type: Date, default: Date.now },
  percentComplete: {
    type: mongoose.Schema.Types.Decimal128,
    default: D0
  },
  lines: { type: [salesClaimLineSchema], validate: v => Array.isArray(v) && v.length > 0 },
  grossAmount: { type: mongoose.Schema.Types.Decimal128, required: true, default: D0 },
  vatAmount: { type: mongoose.Schema.Types.Decimal128, default: D0 },
  retentionRate: { type: mongoose.Schema.Types.Decimal128, default: D0 },
  retention: { type: mongoose.Schema.Types.Decimal128, default: D0 },
  netInvoiceAmount: { type: mongoose.Schema.Types.Decimal128, required: true, default: D0 },
  customerName: { type: String, trim: true },
  customerTRN: { type: String, trim: true },
  status: {
    type: String,
    enum: ['draft', 'approved', 'invoiced', 'journalized', 'collected', 'cancelled'],
    default: 'draft',
    index: true
  },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
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

salesClaimSchema.index({ projectId: 1, claimDate: -1 });
salesClaimSchema.index({ status: 1, claimDate: -1 });

module.exports = mongoose.model('SalesClaim', salesClaimSchema);
