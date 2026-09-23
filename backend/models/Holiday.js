const mongoose = require('mongoose');

/**
 * Holiday - a single calendar entry that blocks/marks attendance for a
 * scoped population. Resolution is intentionally simple:
 *
 *   scope = 'all'    → applies to every employee
 *   scope = 'office' → applies to employees with category='office'
 *   scope = 'site'   → applies to employees whose category starts with 'site_'
 *
 * Project / Location / Group / Employee scopes are deliberately NOT
 * supported in v1 - the three buckets above cover the practical cases
 * (national holiday, office-only closure, site-only shutdown).
 *
 * `recurringYearly` lets one document cover every year on that month/day.
 * The resolver matches month+day when this is true, ignoring the year.
 */
const holidaySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },

  // Stored as midnight UTC on the holiday's calendar date. The resolver
  // compares year/month/day directly so timezone drift doesn't matter
  // for typical org use.
  date: { type: Date, required: true },

  scope: {
    type: String,
    enum: ['all', 'office', 'site'],
    default: 'all',
    required: true
  },

  recurringYearly: { type: Boolean, default: false },

  // Whether this counts as a paid day off for payroll. Stored for the
  // payroll computation; the punch endpoint doesn't read it.
  paid: { type: Boolean, default: true },

  // Optional notes (e.g. "Half day after 14:00").
  notes: { type: String, trim: true },

  // Where this came from. Useful when a yearly preset import dumps many
  // rows; admins can purge by source.
  source: { type: String, enum: ['manual', 'preset'], default: 'manual' },
  presetKey: { type: String, trim: true },          // e.g. 'uae-2026'

  // Standard hierarchy lock - same pattern as Location/Attendance.
  lockedByRoleWeight: { type: Number, default: 0 },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  edits: [{
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    editedAt: { type: Date, default: Date.now },
    changes: [{
      field: { type: String, required: true },
      from:  { type: mongoose.Schema.Types.Mixed },
      to:    { type: mongoose.Schema.Types.Mixed }
    }]
  }]
}, { timestamps: true });

holidaySchema.index({ date: 1, scope: 1 });
holidaySchema.index({ recurringYearly: 1, scope: 1 });
holidaySchema.index({ presetKey: 1 });

module.exports = mongoose.model('Holiday', holidaySchema);
