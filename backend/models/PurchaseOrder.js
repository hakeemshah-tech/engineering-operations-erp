const mongoose = require('mongoose');

// Each PO item tracks which PR items it was sourced from
const poSourceItemSchema = new mongoose.Schema({
  requestItemId: {
    type: mongoose.Schema.Types.ObjectId
  },
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material'
  },
  materialName: String,
  sku: String,
  uom: String,
  prQuantity: Number,       // original PR quantity
  allocatedQty: Number      // qty allocated to this PO
});

const poSourceSchema = new mongoose.Schema({
  requestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseRequest',
    required: true
  },
  requestNumber: String,
  items: [poSourceItemSchema]
});

// Service PO item schema (for manpower, subcontracting, machine rental)
const serviceItemSchema = new mongoose.Schema({
  description: {
    type: String,
    required: true,
    trim: true
  },
  rate: {
    type: Number,
    default: 0,
    min: 0
  },
  rateType: {
    type: String,
    enum: ['hourly', 'daily', 'monthly', 'per_item', 'lump_sum']
  },
  quantity: {
    type: Number,
    default: 1,
    min: 1
  },
  duration: {
    type: Number,
    default: 1,
    min: 1
  },
  machineType: {
    type: String,
    trim: true
  },
  totalPrice: {
    type: Number,
    default: 0,
    min: 0
  },
  notes: {
    type: String,
    trim: true
  }
});

// Other PO item schema - flexible items for any service/product (not standard categories)
const otherItemSchema = new mongoose.Schema({
  // Core required fields
  description: {
    type: String,
    required: true,
    trim: true
  },
  quantity: {
    type: Number,
    default: 1,
    min: 0.01
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },

  // Flexible rate type (optional, for services)
  rateType: {
    type: String,
    enum: ['hourly', 'daily', 'monthly', 'per_item', 'lump_sum', 'fixed'],
    default: 'fixed'
  },
  duration: {
    type: Number,
    default: 1
  }, // Multiplier for time-based rates

  // Item-level tax & discount
  taxType: {
    type: String,
    enum: ['percentage', 'amount'],
    default: 'percentage'
  },
  taxRate: {
    type: Number,
    default: 0
  }, // % or flat amount

  discountType: {
    type: String,
    enum: ['percentage', 'amount'],
    default: 'percentage'
  },
  discountRate: {
    type: Number,
    default: 0
  }, // % or flat amount

  // Auto-calculated: (quantity × unitPrice × duration) + tax - discount
  lineTotal: {
    type: Number,
    default: 0
  },

  // Compliance & tracking
  hsn: String, // HSN/SAC code for tax classification
  accountHead: String, // Expense category (e.g., "IT-001", "MAINT-005")

  // Timeline (optional, for service contracts or deliverables)
  startDate: Date,
  endDate: Date,

  // Notes
  notes: {
    type: String,
    trim: true
  }
});
const paymentRequestSchema = new mongoose.Schema({
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  amount: {
    type: Number,
    default: 0,
    min: 0
  },
  paymentType: {
    type: String,
    enum: ['advance', 'final', 'full']
  },
  notes: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'processed'],
    default: 'pending'
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  processedAt: Date,
  processNotes: {
    type: String,
    trim: true
  }
});

const purchaseOrderItemSchema = new mongoose.Schema({
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
  uom: {
    type: String,
    required: true,
    trim: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  unitPrice: {
    type: Number,
    default: 0,
    min: 0
  },
  totalPrice: {
    type: Number,
    default: 0,
    min: 0
  },
  notes: {
    type: String,
    trim: true
  }
});

const auditEntrySchema = new mongoose.Schema({
  action: {
    type: String,
    required: true
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  performedAt: {
    type: Date,
    default: Date.now
  },
  notes: String,
  revision: Number,
  details: mongoose.Schema.Types.Mixed
});

const revisionEntrySchema = new mongoose.Schema({
  revision: Number,
  reason: String,
  revisedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  revisedAt: {
    type: Date,
    default: Date.now
  }
});

const purchaseOrderSchema = new mongoose.Schema({
  poNumber: {
    type: String,
    unique: true
  },

  // PO Type: material (default) or service types
  poType: {
    type: String,
    enum: ['material', 'manpower', 'subcontracting', 'machine_rental', 'other'],
    default: 'material'
  },

  // Source PRs (many-to-many linkage) - material POs only
  sourceRequests: [poSourceSchema],

  // Consolidated PO items - material POs only
  items: [purchaseOrderItemSchema],

  // Service items - service POs only
  serviceItems: [serviceItemSchema],

  // Other items - flexible POs for any service/product not fitting standard categories
  otherItems: [otherItemSchema],
  vatPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  
  // Supplier info
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
  
  status: {
    type: String,
    enum: [
      'draft',              // PE creating/editing
      'pending_am',         // awaiting Account Manager approval
      'pending_gm',         // awaiting General Manager approval
      'approved',           // both approved
      'rejected',           // rejected by AM or GM
      'sent_to_supplier',   // locked, sent to supplier
      'fulfilled',          // supplier delivered items / service completed
      'received',           // GRN submitted by IM (material POs only)
      'confirmed',          // PE confirmed after GRN (material POs only)
      'payment_requested',  // PE sent final payment request to accounts
      'payment_completed',  // accounts processed final payment
      'cancelled'
    ],
    default: 'draft'
  },
  
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  
  deliveryDate: Date,
  notes: { type: String, trim: true },
  
  // Revision control
  revision: {
    type: Number,
    default: 1
  },
  lockedForEditing: {
    type: Boolean,
    default: false
  },
  
  // Dual approval
  approvals: {
    accountManager: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      approvedAt: Date,
      notes: String
    },
    generalManager: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      approvedAt: Date,
      notes: String
    }
  },
  
  // Audit trail (for timeline UI)
  auditTrail: [auditEntrySchema],
  
  // Revision history
  revisionHistory: [revisionEntrySchema],
  
  // GRN fields
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
    orderedQty: Number,
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
  grnAcknowledgmentNotes: String,
  
  // Fulfillment (PE records supplier delivery)
  fulfilledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  fulfilledAt: Date,
  fulfillmentDetails: [{
    materialId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Material'
    },
    orderedQty: Number,
    deliveredQty: Number
  }],
  
  // Payment terms
  paymentTerms: {
    type: {
      type: String,
      enum: ['full_advance', 'partial_advance', 'full_after_completion'],
      default: 'full_after_completion'
    },
    advancePercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    notes: {
      type: String,
      trim: true
    }
  },

  // Annexure (rich text HTML content)
  annexure: {
    type: String,
    default: ''
  },

  // PO-level tax & discount (for Other POs)
  taxType: {
    type: String,
    enum: ['percentage', 'amount'],
    default: 'percentage'
  },
  taxRate: {
    type: Number,
    default: 0
  }, // % or flat amount, applied to subtotal

  discountType: {
    type: String,
    enum: ['percentage', 'amount'],
    default: 'percentage'
  },
  discountRate: {
    type: Number,
    default: 0
  }, // % or flat amount, applied to subtotal

  // Accounting details (mostly for Other POs)
  accountingDetails: {
    overallAccountHead: String, // Single account head for entire PO (optional)
    costCenter: String // Cost center code (optional)
  },

  // Timeline (mostly for service/other POs)
  timelineStart: Date, // Contract start
  timelineEnd: Date, // Contract end

  // Service PO completion
  completionDocType: {
    type: String,
    enum: ['timesheet', 'work_completion_report', 'machine_hire_sheet']
  },
  completionAttachments: [{
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    path: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],

  // Payment requests (supports multiple: advance + final)
  paymentRequests: [paymentRequestSchema],

  // Confirmed after GRN
  confirmedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  confirmedAt: Date,
  
  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },

  // Attachments
  attachments: [{
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    path: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],

  // Edit history (for tracking changes including attachments)
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

// Auto-generate PO number
purchaseOrderSchema.pre('save', async function(next) {
  if (!this.poNumber) {
    const count = await mongoose.model('PurchaseOrder').countDocuments();
    this.poNumber = `PO-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

// Index for faster queries
purchaseOrderSchema.index({ status: 1 });
purchaseOrderSchema.index({ createdBy: 1 });
purchaseOrderSchema.index({ poType: 1 });
purchaseOrderSchema.index({ 'sourceRequests.requestId': 1 });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
