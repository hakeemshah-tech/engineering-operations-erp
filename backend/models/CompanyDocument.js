const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  path: { type: String, required: true },
  mimetype: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: true });

const editSchema = new mongoose.Schema({
  editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  editedAt: { type: Date, default: Date.now },
  changes: [{
    field: { type: String, required: true },
    from: { type: mongoose.Schema.Types.Mixed },
    to: { type: mongoose.Schema.Types.Mixed }
  }]
}, { _id: true });

const companyDocumentSchema = new mongoose.Schema({
  documentName: { type: String, required: true, trim: true },
  documentNumber: { type: String, unique: true, trim: true },
  documentType: {
    type: String,
    enum: [
      'trade_license', 'tax_certificate', 'nda', 'contract', 'policy',
      'certificate', 'compliance', 'insurance', 'agreement', 'other'
    ],
    required: true,
    default: 'other'
  },
  description: { type: String, trim: true, maxlength: 2000 },

  category: { type: String, trim: true },
  tags: [{ type: String, trim: true }],
  department: { type: String, trim: true },

  issueDate: { type: Date },
  expiryDate: { type: Date, default: null },
  noExpiry: { type: Boolean, default: false },

  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'critical'],
    default: 'normal'
  },
  status: {
    type: String,
    enum: ['active', 'expiring_soon', 'expired', 'archived'],
    default: 'active'
  },
  version: { type: String, trim: true, default: '1.0' },

  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  responsiblePerson: { type: String, trim: true },

  attachments: [attachmentSchema],
  primaryAttachmentId: { type: mongoose.Schema.Types.ObjectId, default: null },

  reminderDaysBefore: { type: Number, default: 30, min: 0 },
  lastRenewedAt: { type: Date },
  renewalNotes: { type: String, trim: true },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  edits: [editSchema]
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

companyDocumentSchema.index({ documentNumber: 1 }, { unique: true });
companyDocumentSchema.index({ status: 1 });
companyDocumentSchema.index({ documentType: 1 });
companyDocumentSchema.index({ expiryDate: 1 });
companyDocumentSchema.index({ owner: 1 });
companyDocumentSchema.index({ createdBy: 1 });
companyDocumentSchema.index({ documentName: 'text', description: 'text', tags: 'text' });

companyDocumentSchema.virtual('daysUntilExpiry').get(function () {
  if (this.noExpiry || !this.expiryDate) return null;
  return Math.ceil((new Date(this.expiryDate).getTime() - Date.now()) / 86400000);
});

function computeExpiryStatus(doc) {
  if (doc.status === 'archived') return 'archived';
  if (doc.noExpiry || !doc.expiryDate) return 'active';
  const now = Date.now();
  const expiry = new Date(doc.expiryDate).getTime();
  const windowMs = (doc.reminderDaysBefore || 30) * 24 * 60 * 60 * 1000;
  if (expiry < now) return 'expired';
  if (expiry - now <= windowMs) return 'expiring_soon';
  return 'active';
}

companyDocumentSchema.pre('save', async function (next) {
  try {
    if (!this.documentNumber) {
      const count = await mongoose.model('CompanyDocument').countDocuments();
      this.documentNumber = `DOC-${String(count + 1).padStart(5, '0')}`;
    }
    if (this.status !== 'archived') {
      this.status = computeExpiryStatus(this);
    }
    next();
  } catch (err) {
    next(err);
  }
});

companyDocumentSchema.statics.computeExpiryStatus = computeExpiryStatus;

module.exports = mongoose.model('CompanyDocument', companyDocumentSchema);
