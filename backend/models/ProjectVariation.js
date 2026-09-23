const mongoose = require('mongoose');

const ProjectVariationSchema = new mongoose.Schema({
  parentProject: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  variationNumber: { type: String, required: true },
  parentVariation: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectVariation' },

  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  companyInfo: {
    logo: { type: String },
    name: { type: String },
    address: { type: String },
    phone: { type: String },
    email: { type: String }
  },
  submittedTo: { type: String },
  attention: { type: String },
  offerReference: { type: String },
  enquiryNumber: { type: String },
  offerDate: { type: Date },
  enquiryDate: { type: Date },
  projectTitle: { type: String },
  introductionText: { type: String },

  // Rich text editor outputs (store full HTML strings)
  scopeOfWork: { type: String }, // full HTML string

  priceSchedule: { type: String }, // full HTML string for price schedule content

  ourViewpoints: { type: String },
  exclusions: { type: String }, // full HTML string (list/body)

  paymentTerms: { type: String }, // full HTML string

  deliveryCompletionWarrantyValidity: {
    deliveryTimeline: String,
    warrantyPeriod: String,
    offerValidity: Number,
    authorizedSignatory: String
  },

  managementApproval: {
    status: { type: String, enum: ['pending', 'approved', 'rejected'] },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    comments: String,
    logs: [{
      status: { type: String, enum: ['pending', 'approved', 'rejected'] },
      at: { type: Date, default: Date.now },
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      note: String
    }]
  },

  edits: [{
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    editedAt: { type: Date, default: Date.now },
    changes: [{
      field: { type: String, required: true },
      from: { type: mongoose.Schema.Types.Mixed },
      to: { type: mongoose.Schema.Types.Mixed }
    }]
  }],

  diffFromParent: [{
    field: { type: String, required: true },
    from: { type: mongoose.Schema.Types.Mixed },
    to: { type: mongoose.Schema.Types.Mixed }
  }],

  attachments: [{
    filename: String,
    originalName: String,
    path: String,
    mimetype: String,
    size: Number
  }]
}, {
  timestamps: true
});

ProjectVariationSchema.index({ parentProject: 1, variationNumber: 1 }, { unique: true });

module.exports = mongoose.model('ProjectVariation', ProjectVariationSchema);

