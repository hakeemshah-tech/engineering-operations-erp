const mongoose = require('mongoose');

const siteVisitSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  visitAt: { type: Date, required: true },
  siteLocation: { type: String, required: true },
  engineerName: { type: String, required: true },
  workProgressSummary: { type: String, required: true },
  safetyObservations: { type: String },
  qualityMaterialCheck: { type: String },
  issuesFound: { type: String },
  actionItems: { type: String },
  weatherConditions: { type: String },
  description: { type: String, required: true },
  attachments: [{
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    path: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now }
  }],
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
}, {
  timestamps: true
});

module.exports = mongoose.model('SiteVisit', siteVisitSchema);

