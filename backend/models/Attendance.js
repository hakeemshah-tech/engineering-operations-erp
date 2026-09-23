const mongoose = require('mongoose');

const projectAllocationSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  projectName: String,
  hours: { type: Number, required: true, min: 0 },
  notes: String
});

// Multi-log sub-doc for Attendance v2 - every punch in/out pair is one entry.
// referenceModel + referenceId together form a polymorphic ref:
//   type='Project' → references a Project (siteLocationId is the geofence anchor)
//   type='Office'  → references a Location directly (office shift)
//   type='Travel'  → reference is informational; no geofence check on punch
//
// While `timeOut === null` the log is "open" and triggers the Geofence Trap:
// no new punch-in is allowed until this log is closed.
const timeLogSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Project', 'Office', 'Travel'],
    required: true
  },
  referenceModel: {
    type: String,
    enum: ['Project', 'Location'],
    required: true
  },
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'timeLogs.referenceModel'
  },

  timeIn:  { type: Date, required: true },
  timeOut: { type: Date, default: null },

  // Captured separately so a missing punch-out can be forensically explained
  // ("they were here at IN, somewhere else at OUT, never closed the log").
  inCoordinates: {
    lat: Number, lng: Number, accuracyMeters: Number, capturedAt: Date
  },
  outCoordinates: {
    lat: Number, lng: Number, accuracyMeters: Number, capturedAt: Date
  },

  inSelfieUrl:  String,   // /uploads/attendance/<YYYY-MM>/...
  outSelfieUrl: String,

  // Office IP-lock audit (only filled when type='Office')
  inIpAddress:  String,
  outIpAddress: String,

  // Distance from the geofence center at each punch (audit only)
  inDistanceMeters:  Number,
  outDistanceMeters: Number,

  notes: String
}, { _id: true, timestamps: false });

const attendanceSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  date: { type: Date, required: true },
  source: { type: String, enum: ['site', 'office'], required: true },
  status: {
    type: String,
    enum: ['not_marked', 'present', 'late', 'absent', 'leave', 'half_day', 'holiday', 'weekend'],
    default: 'not_marked'
  },

  timeIn: Date,
  timeOut: Date,
  breakMinutes: { type: Number, default: 0 },
  regularHours: { type: Number, default: 0 },
  otHours: { type: Number, default: 0 },

  projectAllocations: [projectAllocationSchema],

  // Multi-log timeline. Authoritative source of truth for v2 attendance math.
  // Root timeIn/timeOut/regularHours/otHours/breakMinutes are derived projections
  // recomputed by recomputeFromTimeLogs() in server/utils/attendanceMath.js
  // whenever a log is closed (punch-out OR supervisor manual save).
  timeLogs: [timeLogSchema],

  entryMethod: {
    type: String,
    enum: ['manual', 'biometric', 'mobile_app', 'web', 'GPS_PUNCH', 'MANUAL_ENTRY', 'AUTO_SWEEP'],
    default: 'manual'
  },
  supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: String,

  // Who physically performed the action (self for GPS_PUNCH, supervisor for MANUAL_ENTRY).
  // Distinct from createdBy (the first inserter). Optional so legacy rows pass validation.
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Captured GPS coordinates of the punch (when entryMethod = GPS_PUNCH).
  punchLocation: {
    lat: { type: Number },
    lng: { type: Number },
    accuracyMeters: { type: Number },
    capturedAt: { type: Date }
  },

  // The Location used as the geofence anchor at punch time
  // (project siteLocationId override, falling back to employee baseLocationId).
  effectiveLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location' },

  // Distance in meters between punchLocation and effectiveLocation (audit trail).
  distanceMeters: { type: Number },

  // Attendance v3 - minutes past schedule start time at first punch-in.
  // Negative = early, 0 = on time, positive = late. Only stamped when
  // SystemSettings.attendance.autoClassifyLate is true. Used by the
  // grid tooltip and the cron to derive 'late' status.
  lateMinutes: { type: Number },

  // Attendance v3 - set by recomputeFromTimeLogs when the longest closed
  // log exceeds breakSkippedThresholdHours AND no real break gap exists.
  // Audit/HR signal that the worker very likely worked through lunch
  // without punching out. Independent of autoDeductLunch - even when the
  // deduction silently fixed payroll, this flag still records the
  // behaviour pattern so HR can address it.
  breakSkipped: { type: Boolean, default: false },

  // Attendance v3 - set when at least one of this row's punches was
  // accepted with low GPS confidence (accuracy > maxPunchAccuracyMeters)
  // because the admin enabled `allowApproximatePunch`. HR sees a small
  // flag in the grid so they know the location proof on this row is
  // weaker than usual.
  approximate: { type: Boolean, default: false },

  // Attendance v3 - back-reference for rows auto-created by an approved
  // LeaveRequest. Set only when status='leave'. Cleared when the request
  // is cancelled so the cron can re-derive status.
  leaveRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequest' },

  lockedByRoleWeight: { type: Number, default: 0 },

  // Optional because the nightly auto-status sweep creates rows with no
  // human creator (entryMethod='AUTO_SWEEP'). Every other code path still
  // populates this from req.user.userId.
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  edits: [{
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    editedAt: { type: Date, default: Date.now },
    // Free-text justification supplied by the supervisor when overriding /
    // manual-editing an attendance row. Captured by TimeLogsModal in the UI
    // and required for any change that creates or modifies a time log.
    reason: { type: String, trim: true, maxlength: 500 },
    changes: [{
      field: { type: String, required: true },
      from: { type: mongoose.Schema.Types.Mixed },
      to: { type: mongoose.Schema.Types.Mixed }
    }]
  }]
}, { timestamps: true });

attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1, source: 1 });
attendanceSchema.index({ 'projectAllocations.projectId': 1 });
attendanceSchema.index({ supervisor: 1, date: -1 });
attendanceSchema.index({ markedBy: 1, date: -1 });
// Used by the Geofence Trap check and the supervisor "open logs" report.
attendanceSchema.index({ 'timeLogs.timeOut': 1, 'timeLogs.timeIn': 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
