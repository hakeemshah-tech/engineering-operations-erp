const mongoose = require('mongoose');

const approvalStepSchema = new mongoose.Schema({
  approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  role: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  actedAt: Date,
  comments: String
});

const attachmentSchema = new mongoose.Schema({
  filename: String,
  originalName: String,
  path: String,
  mimetype: String,
  size: Number,
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const leaveRequestSchema = new mongoose.Schema({
  requestNumber: { type: String, unique: true, trim: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },

  leaveType: {
    type: String,
    enum: ['annual', 'sick', 'unpaid', 'emergency', 'maternity', 'paternity', 'other'],
    required: true
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  totalDays: Number,
  // Half-day support - when true AND startDate === endDate, totalDays is
  // computed as 0.5 instead of 1. `halfDayPeriod` indicates which half
  // for HR/payroll reporting.
  halfDay: { type: Boolean, default: false },
  halfDayPeriod: { type: String, enum: ['first', 'second'], default: undefined },
  reason: String,

  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending'
  },
  approvalChain: [approvalStepSchema],

  attachments: [attachmentSchema],

  // Multi-step reversal flow for already-approved leaves. We do NOT allow a
  // single user to instantly flip an approved leave to cancelled - the same
  // chain (HR + Manager) must re-approve the reversal. While the reversal is
  // pending the parent request stays status='approved' so attendance rows
  // remain marked; on full reversal-approval status flips to 'cancelled' and
  // syncAttendanceForLeaveCancel runs.
  reversal: {
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    requestedAt: Date,
    reason: String,
    status: { type: String, enum: ['pending', 'approved', 'rejected'] },
    completedAt: Date,
    approvalChain: [approvalStepSchema]
  },

  appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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

leaveRequestSchema.index({ employee: 1, status: 1 });
leaveRequestSchema.index({ startDate: 1, endDate: 1 });
leaveRequestSchema.index({ status: 1, createdAt: -1 });

leaveRequestSchema.pre('save', async function (next) {
  try {
    if (!this.requestNumber) {
      const count = await mongoose.model('LeaveRequest').countDocuments();
      this.requestNumber = `LR-${String(count + 1).padStart(5, '0')}`;
    }
    if (this.startDate && this.endDate) {
      const msPerDay = 24 * 60 * 60 * 1000;
      const days = Math.floor((new Date(this.endDate) - new Date(this.startDate)) / msPerDay) + 1;
      this.totalDays = days > 0 ? days : 0;
      // Half-day only applies to single-day leaves. Force halfDay off when
      // the range covers multiple days and surface 0.5 instead of 1 day.
      if (this.halfDay && this.totalDays === 1) {
        this.totalDays = 0.5;
      } else {
        this.halfDay = false;
        this.halfDayPeriod = undefined;
      }
    }
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
