const mongoose = require('mongoose');

const purchaseRequestItemSchema = new mongoose.Schema({
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: true
  },
  materialName: {
    type: String,
    required: true,
    trim: true
  },
  sku: {
    type: String,
    trim: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  uom: {
    type: String,
    required: true,
    trim: true
  },
  unitPrice: {
    type: Number,
    default: 0,
    min: 0
  },
  notes: {
    type: String,
    trim: true
  }
});

const purchaseRequestSchema = new mongoose.Schema({
  requestNumber: {
    type: String,
    unique: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier'
  },
  supplier: {
    name: { type: String, trim: true },
    contactPerson: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true },
    address: { type: String, trim: true }
  },
  items: [purchaseRequestItemSchema],
  status: {
    type: String,
    enum: ['draft', 'pending', 'approved', 'rejected', 'fulfilled', 'received', 'cancelled'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  deliveryDate: {
    type: Date
  },
  notes: {
    type: String,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,
  reviewNotes: String,
  fulfilledAt: Date,
  fulfilledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  fulfillmentDetails: [{
    materialId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Material'
    },
    requestedQty: Number,
    deliveredQty: Number
  }],
  // GRN (Goods Receipt Note) fields
  receivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  receivedAt: Date,
  receivedItems: [{
    materialId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Material'
    },
    deliveredQty: Number,
    receivedQty: Number,
    condition: {
      type: String,
      enum: ['good', 'damaged', 'partial'],
      default: 'good'
    },
    remarks: String
  }],
  grnNumber: String,
  grnNotes: String,
  // Enhanced GRN delivery info
  grnDeliveryDate: Date,
  grnDeliveryPersonName: String,
  grnDeliveryPersonContact: String,
  grnVehicleNumber: String,
  grnOverallCondition: {
    type: String,
    enum: ['good', 'damaged', 'partial'],
    default: 'good'
  },
  grnConditionNotes: String,
  grnReceiverName: String,
  grnAcknowledgmentNotes: String
}, {
  timestamps: true
});

// Auto-generate request number
purchaseRequestSchema.pre('save', async function(next) {
  if (!this.requestNumber) {
    const count = await mongoose.model('PurchaseRequest').countDocuments();
    this.requestNumber = `PR-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

module.exports = mongoose.model('PurchaseRequest', purchaseRequestSchema);
