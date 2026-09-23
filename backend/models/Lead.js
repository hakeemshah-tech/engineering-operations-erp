const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  // New fields for sales/estimation engineers
  customerName: {
    type: String
  },
  projectTitle: {
    type: String
  },
  enquiryNumber: {
    type: String
  },
  enquiryDate: {
    type: Date
  },
  scopeSummary: {
    type: String
  },
  submissionDueDate: {
    type: Date
  },
  attachments: [{
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    path: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now }
  }],
  name: {
    type: String
  },
  budget: {
    type: Number
  },
  locationDetails: {
    type: String
  },
  workingHours: {
    type: String
  },
  manpowerCount: {
    type: Number
  },
  status: {
    type: String,
    enum: ['draft', 'submitted', 'approved', 'rejected', 'converted'],
    default: 'draft'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
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

module.exports = mongoose.model('Lead', leadSchema);