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

const vehicleDocumentSchema = new mongoose.Schema({
  documentType: {
    type: String,
    enum: [
      'registration', 'insurance', 'pollution', 'inspection', 'permit',
      'road_tax', 'driver_license', 'fitness_certificate', 'other'
    ],
    required: true
  },
  documentNumber: { type: String, trim: true },
  issueDate: { type: Date },
  expiryDate: { type: Date },
  issuingAuthority: { type: String, trim: true },
  attachments: [attachmentSchema],
  notes: { type: String, trim: true, maxlength: 1000 },
  reminderDaysBefore: { type: Number, default: 30, min: 0 },
  status: {
    type: String,
    enum: ['active', 'expiring_soon', 'expired'],
    default: 'active'
  }
}, { _id: true, timestamps: true });

const vehicleSchema = new mongoose.Schema({
  plateNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
  vehicleId: { type: String, unique: true, trim: true },
  make: { type: String, trim: true },
  model: { type: String, trim: true },
  year: { type: Number, min: 1950 },
  color: { type: String, trim: true },
  vin: { type: String, trim: true, uppercase: true, sparse: true },
  engineNumber: { type: String, trim: true },
  vehicleType: {
    type: String,
    enum: [
      'car', 'suv', 'pickup', 'van', 'truck', 'bus', 'trailer',
      'forklift', 'excavator', 'crane', 'generator', 'other'
    ],
    default: 'car'
  },
  category: {
    type: String,
    enum: ['company', 'rental', 'leased'],
    default: 'company'
  },
  fuelType: {
    type: String,
    enum: ['petrol', 'diesel', 'electric', 'hybrid', 'cng', 'other', ''],
    default: ''
  },
  transmission: {
    type: String,
    enum: ['manual', 'automatic', 'cvt', ''],
    default: ''
  },

  seatingCapacity: { type: Number, min: 0 },
  loadCapacity: { type: String, trim: true },
  weight: { type: Number, min: 0 },

  purchaseDate: { type: Date },
  purchasePrice: { type: Number, min: 0 },
  currentValue: { type: Number, min: 0 },
  ownershipStatus: {
    type: String,
    enum: ['owned', 'leased', 'rented'],
    default: 'owned'
  },
  leasingCompany: { type: String, trim: true },

  assignedDriver: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, trim: true },
    phone: { type: String, trim: true }
  },
  assignedDepartment: { type: String, trim: true },
  currentProject: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },

  status: {
    type: String,
    enum: ['active', 'in_service', 'maintenance', 'idle', 'decommissioned', 'sold'],
    default: 'active'
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'critical'],
    default: 'normal'
  },
  currentLocation: { type: String, trim: true },
  odometerReading: { type: Number, min: 0 },
  lastServiceDate: { type: Date },
  nextServiceDate: { type: Date },

  vehicleDocuments: [vehicleDocumentSchema],

  insurance: {
    policyNumber: { type: String, trim: true },
    provider: { type: String, trim: true },
    expiryDate: { type: Date },
    premium: { type: Number, min: 0 }
  },

  notes: { type: String, trim: true, maxlength: 2000 },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  edits: [editSchema]
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

vehicleSchema.index({ plateNumber: 1 }, { unique: true });
vehicleSchema.index({ vehicleId: 1 }, { unique: true });
vehicleSchema.index({ vin: 1 }, { unique: true, sparse: true });
vehicleSchema.index({ status: 1 });
vehicleSchema.index({ vehicleType: 1 });
vehicleSchema.index({ category: 1 });
vehicleSchema.index({ 'assignedDriver.userId': 1 });
vehicleSchema.index({ 'vehicleDocuments.expiryDate': 1 });

function computeDocStatus(doc) {
  if (!doc.expiryDate) return 'active';
  const now = Date.now();
  const expiry = new Date(doc.expiryDate).getTime();
  const windowMs = (doc.reminderDaysBefore || 30) * 24 * 60 * 60 * 1000;
  if (expiry < now) return 'expired';
  if (expiry - now <= windowMs) return 'expiring_soon';
  return 'active';
}

vehicleSchema.virtual('expiringDocumentsCount').get(function () {
  if (!Array.isArray(this.vehicleDocuments)) return 0;
  return this.vehicleDocuments.filter(d =>
    d.status === 'expiring_soon' || d.status === 'expired'
  ).length;
});

vehicleSchema.virtual('earliestExpiryDate').get(function () {
  if (!Array.isArray(this.vehicleDocuments) || this.vehicleDocuments.length === 0) return null;
  const dates = this.vehicleDocuments
    .map(d => d.expiryDate ? new Date(d.expiryDate).getTime() : null)
    .filter(Boolean);
  if (dates.length === 0) return null;
  return new Date(Math.min(...dates));
});

vehicleSchema.virtual('daysUntilNextExpiry').get(function () {
  const earliest = this.earliestExpiryDate;
  if (!earliest) return null;
  return Math.ceil((new Date(earliest).getTime() - Date.now()) / 86400000);
});

vehicleSchema.pre('save', async function (next) {
  try {
    if (!this.vehicleId) {
      const count = await mongoose.model('Vehicle').countDocuments();
      this.vehicleId = `VEH-${String(count + 1).padStart(5, '0')}`;
    }
    if (this.plateNumber) this.plateNumber = this.plateNumber.toUpperCase();
    if (Array.isArray(this.vehicleDocuments)) {
      this.vehicleDocuments.forEach(doc => {
        doc.status = computeDocStatus(doc);
      });
    }
    next();
  } catch (err) {
    next(err);
  }
});

vehicleSchema.statics.computeDocStatus = computeDocStatus;

module.exports = mongoose.model('Vehicle', vehicleSchema);
