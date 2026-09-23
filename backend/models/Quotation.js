const mongoose = require('mongoose');

const QuotationSchema = new mongoose.Schema({
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
}, { timestamps: true });

module.exports = mongoose.model('Quotation', QuotationSchema);


