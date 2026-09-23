const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  action: { 
    type: String, 
    required: true,
      enum: [
      // Deletions
      'quotation_deleted', 'revision_deleted', 'project_variation_deleted', 'lead_deleted', 'project_deleted', 'site_visit_deleted',
      // Creations
      'quotation_created', 'revision_created', 'project_variation_created', 'lead_created', 'site_visit_created',
      // Updates
      'quotation_updated', 'revision_updated', 'project_variation_updated', 'lead_updated', 'site_visit_updated',
      // Approvals/Rejections
      'quotation_approved', 'quotation_rejected', 'quotation_approval_requested',
      'revision_approved', 'revision_rejected', 'revision_approval_requested',
      'project_variation_approved', 'project_variation_rejected', 'project_variation_approval_requested',
      // Status changes
      'lead_status_changed', 'project_status_changed',
      // Critical updates
      'project_created_from_revision', 'project_engineer_assigned', 'site_engineer_assigned'
    ]
  },
  entityType: { 
    type: String, 
    required: true,
      enum: ['quotation', 'revision', 'project_variation', 'lead', 'project', 'site_visit']
  },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  entityData: {
    // Store relevant data about the deleted entity
    offerReference: String,
    projectTitle: String,
    customerName: String,
    grandTotal: Number,
    currency: String,
    managementApprovalStatus: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: Date
  },
  // Use deletedBy/deletedAt for backward compatibility, but also support performedBy/performedAt
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletedAt: Date,
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // For non-deletion actions
  performedAt: Date, // For non-deletion actions
  reason: String, // Optional reason/note
  ipAddress: String, // Optional IP address
  userAgent: String, // Optional user agent
  // Additional fields for non-deletion actions
  oldValue: mongoose.Schema.Types.Mixed, // For status changes, etc.
  newValue: mongoose.Schema.Types.Mixed // For status changes, etc.
}, { timestamps: true });

// Index for efficient queries
AuditLogSchema.index({ action: 1, deletedAt: -1 });
AuditLogSchema.index({ action: 1, performedAt: -1 });
AuditLogSchema.index({ entityType: 1, entityId: 1 });
AuditLogSchema.index({ deletedBy: 1, deletedAt: -1 });
AuditLogSchema.index({ performedBy: 1, performedAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);

