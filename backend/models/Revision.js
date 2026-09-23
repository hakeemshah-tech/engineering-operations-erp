const mongoose = require('mongoose');

const RevisionSchema = new mongoose.Schema({
  parentQuotation: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation', required: true },
  revisionNumber: { type: String, required: true },
  parentRevision: { type: mongoose.Schema.Types.ObjectId, ref: 'Revision' },

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

  scopeOfWork: { type: String },
  priceSchedule: { type: String },
  ourViewpoints: { type: String },
  exclusions: { type: String },
  paymentTerms: { type: String },

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
    logs: [
      {
        status: { type: String, enum: ['pending', 'approved', 'rejected'] },
        at: { type: Date, default: Date.now },
        requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: String
      }
    ]
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
  ,
  diffFromParent: [{
    field: { type: String, required: true },
    from: { type: mongoose.Schema.Types.Mixed },
    to: { type: mongoose.Schema.Types.Mixed }
  }]
}, { timestamps: true });

RevisionSchema.index({ parentQuotation: 1, revisionNumber: 1 }, { unique: true });

module.exports = mongoose.model('Revision', RevisionSchema);


