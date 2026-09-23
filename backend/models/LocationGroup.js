const mongoose = require('mongoose');

// Same audit shape used across the codebase (Attendance, Employee, Project, Location).
const editSchema = new mongoose.Schema({
  editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  editedAt: { type: Date, default: Date.now },
  changes: [{
    field: { type: String, required: true },
    from: { type: mongoose.Schema.Types.Mixed },
    to: { type: mongoose.Schema.Types.Mixed }
  }]
}, { _id: false });

/**
 * A LocationGroup is an admin-curated bag of Location IDs an employee can be
 * "assigned to" instead of a single Location. The Attendance v3 punch-context
 * expands every member of the group into a candidate at request time, so:
 *
 *   - HR creates one group ("All UAE Offices") with 3 office locations
 *   - 200 employees get assigned to that group, not to specific offices
 *   - Adding a new office = updating the group → every member inherits
 *
 * Same hierarchy lock semantics as Location: lockedByRoleWeight tracks who
 * last edited, and canOverwrite() gates writes by lower-ranked roles.
 */
const locationGroupSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  description: { type: String, trim: true },

  // Informational only - drives icon choice in the UI. Set to 'mixed' if the
  // group spans multiple Location.type values.
  type: {
    type: String,
    enum: ['office', 'site', 'remote', 'mixed'],
    default: 'mixed'
  },

  // Member locations. Server expands these at punch-context time.
  locationIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Location' }],

  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },

  lockedByRoleWeight: { type: Number, default: 0 },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  edits: [editSchema]
}, { timestamps: true });

locationGroupSchema.index({ status: 1, type: 1 });
locationGroupSchema.index({ name: 1 });

module.exports = mongoose.model('LocationGroup', locationGroupSchema);
