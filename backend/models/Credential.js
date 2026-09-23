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

const renewalHistorySchema = new mongoose.Schema({
  renewedAt: { type: Date, default: Date.now },
  renewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  previousExpiry: { type: Date },
  newExpiry: { type: Date },
  renewalFee: { type: Number, min: 0 },
  notes: { type: String, trim: true }
}, { _id: true });

const credentialSchema = new mongoose.Schema({
  credentialName: { type: String, required: true, trim: true },
  credentialNumber: { type: String, unique: true, trim: true },
  credentialType: {
    type: String,
    enum: [
      'iso_certification', 'trade_license', 'professional_license',
      'membership', 'accreditation', 'certification', 'permit', 'other'
    ],
    required: true,
    default: 'other'
  },
  issuingAuthority: { type: String, required: true, trim: true },
  description: { type: String, trim: true, maxlength: 2000 },

  issueDate: { type: Date },
  expiryDate: { type: Date, default: null },
  renewalDate: { type: Date },
  noExpiry: { type: Boolean, default: false },

  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'critical'],
    default: 'normal'
  },
  status: {
    type: String,
    enum: ['active', 'expiring_soon', 'expired', 'renewed', 'archived'],
    default: 'active'
  },
  verificationStatus: {
    type: String,
    enum: ['verified', 'pending', 'unverified'],
    default: 'pending'
  },
  verifiedAt: { type: Date },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  coverageScope: { type: String, trim: true },
  applicableRegion: { type: String, trim: true },
  level: { type: String, trim: true },

  ownerDepartment: { type: String, trim: true },
  responsiblePerson: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  attachments: [attachmentSchema],

  reminderDaysBefore: { type: Number, default: 30, min: 0 },
  renewalFee: { type: Number, min: 0 },
  renewalNotes: { type: String, trim: true },
  renewalHistory: [renewalHistorySchema],

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  edits: [editSchema]
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

credentialSchema.index({ credentialNumber: 1 }, { unique: true });
credentialSchema.index({ status: 1 });
credentialSchema.index({ credentialType: 1 });
credentialSchema.index({ verificationStatus: 1 });
credentialSchema.index({ expiryDate: 1 });
credentialSchema.index({ createdBy: 1 });
credentialSchema.index({ credentialName: 'text', issuingAuthority: 'text', description: 'text' });

credentialSchema.virtual('daysUntilExpiry').get(function () {
  if (this.noExpiry || !this.expiryDate) return null;
  return Math.ceil((new Date(this.expiryDate).getTime() - Date.now()) / 86400000);
});

function computeExpiryStatus(cred) {
  if (cred.status === 'archived') return 'archived';
  if (cred.noExpiry || !cred.expiryDate) return 'active';
  const now = Date.now();
  const expiry = new Date(cred.expiryDate).getTime();
  const windowMs = (cred.reminderDaysBefore || 30) * 24 * 60 * 60 * 1000;
  if (expiry < now) return 'expired';
  if (expiry - now <= windowMs) return 'expiring_soon';
  return 'active';
}

credentialSchema.pre('save', async function (next) {
  try {
    if (!this.credentialNumber) {
      const count = await mongoose.model('Credential').countDocuments();
      this.credentialNumber = `CRED-${String(count + 1).padStart(5, '0')}`;
    }
    if (this.status !== 'archived') {
      this.status = computeExpiryStatus(this);
    }
    next();
  } catch (err) {
    next(err);
  }
});

credentialSchema.statics.computeExpiryStatus = computeExpiryStatus;

module.exports = mongoose.model('Credential', credentialSchema);
