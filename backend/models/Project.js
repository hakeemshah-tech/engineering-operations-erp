const mongoose = require('mongoose');

const revisionSchema = new mongoose.Schema({
  version: { type: Number, required: true },
  type: { type: String, enum: ['price', 'management'], required: true },
  description: String,
  changes: mongoose.Schema.Types.Mixed,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  comments: String
}, { timestamps: true });

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  budget: Number,
  locationDetails: { type: String, required: true },
  // Geofenced site location. When set and project is active, this overrides the
  // employee's baseLocationId during GPS punch validation. Optional.
  siteLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location' },
  workingHours: String,
  manpowerCount: Number,
  totalBudgetedManHours: Number,
  labourBudgetAmount: Number,
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  assignedSiteEngineer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedProjectEngineer: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  supervisors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  workers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status: { type: String, enum: ['active', 'completed', 'on_hold'], default: 'active' },
  revisions: [revisionSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sourceRevision: { type: mongoose.Schema.Types.ObjectId, ref: 'Revision' },
  sourceQuotation: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
  attachments: [{
    filename: String,
    originalName: String,
    path: String,
    mimetype: String,
    size: Number
  }],
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

projectSchema.index({ supervisors: 1 });
projectSchema.index({ workers: 1 });
projectSchema.index({ siteLocationId: 1 });

module.exports = mongoose.model('Project', projectSchema);