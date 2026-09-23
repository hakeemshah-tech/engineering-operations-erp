const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
  // Inventory Settings
  inventory: {
    storeCreationEnabled: {
      type: Boolean,
      default: true
    }
  },
  // Accounts module settings - tolerances + OT multipliers.
  // Read by threeWayMatch.js and salaryCompute.js with hardcoded fallbacks.
  accounts: {
    price3WayTolerancePct: { type: Number, default: 2, min: 0, max: 100 },
    qty3WayToleranceAbs:   { type: Number, default: 0, min: 0 },
    vat3WayTolerancePct:   { type: Number, default: 2, min: 0, max: 100 },
    otWeekdayMultiplier:   { type: Number, default: 1.25, min: 1 },
    otRestDayMultiplier:   { type: Number, default: 1.50, min: 1 },
    workingHoursPerDay:    { type: Number, default: 8, min: 1, max: 24 },

    // PO type → default expense ledger mapping. The Account Manager configures
    // this from the Chart of Accounts screen so the correct ChartOfAccounts is
    // auto-selected for each PO type during PO creation (except 'other', which
    // is chosen per-item at creation). Each value is a ChartOfAccounts CODE
    // (e.g. '5100-COGS-MATERIALS'); an empty string falls back to the hardcoded
    // PO_TYPE_DEFAULT_CODE in expenseAccountResolver.js.
    poTypeAccountMap: {
      material:       { type: String, default: '', trim: true, uppercase: true },
      manpower:       { type: String, default: '', trim: true, uppercase: true },
      subcontracting: { type: String, default: '', trim: true, uppercase: true },
      machine_rental: { type: String, default: '', trim: true, uppercase: true },
      other:          { type: String, default: '', trim: true, uppercase: true }
    }
  },
  // Attendance v2 - multi-log + geofence + selfie + office IP lock.
  // Read by /api/attendance/punch and the manual-entry handlers; falls back to
  // hard defaults if the singleton hasn't been initialised yet.
  attendance: {
    // Master switch for the Office-employee IP Lock. Defaults to FALSE so the
    // feature ships disabled - protecting the org from accidental lockouts.
    // The admin must explicitly enable it from the Settings UI after adding
    // at least one office or remote network entry.
    ipLockEnabled: { type: Boolean, default: false },

    // Office Wi-Fi public IP whitelist. Accepts single IPs ("203.0.113.45")
    // and CIDR blocks ("203.0.113.0/24").
    allowedOfficeNetworks: { type: [String], default: [] },

    // Remote / work-from-home allowlist with metadata so admins can audit:
    //   { cidr: "102.45.78.12", label: "Ahmad - home", userId: ObjectId }
    // The optional userId links the entry to a specific employee so the admin
    // can remove it cleanly when that employee leaves or moves.
    allowedRemoteNetworks: {
      type: [{
        cidr:    { type: String, required: true, trim: true },
        label:   { type: String, trim: true },
        userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        addedAt: { type: Date, default: Date.now },
        addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
      }],
      default: []
    },

    // User exemptions - fully bypass the IP Lock for these users (still must
    // provide a valid selfie). Useful for consultants, mobile-only employees,
    // travelling sales staff, etc.
    ipLockExemptUserIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: []
    },

    // Selfie capture requirements (mobile PunchWidget compresses on the client;
    // server re-validates the final byte count for safety).
    selfieRequired:  { type: Boolean, default: true },
    selfieMaxBytes:  { type: Number,  default: 50 * 1024 },

    // Selfie retention policy - selfies are PII (face + GPS) so storing them
    // forever is a compliance liability. The nightly sweep in hrCron.js
    // deletes selfie files older than `selfieRetentionDays`, BUT only when
    // `selfieAutoCleanupEnabled` is true. The attendance row + audit trail
    // (timeLog metadata, distance, IP, marked-by) stays intact - only the
    // image bytes go.
    selfieRetentionDays:        { type: Number,  default: 365, min: 7, max: 3650 },
    selfieAutoCleanupEnabled:   { type: Boolean, default: false },

    // Universal Math cap. Hours beyond this become OT.
    standardWorkdayHours: { type: Number, default: 8, min: 1, max: 24 },

    /* --------------- Lunch / "skipped break" controls --------------- *
     * Without these, a worker who clocks in at 09:00 and clocks out at
     * 18:00 with NO mid-day punch-out gets the entire 9 hours credited
     * as worked time (lunch hour becomes silent OT). Two opt-in
     * mechanisms address this:
     *
     *   A) autoDeductLunch  → math subtracts a fixed lunch period when
     *      the longest continuous session exceeds the threshold. The
     *      deduction is moved into breakMinutes so payroll sees a real
     *      break, not just "1h less work".
     *
     *   B) flagBreakSkipped → row gets `breakSkipped: true` when the
     *      gap-based breakMinutes is zero AND the longest session is
     *      over the threshold. Independent of (A): even if (A) silently
     *      fixed the payroll number, (B) lets HR see the gaming pattern.
     * ----------------------------------------------------------------- */

    autoDeductLunch:               { type: Boolean, default: false },
    lunchDeductionMinutes:         { type: Number,  default: 60, min: 0, max: 180 },
    lunchDeductionThresholdHours:  { type: Number,  default: 6,  min: 1, max: 24 },

    flagBreakSkipped:              { type: Boolean, default: false },
    breakSkippedThresholdHours:    { type: Number,  default: 6,  min: 1, max: 24 },

    /* ----------- Manual GPS acquire + escape hatches -----------
     * PunchPage uses a one-shot manual `getCurrentPosition` flow
     * (admin clicks "Get my location" → one fix → punch). The
     * settings below add two safety nets for weak-signal cases.
     * Both default OFF for compliance - admins opt in.
     *
     *   maxPunchAccuracyMeters: the only "magic number" exposed
     *     to the admin. Rejects punches whose accuracy is worse
     *     than this. 1000m is a sensible default that catches
     *     network-fallback fixes without blocking indoor GPS.
     *
     *   allowApproximatePunch: when ON, workers whose accuracy
     *     exceeds maxPunchAccuracyMeters get a secondary
     *     "Punch with approximate position" button. The row is
     *     stored with `approximate: true` so HR can review.
     *
     *   ipLockSatisfiesGeofence: when ON, office workers whose
     *     IP matches the office allowlist are exempted from the
     *     geofence rejection (distance still recorded). Silent
     *     fix for indoor-only office staff who can't get a GPS
     *     lock through the building.
     * ----------------------------------------------------------- */
    maxPunchAccuracyMeters:        { type: Number,  default: 1000, min: 50, max: 5000 },
    allowApproximatePunch:         { type: Boolean, default: false },
    ipLockSatisfiesGeofence:       { type: Boolean, default: false },

    /* --------------------- Attendance v3 --------------------- *
     * Schedules + status engine + holiday handling. Everything
     * here defaults to OFF / safe values so the v3 layer ships
     * disabled. Admins enable subsystems individually.
     * --------------------------------------------------------- */

    // Master switch for the auto-status engine (late, absent,
    // weekend, holiday classification). When OFF, attendance
    // statuses remain whatever they were set to manually and
    // none of the v3 controls below take effect.
    autoStatusEnabled:    { type: Boolean, default: false },

    // When true, GPS punch is refused on holidays for employees
    // matching that holiday's scope. Workaround: HR uses Manual
    // Entry to add a row with a reason.
    blockPunchOnHoliday:  { type: Boolean, default: false },

    // When true, GPS punch is refused on a day that is not in
    // the employee's schedule.workdays array.
    blockPunchOnWeekend:  { type: Boolean, default: false },

    // When true, GPS punch before `earliestPunchIn` is hard-
    // refused (with a "punch opens at HH:MM" message). When OFF,
    // an early punch is allowed and just shown as "Early by Nm".
    // This is the main misuse control: blocks pre-shift OT fishing.
    enforcePunchWindow:   { type: Boolean, default: false },

    // Master switch for the GPS geofence. Default ON - punches outside
    // the configured radius are refused with OUT_OF_GEOFENCE. When OFF,
    // GPS coordinates are still recorded for audit, but distance is no
    // longer a rejection criterion. Use case: trust-based orgs, indoor
    // sites where GPS accuracy is consistently worse than the radius,
    // or hybrid roles where workers move between sites freely.
    // Selfie + IP Lock + schedule windows still apply when this is off.
    enforceGeofence:      { type: Boolean, default: true },

    // When true, the punch endpoint stamps `lateMinutes` and the
    // status engine flags the row as `late` if minutes > grace.
    // When OFF, every successful punch is `present`.
    autoClassifyLate:     { type: Boolean, default: false },

    // When true, approval/cancellation of a LeaveRequest auto-
    // upserts Attendance rows with status='leave' for each
    // covered date. When OFF, leave status must be set manually.
    integrateLeaveRequests: { type: Boolean, default: true },

    // End-of-day cutoff for the nightly status sweep. The cron
    // runs at this time and fills absent / weekend / holiday rows.
    endOfDayCutoff: { type: String, default: '23:55' },

    // Office shift - applies to employees with category='office'.
    // workdays is an array of integers: 0=Sun, 1=Mon, ... 6=Sat.
    // UAE default: Sun–Thu, 09:00–18:00 with 10-min grace.
    office: {
      workdays:        { type: [Number], default: [0, 1, 2, 3, 4] },
      startTime:       { type: String,   default: '09:00' },
      endTime:         { type: String,   default: '18:00' },
      graceMinutes:    { type: Number,   default: 10, min: 0, max: 120 },
      earliestPunchIn: { type: String,   default: '08:00' },
      latestPunchOut:  { type: String,   default: '20:00' }
    },

    // Site shift - applies to employees with category starting
    // with 'site_' (site_company_visa, site_mission_visa).
    // UAE construction default: Sun–Sat, 07:00–17:00 with 15-min grace.
    site: {
      workdays:        { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
      startTime:       { type: String,   default: '07:00' },
      endTime:         { type: String,   default: '17:00' },
      graceMinutes:    { type: Number,   default: 15, min: 0, max: 120 },
      earliestPunchIn: { type: String,   default: '06:30' },
      latestPunchOut:  { type: String,   default: '19:00' }
    }
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Ensure only one settings document exists
systemSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
