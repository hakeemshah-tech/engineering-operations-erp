const mongoose = require('mongoose');

const materialRequestItemSchema = new mongoose.Schema({
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material'
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
  assignedQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  uom: {
    type: String,
    required: true,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  }
});

const materialRequestSchema = new mongoose.Schema({
  requestNumber: {
    type: String,
    unique: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  items: [materialRequestItemSchema],
  status: {
    type: String,
    enum: ['pending', 'fulfilled', 'received', 'cancelled'],
    default: 'pending'
  },
  requestType: {
    type: String,
    enum: ['request', 'return', 'remaining_return'],
    default: 'request'
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  requiredDate: {
    type: Date
  },
  purpose: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  },
  // Requester information
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  requesterName: {
    type: String,
    trim: true
  },
  requesterEmail: {
    type: String,
    trim: true
  },
  requesterPhone: {
    type: String,
    trim: true
  },
  // Approval workflow
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: {
    type: Date
  },
  reviewNotes: {
    type: String,
    trim: true
  },
  // Fulfillment tracking
  fulfilledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  fulfilledAt: {
    type: Date
  },
  fulfillmentNotes: {
    type: String,
    trim: true
  },
  // Received tracking
  receivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  receivedAt: {
    type: Date
  },
  receivedNotes: {
    type: String,
    trim: true
  },
  // Delivery Note
  deliveryNote: {
    deliveryDate: {
      type: Date
    },
    deliveryPersonName: {
      type: String,
      trim: true
    },
    deliveryPersonContact: {
      type: String,
      trim: true
    },
    vehicleNumber: {
      type: String,
      trim: true
    },
    materialCondition: {
      type: String,
      enum: ['excellent', 'good', 'acceptable', 'damaged', 'partially_damaged'],
      default: 'good'
    },
    conditionNotes: {
      type: String,
      trim: true
    },
    receivedItems: [{
      materialName: String,
      requestedQuantity: Number,
      receivedQuantity: Number,
      uom: String,
      remarks: String
    }],
    receiverSignatureName: {
      type: String,
      trim: true
    },
    acknowledgmentNotes: {
      type: String,
      trim: true
    }
  }
}, {
  timestamps: true
});

// Auto-generate request number
materialRequestSchema.pre('save', async function(next) {
  if (!this.requestNumber) {
    const count = await this.constructor.countDocuments();
    this.requestNumber = `MR-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

// Indexes
materialRequestSchema.index({ projectId: 1 });
materialRequestSchema.index({ requestedBy: 1 });
materialRequestSchema.index({ status: 1 });
materialRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model('MaterialRequest', materialRequestSchema);
