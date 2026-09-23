const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  sku: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  uom: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: ['project_specific', 'staff_specific'],
    required: true
  },
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true
  },
  quantity: {
    type: Number,
    default: 0,
    min: 0
  },
  minStockLevel: {
    type: Number,
    default: 0,
    min: 0
  },
  description: {
    type: String,
    trim: true
  },
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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

// Compound unique index: SKU must be unique within each store
materialSchema.index({ sku: 1, storeId: 1 }, { unique: true });

// Index for faster filtering
materialSchema.index({ storeId: 1 });
materialSchema.index({ category: 1 });
materialSchema.index({ brand: 1 });
// Prevent same material name from being assigned the same brand twice (sparse = skips null brand)
materialSchema.index({ name: 1, brand: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Material', materialSchema);
