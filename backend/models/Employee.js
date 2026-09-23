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

const certificateSchema = new mongoose.Schema({
  name: String,
  attachmentId: String,
  issuedBy: String,
  issueDate: Date,
  expiryDate: Date
});

const checklistItemSchema = new mongoose.Schema({
  item: {
    type: String,
    enum: ['NDA', 'SIM', 'Email', 'Office Key', 'Laptop', 'Car', 'Mobile'],
    required: true
  },
  done: { type: Boolean, default: false },
  doneAt: Date,
  doneBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: String
});

const stageCompletionSchema = new mongoose.Schema({
  stage: { type: String, required: true },
  completedAt: { type: Date, default: Date.now },
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: String
});

const employeeSchema = new mongoose.Schema({
  employeeId: { type: String, unique: true, trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  fullName: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  dob: Date,
  nationality: String,
  gender: { type: String, enum: ['male', 'female', 'other'] },

  // Public URL to the employee's profile photo (uploaded via
  // POST /api/employees/:id/photo, served from /uploads/employee-photos/).
  // Optional - shown on the form, profile page, and HR grid avatars.
  photoUrl: { type: String, trim: true },

  category: {
    type: String,
    enum: ['site_company_visa', 'site_mission_visa', 'office'],
    required: true
  },
  status: {
    type: String,
    enum: ['onboarding', 'active', 'on_leave', 'offboarding', 'terminated', 'resigned'],
    default: 'onboarding'
  },
  otEligible: { type: Boolean, default: false },

  position: String,
  department: String,
  reportingTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedProjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],

  // Default location used by the GPS punch endpoint when the employee has no
  // active project with a siteLocationId. Optional - required only for employees
  // expected to self-punch.
  baseLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location' },

  // Multi-location support - employees who legitimately work from more than
  // one fixed location (e.g., a manager who splits time across two offices).
  // Resolved at punch-context time alongside baseLocationId.
  additionalLocationIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Location' }],

  // Group-based assignment - employees assigned to a LocationGroup inherit
  // every active Location in that group as a valid punch target. This is the
  // main lever to scale WFH and multi-office setups (one group, many members,
  // edit the group once and every employee inherits).
  locationGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'LocationGroup' },

  workflow: {
    type: {
      type: String,
      enum: ['overseas', 'uae_transfer', 'emirati'],
      required: true
    },
    currentStage: { type: String, default: 'offer' },
    stagesCompleted: [stageCompletionSchema]
  },

  offerLetter: {
    basicSalary: { type: Number, default: 0 },
    housingAllowance: { type: Number, default: 0 },
    transportAllowance: { type: Number, default: 0 },
    otherAllowances: { type: Number, default: 0 },
    totalGrossSalary: { type: Number, default: 0 },
    issueDate: Date,
    acceptanceDate: Date,
    signed: { type: Boolean, default: false },
    attachmentId: String
  },

  contract: {
    mohreContractNumber: String,
    type: { type: String, enum: ['limited', 'unlimited'] },
    startDate: Date,
    endDate: Date,
    attachmentId: String
  },

  documents: {
    passport: {
      number: String,
      expiryDate: Date,
      attachmentId: String
    },
    visa: {
      number: String,
      type: { type: String },
      issueDate: Date,
      expiryDate: Date,
      attachmentId: String
    },
    labourCard: {
      number: String,
      expiryDate: Date,
      attachmentId: String
    },
    emiratesId: {
      number: String,
      expiryDate: Date,
      attachmentId: String
    },
    insurance: {
      provider: String,
      policyNumber: String,
      expiryDate: Date,
      attachmentId: String
    },
    medical: {
      status: { type: String, enum: ['pending', 'scheduled', 'cleared', 'failed'] },
      expiryDate: Date,
      attachmentId: String
    },
    airTicket: {
      bookingRef: String,
      travelDate: Date,
      attachmentId: String
    },
    cv: {
      attachmentId: String
    },
    certificates: [certificateSchema]
  },

  onboardingChecklist: [checklistItemSchema],
  attachments: [attachmentSchema],

  joiningDate: Date,
  probationEndDate: Date,

  notes: String,

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

employeeSchema.index({ status: 1 });
employeeSchema.index({ category: 1 });
employeeSchema.index({ 'workflow.type': 1 });
employeeSchema.index({ 'documents.passport.expiryDate': 1 });
employeeSchema.index({ 'documents.visa.expiryDate': 1 });
employeeSchema.index({ 'documents.labourCard.expiryDate': 1 });
employeeSchema.index({ 'documents.emiratesId.expiryDate': 1 });
employeeSchema.index({ 'documents.insurance.expiryDate': 1 });
employeeSchema.index({ createdBy: 1 });
employeeSchema.index({ userId: 1 });
employeeSchema.index({ baseLocationId: 1 });
employeeSchema.index({ locationGroupId: 1 });
employeeSchema.index({ additionalLocationIds: 1 });

employeeSchema.pre('save', async function (next) {
  try {
    if (!this.employeeId) {
      const count = await mongoose.model('Employee').countDocuments();
      this.employeeId = `EMP-${String(count + 1).padStart(5, '0')}`;
    }
    if (this.offerLetter) {
      const basic = Number(this.offerLetter.basicSalary) || 0;
      const housing = Number(this.offerLetter.housingAllowance) || 0;
      const transport = Number(this.offerLetter.transportAllowance) || 0;
      const other = Number(this.offerLetter.otherAllowances) || 0;
      this.offerLetter.totalGrossSalary = basic + housing + transport + other;
    }
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('Employee', employeeSchema);
