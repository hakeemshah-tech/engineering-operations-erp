const mongoose = require('mongoose');

const hrAlertSchema = new mongoose.Schema({
  alertType: {
    type: String,
    enum: ['document_expiry', 'budget_overrun', 'probation_ending', 'contract_ending'],
    required: true
  },
  severity: {
    type: String,
    enum: ['info', 'warning', 'critical'],
    default: 'info'
  },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  relatedDocument: String,
  daysUntilEvent: Number,
  message: String,
  status: {
    type: String,
    enum: ['open', 'acknowledged', 'resolved', 'dismissed'],
    default: 'open'
  },
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  acknowledgedAt: Date,
  dismissedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dismissedAt: Date
}, { timestamps: true });

hrAlertSchema.index({ status: 1, severity: 1 });
hrAlertSchema.index({ employee: 1, alertType: 1, relatedDocument: 1, status: 1 });
hrAlertSchema.index({ alertType: 1 });
hrAlertSchema.index({ createdAt: -1 });

module.exports = mongoose.model('HRAlert', hrAlertSchema);
