const mongoose = require('mongoose');

const GeneralAuditLogSchema = new mongoose.Schema({
  action: { 
    type: String, 
    required: true,
    enum: [
      // Authentication
      'user_login', 'user_logout', 'login_failed',
      // User Management
      'user_created', 'user_updated', 'user_deleted', 'user_activated', 'user_deactivated',
      'user_role_assigned', 'user_role_removed', 'user_password_changed',
      'password_changed', 'password_reset_requested', 'password_reset_approved',
      'employee_user_provisioned', 'user_deactivated_by_employee_status',
      // Role Management
      'role_created', 'role_updated', 'role_deleted',
      // Lead Management
      'lead_created', 'lead_updated', 'lead_status_changed',
      // Quotation Management
      'quotation_created', 'quotation_updated',
      // Revision Management
      'revision_created', 'revision_updated',
      // Project Management
      'project_created', 'project_updated',
      // Project Variation Management
      'project_variation_created', 'project_variation_updated',
      // Site Visit Management
      'site_visit_created', 'site_visit_updated', 'site_visit_deleted',
      // HR Management
      'employee_created', 'employee_updated', 'employee_deleted',
      'document_uploaded', 'document_deleted',
      'checklist_item_toggled', 'workflow_stage_advanced', 'workflow_stage_reverted',
      'attendance_submitted', 'attendance_updated',
      'attendance_punched_in', 'attendance_punched_out',
      'leave_requested', 'leave_approved', 'leave_rejected', 'leave_cancelled',
      'offboarding_initiated', 'offboarding_finalized',
      'gratuity_calculated', 'experience_certificate_generated',
      'clearance_item_toggled',
      'document_expiry_alert', 'budget_overrun_alert',
      'hr_alert_acknowledged', 'hr_alert_dismissed',
      'location_created', 'location_updated', 'location_deleted',
      'location_group_created', 'location_group_updated', 'location_group_deleted',
      'employee_bulk_location_assigned',
      // System
      'system_config_changed', 'permission_changed', 'data_exported', 'data_imported'
    ]
  },
  module: {
    type: String,
    required: true,
    enum: ['authentication', 'user_management', 'role_management', 'lead_management',
           'quotation_management', 'revision_management', 'project_management',
           'project_variation_management', 'site_visit_management', 'hr_management', 'system']
  },
  entityType: String, // e.g., 'user', 'role', 'lead', 'quotation', etc.
  entityId: mongoose.Schema.Types.ObjectId,
  entityName: String, // Human-readable name for the entity
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  performedAt: { type: Date, default: Date.now },
  description: String, // Human-readable description of the action
  details: mongoose.Schema.Types.Mixed, // Additional context/data
  ipAddress: String,
  userAgent: String,
  success: { type: Boolean, default: true }, // Whether the action was successful
  errorMessage: String // If action failed, store error message
}, { timestamps: true });

// Indexes for efficient queries
GeneralAuditLogSchema.index({ action: 1, performedAt: -1 });
GeneralAuditLogSchema.index({ module: 1, performedAt: -1 });
GeneralAuditLogSchema.index({ entityType: 1, entityId: 1 });
GeneralAuditLogSchema.index({ performedBy: 1, performedAt: -1 });
GeneralAuditLogSchema.index({ performedAt: -1 });

module.exports = mongoose.model('GeneralAuditLog', GeneralAuditLogSchema);

