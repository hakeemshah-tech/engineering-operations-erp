const mongoose = require('mongoose');

const D0 = () => mongoose.Types.Decimal128.fromString('0');

const projectAllocationSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  regularHours: { type: mongoose.Schema.Types.Decimal128, default: D0 },
  otHours: { type: mongoose.Schema.Types.Decimal128, default: D0 },
  allocatedAmount: { type: mongoose.Schema.Types.Decimal128, default: D0 }
}, { _id: false });

const deductionSchema = new mongoose.Schema({
  code: { type: String, trim: true },
  description: { type: String, trim: true },
  amount: { type: mongoose.Schema.Types.Decimal128, required: true }
}, { _id: false });

const salaryLineSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  employeeCode: { type: String, trim: true },
  employeeName: { type: String, trim: true },
  category: { type: String, enum: ['site_company_visa', 'site_mission_visa', 'office'] },
  workingDays: { type: Number, default: 0 },
  presentDays: { type: Number, default: 0 },
  absentDays: { type: Number, default: 0 },
  leaveDays: { type: Number, default: 0 },
  regularHours: { type: mongoose.Schema.Types.Decimal128, default: D0 },
  otHours: { type: mongoose.Schema.Types.Decimal128, default: D0 },
  basic: { type: mongoose.Schema.Types.Decimal128, default: D0 },
  housing: { type: mongoose.Schema.Types.Decimal128, default: D0 },
  transport: { type: mongoose.Schema.Types.Decimal128, default: D0 },
  otherAllowances: { type: mongoose.Schema.Types.Decimal128, default: D0 },
  otAmount: { type: mongoose.Schema.Types.Decimal128, default: D0 },
  grossPay: { type: mongoose.Schema.Types.Decimal128, default: D0 },
  deductions: [deductionSchema],
  totalDeductions: { type: mongoose.Schema.Types.Decimal128, default: D0 },
  netPay: { type: mongoose.Schema.Types.Decimal128, default: D0 },
  projectAllocations: [projectAllocationSchema]
}, { _id: true });

const varianceAlertSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'warning' },
  kind: { type: String, enum: ['YTD_EXCEEDED', 'FORECAST_EXCEEDED', 'MONTHLY_THRESHOLD'] },
  labourBudget: { type: mongoose.Schema.Types.Decimal128 },
  labourSpentYTD: { type: mongoose.Schema.Types.Decimal128 },
  forecastTotal: { type: mongoose.Schema.Types.Decimal128 },
  message: { type: String, trim: true }
}, { _id: true });

const salaryRunSchema = new mongoose.Schema({
  runNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  period: {
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true, min: 2020, max: 2100 }
  },
  status: {
    type: String,
    enum: ['draft', 'computed', 'approved', 'journalized', 'paid', 'cancelled'],
    default: 'draft',
    index: true
  },
  lines: [salaryLineSchema],
  totals: {
    employeeCount: { type: Number, default: 0 },
    grossPay: { type: mongoose.Schema.Types.Decimal128, default: D0 },
    totalDeductions: { type: mongoose.Schema.Types.Decimal128, default: D0 },
    netPay: { type: mongoose.Schema.Types.Decimal128, default: D0 },
    otAmount: { type: mongoose.Schema.Types.Decimal128, default: D0 }
  },
  budgetVarianceAlerts: [varianceAlertSchema],
  computedAt: { type: Date },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  journalEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry' },
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

salaryRunSchema.index({ 'period.year': 1, 'period.month': 1 }, { unique: true });
salaryRunSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('SalaryRun', salaryRunSchema);
