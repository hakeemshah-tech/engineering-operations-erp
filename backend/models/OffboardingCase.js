const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  filename: String,
  originalName: String,
  path: String,
  mimetype: String,
  size: Number,
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const clearanceItemSchema = new mongoose.Schema({
  item: {
    type: String,
    enum: ['NDA', 'SIM', 'Email', 'Office Key', 'Laptop', 'Car', 'Mobile', 'Final Settlement', 'Dues Paid'],
    required: true
  },
  returned: { type: Boolean, default: false },
  returnedAt: Date,
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: String
});

const offboardingCaseSchema = new mongoose.Schema({
  caseNumber: { type: String, unique: true, trim: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },

  exitType: {
    type: String,
    enum: ['resignation', 'termination', 'end_of_contract', 'retirement'],
    required: true
  },
  noticePeriodDays: { type: Number, default: 30 },
  noticeStartDate: Date,
  lastWorkingDate: Date,
  actualExitDate: Date,
  reason: String,

  gratuityCalc: {
    yearsOfService: Number,
    basicWage: Number,
    first5YearsDays: Number,
    after5YearsDays: Number,
    grossGratuity: Number,
    capAmount: Number,
    finalGratuity: Number,
    overrideAmount: Number,
    calculatedAt: Date,
    calculatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },

  clearanceChecklist: [clearanceItemSchema],

  finalSettlement: {
    unpaidSalary: { type: Number, default: 0 },
    unusedLeaveAmount: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    paid: { type: Boolean, default: false },
    paidAt: Date
  },

  experienceCertificate: {
    generatedAt: Date,
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    path: String
  },

  status: {
    type: String,
    enum: ['initiated', 'in_clearance', 'completed', 'cancelled'],
    default: 'initiated'
  },

  // Audit trail for the cancel action - captured when an Initiated or
  // In Clearance case is closed without proceeding to Completed.
  cancellation: {
    reason: String,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: Date
  },

  attachments: [attachmentSchema],

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  edits: [{
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    editedAt: { type: Date, default: Date.now },
    changes: [{
      field: { type: String, required: true },
      from: { type: mongoose.Schema.Types.Mixed },
      to: { type: mongoose.Schema.Types.Mixed }
    }]
  }]
}, { timestamps: true });

offboardingCaseSchema.index({ employee: 1 });
offboardingCaseSchema.index({ status: 1 });
offboardingCaseSchema.index({ actualExitDate: 1 });

offboardingCaseSchema.pre('save', async function (next) {
  try {
    if (!this.caseNumber) {
      const count = await mongoose.model('OffboardingCase').countDocuments();
      this.caseNumber = `OFF-${String(count + 1).padStart(5, '0')}`;
    }
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('OffboardingCase', offboardingCaseSchema);
