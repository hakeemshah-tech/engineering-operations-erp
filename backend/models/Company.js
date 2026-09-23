const mongoose = require('mongoose');

const logoSchema = new mongoose.Schema({
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

const addressSchema = new mongoose.Schema({
  street: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  country: { type: String, trim: true },
  postalCode: { type: String, trim: true },
  poBox: { type: String, trim: true }
}, { _id: false });

const companySchema = new mongoose.Schema({
  legalName: { type: String, required: true, trim: true },
  tradingName: { type: String, trim: true },
  logo: { type: logoSchema, default: null },
  companyType: {
    type: String,
    enum: ['llc', 'corporation', 'partnership', 'sole_proprietorship', 'free_zone', 'other'],
    default: 'llc'
  },
  industry: { type: String, trim: true },
  establishmentDate: { type: Date },
  companySize: {
    type: String,
    enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+', ''],
    default: ''
  },

  registrationNumber: { type: String, trim: true, sparse: true },
  licenseExpiryDate: { type: Date },
  licenseIssuingAuthority: { type: String, trim: true },
  countryOfIncorporation: { type: String, trim: true },

  trn: { type: String, trim: true, sparse: true },
  taxRegistrationDate: { type: Date },

  primaryEmail: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  alternatePhone: { type: String, trim: true },
  website: { type: String, trim: true },
  fax: { type: String, trim: true },

  address: { type: addressSchema, default: () => ({}) },
  mailingAddress: { type: addressSchema, default: () => ({}) },
  mailingSameAsAddress: { type: Boolean, default: true },

  workingHours: { type: String, trim: true },
  businessDescription: { type: String, trim: true, maxlength: 2000 },
  keyServices: [{ type: String, trim: true }],
  numberOfEmployees: { type: Number, min: 0 },
  annualRevenueRange: {
    type: String,
    enum: ['under_1m', '1m_10m', '10m_50m', '50m_100m', '100m_500m', 'over_500m', ''],
    default: ''
  },

  bankName: { type: String, trim: true },
  accountName: { type: String, trim: true },
  accountNumber: { type: String, trim: true },
  iban: { type: String, trim: true },
  swiftCode: { type: String, trim: true },

  socialLinks: {
    linkedIn: { type: String, trim: true },
    twitter: { type: String, trim: true },
    facebook: { type: String, trim: true },
    instagram: { type: String, trim: true }
  },

  status: { type: String, enum: ['active', 'inactive'], default: 'active' },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  edits: [editSchema]
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

companySchema.index({ registrationNumber: 1 }, { unique: true, sparse: true });
companySchema.index({ trn: 1 }, { unique: true, sparse: true });

companySchema.virtual('licenseStatus').get(function () {
  if (!this.licenseExpiryDate) return null;
  const now = Date.now();
  const expiry = new Date(this.licenseExpiryDate).getTime();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  if (expiry < now) return 'expired';
  if (expiry - now <= thirtyDays) return 'expiring_soon';
  return 'active';
});

companySchema.virtual('licenseDaysUntilExpiry').get(function () {
  if (!this.licenseExpiryDate) return null;
  return Math.ceil((new Date(this.licenseExpiryDate).getTime() - Date.now()) / 86400000);
});

companySchema.pre('save', async function (next) {
  if (this.isNew) {
    const count = await mongoose.model('Company').countDocuments();
    if (count >= 1) {
      return next(new Error('A company profile already exists. Only one company profile is allowed.'));
    }
  }
  next();
});

module.exports = mongoose.model('Company', companySchema);
