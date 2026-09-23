const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const Project = require('../models/Project');
const Location = require('../models/Location');
const HRAlert = require('../models/HRAlert');
const GeneralAuditLog = require('../models/GeneralAuditLog');
const SystemSettings = require('../models/SystemSettings');
const { canAccessHRAttendance, scopeAttendanceToProjects } = require('../middleware/rbac');
const { effectiveWeight, canOverwrite } = require('../utils/roleWeight');
const { haversineMeters } = require('../utils/haversine');
const { recomputeFromTimeLogs, findOpenLog, validateTimeLogs, deriveProjectAllocations } = require('../utils/attendanceMath');
const { ipMatchesAny } = require('../utils/networkMatch');
const { saveSelfie, SelfieStorageError, UPLOAD_ROOT: SELFIE_UPLOAD_ROOT } = require('../utils/selfieStorage');
const {
  pickSchedule,
  isWorkday,
  classifyPunchIn,
  classifyPunchOut,
  findHolidayFor
} = require('../utils/attendanceSchedule');
const Holiday = require('../models/Holiday');
const LeaveRequest = require('../models/LeaveRequest');

const STANDARD_WORKDAY_HOURS = Number(process.env.STANDARD_WORKDAY_HOURS) || 8;

const router = express.Router();

const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const hasHRAccess = (roles) =>
  roles.includes('hr') || roles.includes('manager') || roles.includes('admin');

const canEnterSiteAttendance = (roles) =>
  hasHRAccess(roles) ||
  roles.includes('supervisor') ||
  roles.includes('site_engineer') ||
  roles.includes('project_engineer') ||
  roles.includes('site_supervisor');

const canViewProjectCost = (roles) =>
  hasHRAccess(roles) || roles.includes('project_engineer');

function normalizeDate(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

async function audit(action, entityId, userId, details = {}) {
  try {
    await GeneralAuditLog.create({
      action,
      module: 'hr_management',
      entityType: 'attendance',
      entityId,
      performedBy: userId,
      performedAt: new Date(),
      details,
      success: true
    });
  } catch (err) {
    console.error('[attendance audit]', err.message);
  }
}

async function recomputeBudgetAlert(projectId) {
  try {
    const project = await Project.findById(projectId);
    if (!project || !project.labourBudgetAmount || project.labourBudgetAmount <= 0) return;

    const result = await Attendance.aggregate([
      { $match: { 'projectAllocations.projectId': new mongoose.Types.ObjectId(projectId) } },
      { $unwind: '$projectAllocations' },
      { $match: { 'projectAllocations.projectId': new mongoose.Types.ObjectId(projectId) } },
      { $lookup: { from: 'employees', localField: 'employee', foreignField: '_id', as: 'emp' } },
      { $unwind: '$emp' },
      {
        $group: {
          _id: null,
          totalCost: {
            $sum: {
              $multiply: [
                '$projectAllocations.hours',
                { $divide: [{ $ifNull: ['$emp.offerLetter.totalGrossSalary', 0] }, 240] }
              ]
            }
          }
        }
      }
    ]);

    const totalCost = result[0]?.totalCost || 0;
    if (totalCost > project.labourBudgetAmount) {
      const existing = await HRAlert.findOne({
        project: project._id,
        alertType: 'budget_overrun',
        status: 'open'
      });
      if (!existing) {
        await HRAlert.create({
          alertType: 'budget_overrun',
          severity: 'critical',
          project: project._id,
          message: `Labour cost for project "${project.name}" has exceeded the budget (AED ${totalCost.toFixed(2)} / ${project.labourBudgetAmount.toFixed(2)})`,
          status: 'open'
        });
      }
    }
  } catch (err) {
    console.error('[budget alert recompute]', err.message);
  }
}

/* ------------------------------------------------------------------ *
 *  GET /api/attendance/punch-context
 *  Returns the employee + every assignable punch candidate (active
 *  projects with siteLocationId, plus the employee's base location)
 *  with full coordinates so the client can compute live Haversine
 *  distance and pre-validate before submitting a punch.
 *
 *  Each candidate carries the metadata the punch UI needs to render
 *  the rich project card: project name + id, supervisors, project
 *  engineers, site engineer, fellow workers, and contact details.
 * ------------------------------------------------------------------ */
router.get('/punch-context', auth, async (req, res) => {
  try {
    const employee = await Employee.findOne({ userId: req.user.userId })
      .populate({
        path: 'assignedProjects',
        select: 'name status siteLocationId supervisors assignedProjectEngineer assignedSiteEngineer workers',
        populate: [
          { path: 'siteLocationId' },
          { path: 'supervisors', select: 'name email' },
          { path: 'assignedProjectEngineer', select: 'name email' },
          { path: 'assignedSiteEngineer', select: 'name email' },
          { path: 'workers', select: 'name email' }
        ]
      })
      .populate('baseLocationId')
      .populate('additionalLocationIds')
      .populate({
        path: 'locationGroupId',
        populate: { path: 'locationIds' }
      });
    if (!employee) {
      return res.status(403).json({ code: 'NO_EMPLOYEE_PROFILE', message: 'No employee profile is linked to this user.' });
    }

    // Build a phone-by-userId map by looking up the linked Employee records
    // for every user we surface as a contact. One round trip, no per-user calls.
    const contactUserIds = new Set();
    for (const p of (employee.assignedProjects || [])) {
      for (const u of (p.supervisors || []))            if (u?._id) contactUserIds.add(String(u._id));
      for (const u of (p.assignedProjectEngineer || []))if (u?._id) contactUserIds.add(String(u._id));
      if (p.assignedSiteEngineer?._id)                  contactUserIds.add(String(p.assignedSiteEngineer._id));
    }
    const contactsByUserId = new Map();
    if (contactUserIds.size > 0) {
      const empContacts = await Employee.find({ userId: { $in: Array.from(contactUserIds) } })
        .select('userId fullName phone employeeId');
      for (const e of empContacts) {
        if (e.userId) contactsByUserId.set(String(e.userId), { phone: e.phone, employeeId: e.employeeId, fullName: e.fullName });
      }
    }

    // Shape a contact entry from a User doc + the matching Employee phone
    const shapeContact = (u) => {
      if (!u) return null;
      const c = contactsByUserId.get(String(u._id)) || {};
      return {
        userId: u._id,
        name: c.fullName || u.name,
        email: u.email,
        phone: c.phone || null,
        employeeId: c.employeeId || null
      };
    };

    // Build candidates
    const candidates = [];
    const settings = await loadAttendanceSettings();

    for (const project of (employee.assignedProjects || [])) {
      if (!project || project.status !== 'active') continue;
      if (!project.siteLocationId || project.siteLocationId.status !== 'active') continue;
      const loc = project.siteLocationId;

      // Slim worker list - first 3 by name, total count for "and N others"
      const workersTotal = (project.workers || []).length;
      const workersPreview = (project.workers || []).slice(0, 3).map(u => ({
        userId: u._id, name: u.name, email: u.email
      }));

      candidates.push({
        kind: 'project',
        project: {
          _id: project._id,
          name: project.name,
          supervisors: (project.supervisors || []).map(shapeContact).filter(Boolean),
          projectEngineers: (project.assignedProjectEngineer || []).map(shapeContact).filter(Boolean),
          siteEngineer: shapeContact(project.assignedSiteEngineer),
          workersPreview,
          workersTotal
        },
        location: {
          _id: loc._id,
          name: loc.name,
          type: loc.type,
          address: loc.address,
          lat: loc.lat,
          lng: loc.lng,
          geofenceRadiusMeters: loc.geofenceRadiusMeters
        }
      });
    }

    // Helper - build a candidate object from a Location doc with dedup against
    // already-pushed locations (prevents the same Location showing up twice
    // when it appears in baseLocationId AND a LocationGroup, for example).
    const seenLocationIds = new Set(
      candidates
        .filter(c => c.location)
        .map(c => String(c.location._id))
    );
    const pushLocationCandidate = (loc, kind, groupName) => {
      if (!loc || loc.status !== 'active') return;
      const id = String(loc._id);
      if (seenLocationIds.has(id)) return;
      seenLocationIds.add(id);
      candidates.push({
        kind,
        ...(groupName ? { groupName } : {}),
        location: {
          _id: loc._id,
          name: loc.name,
          type: loc.type,
          address: loc.address,
          lat: loc.lat,
          lng: loc.lng,
          geofenceRadiusMeters: loc.geofenceRadiusMeters,
          noGeofence: !!loc.noGeofence
        }
      });
    };

    // 1. Primary base location - single, most common path.
    pushLocationCandidate(employee.baseLocationId, 'base');

    // 2. Additional fixed locations - for employees who split time across a
    //    few specific offices.
    for (const loc of (employee.additionalLocationIds || [])) {
      pushLocationCandidate(loc, 'additional');
    }

    // 3. Group expansion - every active member location in the employee's
    //    assigned LocationGroup is treated as a valid punch target. This is
    //    the scaling lever: one group edit reaches every member.
    if (employee.locationGroupId && employee.locationGroupId.status === 'active') {
      const group = employee.locationGroupId;
      for (const loc of (group.locationIds || [])) {
        pushLocationCandidate(loc, 'group', group.name);
      }
    }

    res.json({
      employee: {
        _id: employee._id,
        fullName: employee.fullName,
        employeeId: employee.employeeId,
        category: employee.category,
        status: employee.status
      },
      candidates,
      policy: {
        selfieRequired: settings.selfieRequired,
        ipLockEnabled: settings.ipLockEnabled,           // useful for office UI hints
        standardWorkdayHours: settings.standardWorkdayHours
      }
    });
  } catch (err) {
    console.error('Error in /attendance/punch-context:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ------------------------------------------------------------------ *
 *  GET /api/attendance/shift-status
 *
 *  Drives the PunchPage shift-status card. Returns:
 *    - the employee's resolved schedule
 *    - today's working-day / holiday / leave context
 *    - live punch classification (early / on-time / late + minutes)
 *    - which punch button should appear (in / out / blocked)
 *
 *  Cheap: one Employee fetch + one Holiday query (date-indexed) + one
 *  Attendance lookup. Safe to poll every minute from the client.
 * ------------------------------------------------------------------ */
router.get('/shift-status', auth, async (req, res) => {
  try {
    const employee = await Employee.findOne({ userId: req.user.userId });
    if (!employee) return res.status(403).json({ code: 'NO_EMPLOYEE_PROFILE', message: 'No employee profile is linked to this user.' });

    const settings = await loadAttendanceSettings();
    const today = normalizeDate(new Date());
    const now = new Date();

    const schedule = pickSchedule(employee, { attendance: settings._full });
    const workdayToday = isWorkday(schedule, today);

    // Holiday lookup is independent of autoStatusEnabled - if the
    // blockPunchOnHoliday toggle is on we need this to display the holiday
    // banner + disable the Punch button, regardless of the master switch.
    let holiday = null;
    if (settings.blockPunchOnHoliday || settings.autoStatusEnabled) {
      const holidays = await loadHolidaysForDate(today);
      holiday = findHolidayFor(employee, today, holidays);
    }

    let leave = null;
    if (settings.autoStatusEnabled && settings.integrateLeaveRequests) {
      const lr = await findApprovedLeaveOnDate(employee._id, today);
      if (lr) leave = { _id: lr._id, type: lr.type, startDate: lr.startDate, endDate: lr.endDate };
    }

    const punchInClass  = classifyPunchIn(now,  schedule, { enforce: settings.enforcePunchWindow });
    const punchOutClass = classifyPunchOut(now, schedule);

    // Today's open log determines which button to show.
    const row = await Attendance.findOne({ employee: employee._id, date: today });
    const openLog = row ? findOpenLog(row.timeLogs || []) : null;
    const closedLogs = row ? (row.timeLogs || []).filter(l => l.timeIn && l.timeOut) : [];

    let nextAction = 'IN';      // 'IN' | 'OUT' | 'NONE'
    let blockReason = null;
    if (holiday && settings.blockPunchOnHoliday) {
      nextAction = 'NONE';
      blockReason = { code: 'HOLIDAY_BLOCKED', message: `Today is a holiday: ${holiday.name}.` };
    } else if (!workdayToday && settings.blockPunchOnWeekend) {
      nextAction = 'NONE';
      blockReason = { code: 'WEEKEND_BLOCKED', message: 'Today is not a working day per the configured schedule.' };
    } else if (openLog) {
      nextAction = 'OUT';
    } else if (row && row.timeLogs && row.timeLogs.length > 0 && !openLog) {
      // All closed already today - still allow another IN (multi-log).
      nextAction = 'IN';
    }

    res.json({
      now: now.toISOString(),
      schedule,
      isWorkdayToday: workdayToday,
      holiday: holiday ? { name: holiday.name, scope: holiday.scope, paid: holiday.paid } : null,
      leave,
      punchIn: punchInClass,
      punchOut: punchOutClass,
      nextAction,
      blockReason,
      todaySummary: row ? {
        attendanceId: row._id,
        status: row.status,
        lateMinutes: row.lateMinutes,
        closedLogs: closedLogs.length,
        hasOpenLog: !!openLog,
        openLogTimeIn: openLog ? openLog.timeIn : null
      } : null,
      policy: {
        autoStatusEnabled:    settings.autoStatusEnabled,
        blockPunchOnHoliday:  settings.blockPunchOnHoliday,
        blockPunchOnWeekend:  settings.blockPunchOnWeekend,
        enforcePunchWindow:   settings.enforcePunchWindow,
        enforceGeofence:      settings.enforceGeofence,
        autoClassifyLate:     settings.autoClassifyLate,
        integrateLeaveRequests: settings.integrateLeaveRequests,
        // Drives the PunchPage manual-acquire flow
        maxPunchAccuracyMeters:   settings.maxPunchAccuracyMeters,
        allowApproximatePunch:    settings.allowApproximatePunch,
        ipLockSatisfiesGeofence:  settings.ipLockSatisfiesGeofence
      }
    });
  } catch (err) {
    console.error('Error in /attendance/shift-status:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ------------------------------------------------------------------ *
 *  GET /api/attendance/mine
 *
 *  Employee self-service attendance history. Returns the caller's own
 *  attendance rows in the requested period - auth-only, no HR access
 *  needed. Used by the /my-attendance page.
 *
 *  Query:
 *    startDate, endDate   ISO date strings (inclusive)
 *    status               optional single status to filter
 *
 *  Limits to 500 rows so the table stays responsive - picking the
 *  default "last 90 days" range comfortably fits inside this cap.
 * ------------------------------------------------------------------ */
router.get('/mine', auth, async (req, res) => {
  try {
    const employee = await Employee.findOne({ userId: req.user.userId });
    if (!employee) {
      // Some staff (e.g. Account Managers, procurement-only users) have a User
      // account without a linked Employee profile. Rather than hard-blocking the
      // page with a 403, let them open My Attendance and see a friendly empty
      // state. The client renders the "not linked to an employee profile" notice
      // when employee is null.
      return res.json({ employee: null, rows: [], notLinked: true });
    }

    const { startDate, endDate, status } = req.query;
    const filter = { employee: employee._id };

    if (status && typeof status === 'string') {
      filter.status = status;
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        const d = new Date(startDate);
        if (!Number.isNaN(d.getTime())) {
          d.setHours(0, 0, 0, 0);
          filter.date.$gte = d;
        }
      }
      if (endDate) {
        const d = new Date(endDate);
        if (!Number.isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          filter.date.$lte = d;
        }
      }
    }

    const rows = await Attendance.find(filter)
      .sort({ date: -1 })
      .limit(500)
      .populate('markedBy', 'name email')
      .populate('leaveRequestId', 'type startDate endDate')
      .populate({
        path: 'projectAllocations.projectId',
        select: 'name'
      })
      // timeLogs.referenceId is a polymorphic ref (Project | Location). We
      // need the geofence anchor for each log so the PunchPage punch-out
      // card can compute live distance. Populating the raw referenceId
      // gives Location docs directly; Project docs get a second pass below
      // to resolve their siteLocationId.
      .populate('timeLogs.referenceId')
      .lean();

    // Second pass - for every Project-type log, copy the Project's
    // siteLocationId (the actual Location with lat/lng/radius) onto the
    // log as `effectiveLocation`. For Location-type logs the populated
    // referenceId IS the effective location. This gives the client a
    // uniform `log.effectiveLocation` to read from.
    const projectIds = new Set();
    for (const r of rows) {
      for (const log of (r.timeLogs || [])) {
        if (log?.referenceModel === 'Project' && log.referenceId?._id) {
          projectIds.add(String(log.referenceId._id));
        }
      }
    }
    if (projectIds.size > 0) {
      const projects = await Project.find({ _id: { $in: Array.from(projectIds) } })
        .select('siteLocationId')
        .populate('siteLocationId', 'name lat lng geofenceRadiusMeters noGeofence address type status')
        .lean();
      const byId = new Map(projects.map(p => [String(p._id), p.siteLocationId]));
      for (const r of rows) {
        for (const log of (r.timeLogs || [])) {
          if (log?.referenceModel === 'Project') {
            log.effectiveLocation = byId.get(String(log.referenceId?._id)) || null;
          } else if (log?.referenceModel === 'Location') {
            log.effectiveLocation = log.referenceId || null;
          }
        }
      }
    } else {
      for (const r of rows) {
        for (const log of (r.timeLogs || [])) {
          if (log?.referenceModel === 'Location') {
            log.effectiveLocation = log.referenceId || null;
          }
        }
      }
    }

    res.json({
      employee: {
        _id: employee._id,
        fullName: employee.fullName,
        employeeId: employee.employeeId,
        category: employee.category
      },
      rows
    });
  } catch (err) {
    console.error('Error in /attendance/mine:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ------------------------------------------------------------------ *
 *  GET /api/attendance/selfie/:attendanceId/:logId/:which
 *
 *  Gated selfie viewer. The /uploads/attendance/ static mount is locked
 *  down (see server/index.js) so selfies can ONLY be reached via this
 *  authenticated route. Access matrix:
 *    - HR / manager / admin              → any selfie
 *    - The employee whose row it is      → their own selfies
 *    - The user who marked / created     → selfies they captured
 *    - Project supervisor / engineer of a Project-type log → that log's selfie
 *    - Everyone else                     → 403
 *
 *  `which` ∈ {'in','out'} selects inSelfieUrl vs outSelfieUrl.
 *
 *  Streams the JPEG/WebP/PNG with Cache-Control: private so it never
 *  lands in a shared cache.
 * ------------------------------------------------------------------ */
router.get('/selfie/:attendanceId/:logId/:which', auth, async (req, res) => {
  try {
    const { attendanceId, logId, which } = req.params;
    if (which !== 'in' && which !== 'out') {
      return res.status(400).json({ code: 'BAD_WHICH', message: '`which` must be "in" or "out".' });
    }
    if (!mongoose.Types.ObjectId.isValid(attendanceId) || !mongoose.Types.ObjectId.isValid(logId)) {
      return res.status(400).json({ code: 'BAD_ID', message: 'Invalid id format.' });
    }

    const row = await Attendance.findById(attendanceId);
    if (!row) return res.status(404).json({ code: 'NOT_FOUND', message: 'Attendance row not found.' });

    const log = row.timeLogs.id(logId);
    if (!log) return res.status(404).json({ code: 'LOG_NOT_FOUND', message: 'Time log not found.' });

    const url = which === 'in' ? log.inSelfieUrl : log.outSelfieUrl;
    if (!url || typeof url !== 'string') {
      return res.status(404).json({ code: 'NO_SELFIE', message: 'No selfie was captured for this punch.' });
    }

    // ----- Access matrix -----
    const roles = req.user.roles || [];
    const callerUserId = String(req.user.userId);
    let allowed = false;

    // 1. HR / manager / admin
    if (hasHRAccess(roles)) {
      allowed = true;
    }
    // 2. Same user marked / created it
    else if (
      (row.markedBy && String(row.markedBy) === callerUserId) ||
      (row.createdBy && String(row.createdBy) === callerUserId)
    ) {
      allowed = true;
    }
    // 3. The employee themselves
    else {
      const employee = await Employee.findById(row.employee).select('userId');
      if (employee && employee.userId && String(employee.userId) === callerUserId) {
        allowed = true;
      }
      // 4. Project supervisor / engineer for a Project-type log
      else if (log.referenceModel === 'Project') {
        const proj = await Project.findById(log.referenceId)
          .select('supervisors assignedProjectEngineer assignedSiteEngineer');
        if (proj) {
          const userIds = new Set();
          for (const u of (proj.supervisors || []))            userIds.add(String(u));
          for (const u of (proj.assignedProjectEngineer || []))userIds.add(String(u));
          if (proj.assignedSiteEngineer)                       userIds.add(String(proj.assignedSiteEngineer));
          if (userIds.has(callerUserId)) allowed = true;
        }
      }
    }

    if (!allowed) {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'You do not have permission to view this selfie.' });
    }

    // ----- Resolve and stream the file -----
    // The stored URL is always of the form `/uploads/attendance/<YYYY-MM>/<file>`.
    // Strip the prefix and rejoin under SELFIE_UPLOAD_ROOT to prevent any escape
    // via crafted URLs in the DB (defence in depth).
    if (!url.startsWith('/uploads/attendance/')) {
      return res.status(500).json({ code: 'BAD_URL_FORMAT', message: 'Stored selfie URL is malformed.' });
    }
    const relative = url.replace('/uploads/attendance/', '');
    const resolved = path.resolve(path.join(SELFIE_UPLOAD_ROOT, relative));
    const rootResolved = path.resolve(SELFIE_UPLOAD_ROOT);
    if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
      return res.status(400).json({ code: 'BAD_PATH', message: 'Selfie path escapes the upload root.' });
    }
    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ code: 'FILE_MISSING', message: 'Selfie file is no longer on disk.' });
    }

    const ext = path.extname(resolved).toLowerCase();
    const mime = ext === '.webp' ? 'image/webp'
              : ext === '.png'  ? 'image/png'
              :                   'image/jpeg';

    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return fs.createReadStream(resolved).pipe(res);
  } catch (err) {
    console.error('Error in /attendance/selfie:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET list attendance
router.get('/', auth, canAccessHRAttendance, scopeAttendanceToProjects, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    const { employee, project, source, startDate, endDate } = req.query;

    const filter = {};
    if (source) filter.source = source;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = normalizeDate(startDate);
      if (endDate) filter.date.$lte = normalizeDate(endDate);
    }

    if (req.attendanceScoped) {
      const scopedProjectIdStrs = new Set(req.scopedProjectIds.map(id => String(id)));

      if (project && !scopedProjectIdStrs.has(String(project))) {
        return res.status(403).json({ message: 'Project is not within your allocation.' });
      }
      // NOTE: Attendance is keyed on (employee, date). Scope is enforced via the employee
      // filter below - do NOT filter by projectAllocations.projectId here, or attendance
      // without matching allocations (e.g. absent/leave rows, or rows logged to a different
      // project) would vanish from the grid when the caller changes the project filter.

      // Union of both scope paths (see middleware comment for why this
      // covers Employees with missing User links).
      const empQuery = [];
      if (Array.isArray(req.scopedWorkerUserIds) && req.scopedWorkerUserIds.length > 0) {
        empQuery.push({ userId: { $in: req.scopedWorkerUserIds } });
      }
      if (Array.isArray(req.scopedEmployeeIds) && req.scopedEmployeeIds.length > 0) {
        empQuery.push({ _id: { $in: req.scopedEmployeeIds } });
      }
      const scopedEmployees = empQuery.length > 0
        ? await Employee.find({ $or: empQuery }).select('_id')
        : [];
      const scopedEmpIds = scopedEmployees.map(e => e._id);
      const scopedEmpIdStrs = new Set(scopedEmpIds.map(id => String(id)));

      if (employee) {
        if (!scopedEmpIdStrs.has(String(employee))) {
          return res.status(403).json({ message: 'Employee is not within your allocation.' });
        }
        filter.employee = employee;
      } else {
        filter.employee = { $in: scopedEmpIds };
      }
    } else {
      if (employee) filter.employee = employee;
      if (project) filter['projectAllocations.projectId'] = project;

      if (!hasHRAccess(roles)) {
        if (roles.includes('supervisor') || roles.includes('site_engineer')) {
          filter.supervisor = req.user.userId;
        } else {
          const myEmployee = await Employee.findOne({ userId: req.user.userId });
          if (!myEmployee) return res.json([]);
          filter.employee = myEmployee._id;
        }
      }
    }

    const records = await Attendance.find(filter)
      .populate('employee', 'employeeId fullName category')
      .populate('supervisor', 'name email')
      .populate('projectAllocations.projectId', 'name')
      .populate('createdBy', 'name email')
      .populate('markedBy', 'name email')
      .populate('effectiveLocationId', 'name type')
      // timeLogs.referenceId is a polymorphic refPath ('Project' | 'Location'),
      // so Mongoose resolves to the correct model per log automatically.
      .populate('timeLogs.referenceId')
      .populate('edits.editedBy', 'name email')
      .sort({ date: -1 })
      .limit(500);

    res.json(records);
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

async function createOne(body, req, sourceOverride) {
  const normalizedDate = normalizeDate(body.date || new Date());
  const source = sourceOverride || body.source;

  const totalAllocated = (body.projectAllocations || []).reduce((s, a) => s + (Number(a.hours) || 0), 0);
  const totalHours = (Number(body.regularHours) || 0) + (Number(body.otHours) || 0);
  if (totalAllocated > totalHours + 0.0001) {
    throw new Error('Project allocations exceed total hours worked');
  }

  // Upsert-style: prevent duplicate (employee, date)
  const existing = await Attendance.findOne({ employee: body.employee, date: normalizedDate });
  if (existing) {
    throw Object.assign(new Error('Attendance already exists for this employee on this date'), { statusCode: 400 });
  }

  // Time-logs path - supervisor manual entry can include a timeLogs[] array.
  // Validate first; if present, derive hours/breaks and projectAllocations from it.
  let derivedFields = {};
  if (Array.isArray(body.timeLogs) && body.timeLogs.length > 0) {
    const errs = validateTimeLogs(body.timeLogs);
    if (errs.length > 0) {
      throw Object.assign(new Error(errs.join('; ')), { statusCode: 400 });
    }
    const settings = await loadAttendanceSettings();
    const math = recomputeFromTimeLogs(
      body.timeLogs,
      settings.standardWorkdayHours,
      mathOptsFromSettings(settings)
    );
    derivedFields = {
      regularHours: math.regularHours,
      otHours:      math.otHours,
      breakMinutes: math.breakMinutes,
      timeIn:       math.timeIn || body.timeIn,
      timeOut:      math.timeOut || body.timeOut,
      breakSkipped: math.breakSkipped,
      projectAllocations: deriveProjectAllocations(body.timeLogs)
    };
  }

  const doc = await Attendance.create({
    ...body,
    ...derivedFields,
    date: normalizedDate,
    source,
    supervisor: source === 'site' ? req.user.userId : undefined,
    entryMethod: body.entryMethod || 'MANUAL_ENTRY',
    markedBy: body.markedBy || req.user.userId,
    lockedByRoleWeight: effectiveWeight(req),
    createdBy: req.user.userId
  });

  await audit('attendance_submitted', doc._id, req.user.userId, { source, employee: body.employee });

  for (const alloc of doc.projectAllocations || []) {
    await recomputeBudgetAlert(alloc.projectId);
  }

  return doc;
}

// POST site attendance
router.post('/site', auth, scopeAttendanceToProjects, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!canEnterSiteAttendance(roles)) return res.status(403).json({ message: 'Access denied.' });
    if (!req.body.employee) return res.status(400).json({ message: 'employee is required.' });

    if (req.attendanceScoped) {
      const scopedProjectIdStrs = new Set(req.scopedProjectIds.map(id => String(id)));
      const allocations = Array.isArray(req.body.projectAllocations) ? req.body.projectAllocations : [];
      for (const alloc of allocations) {
        if (!alloc?.projectId || !scopedProjectIdStrs.has(String(alloc.projectId))) {
          return res.status(403).json({ message: 'One or more projects are not within your allocation.' });
        }
      }

      const targetEmp = await Employee.findById(req.body.employee).select('userId');
      if (!targetEmp) return res.status(404).json({ message: 'Employee not found.' });
      // Accept via either path so workers without a linked User account
      // (but with assignedProjects in scope) still pass.
      const scopedUserIdStrs = new Set((req.scopedWorkerUserIds || []).map(id => String(id)));
      const scopedEmployeeIdStrs = new Set((req.scopedEmployeeIds || []).map(id => String(id)));
      const okByUser = targetEmp.userId && scopedUserIdStrs.has(String(targetEmp.userId));
      const okByEmp  = scopedEmployeeIdStrs.has(String(targetEmp._id));
      if (!okByUser && !okByEmp) {
        return res.status(403).json({ message: 'Employee is not a worker on your projects.' });
      }
    }

    const doc = await createOne(req.body, req, 'site');
    res.status(201).json(doc);
  } catch (error) {
    const code = error.statusCode || 500;
    console.error('Error creating site attendance:', error);
    res.status(code).json({ message: error.message || 'Server error' });
  }
});

// POST office attendance
router.post('/office', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) return res.status(403).json({ message: 'Access denied.' });
    if (!req.body.employee) return res.status(400).json({ message: 'employee is required.' });

    const doc = await createOne(req.body, req, 'office');
    res.status(201).json(doc);
  } catch (error) {
    const code = error.statusCode || 500;
    console.error('Error creating office attendance:', error);
    res.status(code).json({ message: error.message || 'Server error' });
  }
});

// POST bulk entry
router.post('/bulk', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const entries = Array.isArray(req.body.entries) ? req.body.entries : [];
    const results = [];

    for (const entry of entries) {
      try {
        const doc = await createOne(entry, req, entry.source || 'office');
        results.push({ status: 'created', id: doc._id, employee: entry.employee });
      } catch (err) {
        results.push({ status: 'error', reason: err.message, employee: entry.employee });
      }
    }

    res.json({ count: results.length, results });
  } catch (error) {
    console.error('Error in bulk attendance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET employees eligible for the grid, scoped for project-scoped users
router.get('/grid-employees', auth, canAccessHRAttendance, scopeAttendanceToProjects, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    const filter = { status: 'active' };

    if (req.attendanceScoped) {
      // Two paths into the markable set:
      //   (1) Users on project.workers / project.supervisors → matched via
      //       Employee.userId. This is the historical path.
      //   (2) Employees with assignedProjects in our scope → matched via
      //       Employee._id directly. Added because workers/supervisors
      //       sometimes have Employee profiles but no linked User account
      //       (or vice versa), and the old query missed them entirely.
      const ors = [];
      if (Array.isArray(req.scopedWorkerUserIds) && req.scopedWorkerUserIds.length > 0) {
        ors.push({ userId: { $in: req.scopedWorkerUserIds } });
      }
      if (Array.isArray(req.scopedEmployeeIds) && req.scopedEmployeeIds.length > 0) {
        ors.push({ _id: { $in: req.scopedEmployeeIds } });
      }
      if (ors.length === 0) {
        // Genuinely no projects in scope - return empty rather than 403.
        return res.json([]);
      }
      filter.$or = ors;
    } else if (!hasHRAccess(roles)) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const employees = await Employee.find(filter)
      .select('fullName employeeId position department assignedProjects userId category status joiningDate')
      .populate('assignedProjects', 'name')
      .populate({
        path: 'userId',
        select: 'roles',
        populate: { path: 'roles', select: 'key name' }
      })
      .sort({ fullName: 1 });

    res.json(employees);
  } catch (error) {
    console.error('Error fetching grid employees:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST bulk-manual - grid bulk upsert with per-row scope + lock enforcement
router.post('/bulk-manual', auth, canAccessHRAttendance, scopeAttendanceToProjects, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    const entries = Array.isArray(req.body.entries) ? req.body.entries : [];
    if (entries.length === 0) return res.json({ count: 0, results: [] });

    const scopedProjectIdStrs = req.attendanceScoped
      ? new Set(req.scopedProjectIds.map(id => String(id)))
      : null;
    const scopedUserIdStrs = req.attendanceScoped
      ? new Set(req.scopedWorkerUserIds.map(id => String(id)))
      : null;
    // Second-path set - Employee IDs allowed via assignedProjects overlap.
    // Used alongside scopedUserIdStrs in the per-row gate below.
    const scopedEmployeeIdStrs = req.attendanceScoped
      ? new Set((req.scopedEmployeeIds || []).map(id => String(id)))
      : null;

    const employeeIds = Array.from(new Set(entries.map(e => e.employee && String(e.employee)).filter(Boolean)));
    // Populate userId.roles so we can enforce: only Admin marks HR/Manager,
    // and nobody (except Admin) marks their own row.
    const employees = await Employee.find({ _id: { $in: employeeIds } })
      .select('_id userId')
      .populate({ path: 'userId', select: 'roles', populate: { path: 'roles', select: 'key' } });
    const empMap = new Map(employees.map(e => [String(e._id), e]));

    const callerIsAdmin = roles.includes('admin');
    const callerUserIdStr = String(req.user.userId);

    const existingKeys = entries
      .filter(e => e.employee)
      .map(e => ({ employee: e.employee, date: normalizeDate(e.date || new Date()) }));
    const existingDocs = existingKeys.length > 0
      ? await Attendance.find({ $or: existingKeys })
      : [];
    const existingMap = new Map();
    for (const doc of existingDocs) {
      existingMap.set(`${String(doc.employee)}_${doc.date.toISOString()}`, doc);
    }

    const results = [];
    const affectedProjectIds = new Set();

    for (const entry of entries) {
      try {
        if (!entry.employee) throw new Error('employee is required');

        const source = entry.source || 'office';
        if (source === 'office' && !hasHRAccess(roles)) {
          throw new Error('Office entries are HR-only');
        }
        if (source === 'site' && !canEnterSiteAttendance(roles)) {
          throw new Error('Not allowed to enter site attendance');
        }

        // Privileged-target guard:
        //   - HR / Manager cannot have their attendance modified except by Admin
        //   - Nobody (except Admin) can modify their own row
        const targetEmp = empMap.get(String(entry.employee));
        const targetUser = targetEmp && targetEmp.userId;
        const targetRoleKeys = (targetUser?.roles || []).map(r => r?.key).filter(Boolean);
        const targetIsHrOrManager = targetRoleKeys.includes('hr') || targetRoleKeys.includes('manager');
        const targetIsSelf = targetUser && String(targetUser._id) === callerUserIdStr;
        if (targetIsHrOrManager && !callerIsAdmin) {
          throw new Error('Only Admin can modify attendance for HR or Manager.');
        }
        if (targetIsSelf && !callerIsAdmin) {
          throw new Error('You cannot edit your own attendance.');
        }

        if (req.attendanceScoped) {
          const emp = empMap.get(String(entry.employee));
          if (!emp) throw new Error('Employee not found');
          // Accept via either path - User-link OR Employee-via-assignedProjects.
          // Matches the grid-employees query so a row that's visible is also
          // writeable.
          const okByUser = emp.userId && scopedUserIdStrs.has(String(emp.userId));
          const okByEmp  = scopedEmployeeIdStrs && scopedEmployeeIdStrs.has(String(emp._id));
          if (!okByUser && !okByEmp) {
            throw new Error('Employee is not within your allocation');
          }
          const allocs = Array.isArray(entry.projectAllocations) ? entry.projectAllocations : [];
          for (const a of allocs) {
            if (!a?.projectId || !scopedProjectIdStrs.has(String(a.projectId))) {
              throw new Error('One or more projects are not within your allocation');
            }
          }
        }

        const normalizedDate = normalizeDate(entry.date || new Date());
        const existingDoc = existingMap.get(`${String(entry.employee)}_${normalizedDate.toISOString()}`);

        if (existingDoc && existingDoc.lockedByRoleWeight > effectiveWeight(req)) {
          results.push({
            status: 'locked',
            id: existingDoc._id,
            employee: entry.employee,
            lockedByRoleWeight: existingDoc.lockedByRoleWeight,
            reason: 'Entry is locked by a higher-ranked reviewer'
          });
          continue;
        }

        if (existingDoc) {
          const regular = entry.regularHours !== undefined ? Number(entry.regularHours) : existingDoc.regularHours;
          const ot = entry.otHours !== undefined ? Number(entry.otHours) : existingDoc.otHours;
          const allocSource = entry.projectAllocations !== undefined ? entry.projectAllocations : existingDoc.projectAllocations;
          const totalAllocated = (allocSource || []).reduce((s, a) => s + (Number(a.hours) || 0), 0);
          if (totalAllocated > regular + ot + 0.0001) {
            throw new Error('Project allocations exceed total hours worked');
          }

          const changes = [];
          const simpleFields = ['status', 'source', 'timeIn', 'timeOut', 'breakMinutes', 'regularHours', 'otHours', 'notes'];
          for (const f of simpleFields) {
            if (entry[f] !== undefined && String(entry[f]) !== String(existingDoc[f] || '')) {
              changes.push({ field: f, from: existingDoc[f], to: entry[f] });
              existingDoc[f] = entry[f];
            }
          }
          if (entry.projectAllocations !== undefined) {
            changes.push({ field: 'projectAllocations', from: existingDoc.projectAllocations, to: entry.projectAllocations });
            existingDoc.projectAllocations = entry.projectAllocations;
          }
          if (entry.source !== undefined && entry.source !== existingDoc.source) {
            existingDoc.supervisor = entry.source === 'site' ? req.user.userId : undefined;
          }

          // timeLogs[] - when supplied, replace, validate, run Universal Math,
          // overwrite legacy projections + derive projectAllocations.
          if (entry.timeLogs !== undefined) {
            if (!Array.isArray(entry.timeLogs)) {
              throw new Error('timeLogs must be an array');
            }
            const sanitized = entry.timeLogs.map(l => ({
              type: l.type,
              referenceModel: l.referenceModel,
              referenceId: l.referenceId,
              timeIn: l.timeIn ? new Date(l.timeIn) : null,
              timeOut: l.timeOut ? new Date(l.timeOut) : null,
              inCoordinates: l.inCoordinates,
              outCoordinates: l.outCoordinates,
              inSelfieUrl: l.inSelfieUrl,
              outSelfieUrl: l.outSelfieUrl,
              inIpAddress: l.inIpAddress,
              outIpAddress: l.outIpAddress,
              inDistanceMeters: l.inDistanceMeters,
              outDistanceMeters: l.outDistanceMeters,
              notes: l.notes
            }));
            const errs = validateTimeLogs(sanitized);
            if (errs.length > 0) throw new Error(errs.join('; '));

            changes.push({ field: 'timeLogs', from: `${(existingDoc.timeLogs || []).length} logs`, to: `${sanitized.length} logs` });
            existingDoc.timeLogs = sanitized;

            const settings = await loadAttendanceSettings();
            const math = recomputeFromTimeLogs(
              sanitized,
              settings.standardWorkdayHours,
              mathOptsFromSettings(settings)
            );
            existingDoc.regularHours = math.regularHours;
            existingDoc.otHours = math.otHours;
            existingDoc.breakMinutes = math.breakMinutes;
            existingDoc.breakSkipped = math.breakSkipped;
            if (math.timeIn)  existingDoc.timeIn  = math.timeIn;
            if (math.timeOut) existingDoc.timeOut = math.timeOut;
            existingDoc.projectAllocations = deriveProjectAllocations(sanitized);
          }

          if (changes.length > 0) {
            // Same rule as PUT /:id - timeLog edits require a justification.
            const touchedTimeLogs = changes.some(c => String(c.field).startsWith('timeLogs'));
            const reason = typeof entry.editReason === 'string' ? entry.editReason.trim() : '';
            if (touchedTimeLogs && !reason) {
              throw new Error('A reason is required when adding or editing time logs.');
            }
            existingDoc.edits.push({ editedBy: req.user.userId, editedAt: new Date(), changes, reason: reason || undefined });
            existingDoc.lockedByRoleWeight = effectiveWeight(req);
            existingDoc.markedBy = req.user.userId;
            existingDoc.entryMethod = 'MANUAL_ENTRY';
            await existingDoc.save();
            await audit('attendance_updated', existingDoc._id, req.user.userId, { changesCount: changes.length, via: 'bulk-manual', reason: reason || undefined });
          }

          for (const alloc of existingDoc.projectAllocations || []) {
            affectedProjectIds.add(String(alloc.projectId));
          }
          results.push({ status: 'updated', id: existingDoc._id, employee: entry.employee });
        } else {
          const doc = await createOne(entry, req, source);
          for (const alloc of doc.projectAllocations || []) {
            affectedProjectIds.add(String(alloc.projectId));
          }
          results.push({ status: 'created', id: doc._id, employee: entry.employee });
        }
      } catch (err) {
        results.push({
          status: 'error',
          employee: entry.employee,
          reason: err.message
        });
      }
    }

    for (const pid of affectedProjectIds) {
      await recomputeBudgetAlert(pid);
    }

    res.json({ count: results.length, results });
  } catch (error) {
    console.error('Error in bulk-manual attendance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update attendance
router.put('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    const record = await Attendance.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Record not found.' });

    const isOwnSiteEntry = roles.includes('supervisor') && record.supervisor?.toString() === req.user.userId;
    const isWithin24h = Date.now() - record.createdAt.getTime() < 24 * 60 * 60 * 1000;

    if (!hasHRAccess(roles) && !(isOwnSiteEntry && isWithin24h)) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    if (!canOverwrite(req, record.lockedByRoleWeight)) {
      return res.status(403).json({
        message: 'This entry is locked by a higher-ranked reviewer.',
        code: 'locked',
        lockedByRoleWeight: record.lockedByRoleWeight
      });
    }

    // Privileged-target guard (same as bulk-manual). Look up the target
    // employee's user roles to decide whether the caller is allowed to
    // touch this row at all.
    {
      const callerIsAdmin = roles.includes('admin');
      const targetEmp = await Employee.findById(record.employee)
        .select('userId')
        .populate({ path: 'userId', select: 'roles', populate: { path: 'roles', select: 'key' } });
      const targetUser = targetEmp && targetEmp.userId;
      const targetRoleKeys = (targetUser?.roles || []).map(r => r?.key).filter(Boolean);
      const targetIsHrOrManager = targetRoleKeys.includes('hr') || targetRoleKeys.includes('manager');
      const targetIsSelf = targetUser && String(targetUser._id) === String(req.user.userId);
      if (targetIsHrOrManager && !callerIsAdmin) {
        return res.status(403).json({ message: 'Only Admin can modify attendance for HR or Manager.' });
      }
      if (targetIsSelf && !callerIsAdmin) {
        return res.status(403).json({ message: 'You cannot edit your own attendance.' });
      }
    }

    const body = req.body || {};
    const changes = [];
    const simpleFields = ['status', 'timeIn', 'timeOut', 'breakMinutes', 'regularHours', 'otHours', 'notes'];

    for (const f of simpleFields) {
      if (body[f] !== undefined && String(body[f]) !== String(record[f] || '')) {
        changes.push({ field: f, from: record[f], to: body[f] });
        record[f] = body[f];
      }
    }

    if (body.projectAllocations !== undefined) {
      changes.push({ field: 'projectAllocations', from: record.projectAllocations, to: body.projectAllocations });
      record.projectAllocations = body.projectAllocations;
    }

    // Attendance v2 - supervisor manual edit of the multi-log timeline.
    // When timeLogs is included in the body, replace and re-run Universal Math.
    // Validation rejects overlaps, multi-open, missing types/refs before save.
    if (body.timeLogs !== undefined) {
      if (!Array.isArray(body.timeLogs)) {
        return res.status(400).json({ code: 'BAD_TIMELOGS', message: 'timeLogs must be an array.' });
      }
      const sanitized = body.timeLogs.map(l => ({
        type: l.type,
        referenceModel: l.referenceModel,
        referenceId: l.referenceId,
        timeIn: l.timeIn ? new Date(l.timeIn) : null,
        timeOut: l.timeOut ? new Date(l.timeOut) : null,
        inCoordinates: l.inCoordinates,
        outCoordinates: l.outCoordinates,
        inSelfieUrl: l.inSelfieUrl,
        outSelfieUrl: l.outSelfieUrl,
        inIpAddress: l.inIpAddress,
        outIpAddress: l.outIpAddress,
        inDistanceMeters: l.inDistanceMeters,
        outDistanceMeters: l.outDistanceMeters,
        notes: l.notes
      }));
      const errs = validateTimeLogs(sanitized);
      if (errs.length > 0) {
        return res.status(400).json({ code: 'INVALID_TIMELOGS', message: errs.join('; '), errors: errs });
      }
      changes.push({ field: 'timeLogs', from: `${(record.timeLogs || []).length} logs`, to: `${sanitized.length} logs` });
      record.timeLogs = sanitized;

      // Run Universal Math and overwrite the legacy projections.
      const settings = await loadAttendanceSettings();
      const math = recomputeFromTimeLogs(
        sanitized,
        settings.standardWorkdayHours,
        mathOptsFromSettings(settings)
      );
      if (Number(record.regularHours) !== math.regularHours) {
        changes.push({ field: 'regularHours', from: record.regularHours, to: math.regularHours });
        record.regularHours = math.regularHours;
      }
      if (Number(record.otHours) !== math.otHours) {
        changes.push({ field: 'otHours', from: record.otHours, to: math.otHours });
        record.otHours = math.otHours;
      }
      if (Number(record.breakMinutes) !== math.breakMinutes) {
        changes.push({ field: 'breakMinutes', from: record.breakMinutes, to: math.breakMinutes });
        record.breakMinutes = math.breakMinutes;
      }
      if (Boolean(record.breakSkipped) !== Boolean(math.breakSkipped)) {
        changes.push({ field: 'breakSkipped', from: record.breakSkipped, to: math.breakSkipped });
        record.breakSkipped = math.breakSkipped;
      }
      if (math.timeIn) record.timeIn = math.timeIn;
      if (math.timeOut) record.timeOut = math.timeOut;

      // Keep the legacy projectAllocations[] in sync so the existing Project
      // Cost Report aggregation (which queries projectAllocations.projectId)
      // continues to reflect time-log-based attendance.
      const derived = deriveProjectAllocations(sanitized);
      record.projectAllocations = derived;
    }

    if (changes.length > 0) {
      // Manual edits that touch timeLogs require a justification - captured
      // in TimeLogsModal and threaded through here. Single-field tweaks
      // (e.g. notes, status) don't require one.
      const touchedTimeLogs = changes.some(c => String(c.field).startsWith('timeLogs'));
      const reason = typeof body.editReason === 'string' ? body.editReason.trim() : '';
      if (touchedTimeLogs && !reason) {
        return res.status(400).json({
          code: 'REASON_REQUIRED',
          message: 'A reason is required when adding or editing time logs.'
        });
      }
      record.edits.push({ editedBy: req.user.userId, editedAt: new Date(), changes, reason: reason || undefined });
      record.lockedByRoleWeight = effectiveWeight(req);
      record.markedBy = req.user.userId;
      record.entryMethod = 'MANUAL_ENTRY';
    }

    await record.save();
    await audit('attendance_updated', record._id, req.user.userId, { changesCount: changes.length });

    for (const alloc of record.projectAllocations || []) {
      await recomputeBudgetAlert(alloc.projectId);
    }

    res.json(record);
  } catch (error) {
    console.error('Error updating attendance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET project cost report
router.get('/project/:projectId/cost-report', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!canViewProjectCost(roles)) return res.status(403).json({ message: 'Access denied.' });

    const projectId = new mongoose.Types.ObjectId(req.params.projectId);
    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found.' });

    const result = await Attendance.aggregate([
      { $match: { 'projectAllocations.projectId': projectId } },
      { $unwind: '$projectAllocations' },
      { $match: { 'projectAllocations.projectId': projectId } },
      { $lookup: { from: 'employees', localField: 'employee', foreignField: '_id', as: 'emp' } },
      { $unwind: '$emp' },
      {
        $group: {
          _id: '$emp._id',
          employeeId: { $first: '$emp.employeeId' },
          fullName: { $first: '$emp.fullName' },
          totalHours: { $sum: '$projectAllocations.hours' },
          totalCost: {
            $sum: {
              $multiply: [
                '$projectAllocations.hours',
                { $divide: [{ $ifNull: ['$emp.offerLetter.totalGrossSalary', 0] }, 240] }
              ]
            }
          }
        }
      },
      { $sort: { totalCost: -1 } }
    ]);

    const totalCost = result.reduce((s, r) => s + r.totalCost, 0);
    const totalHours = result.reduce((s, r) => s + r.totalHours, 0);

    res.json({
      project: {
        id: project._id,
        name: project.name,
        budget: project.budget,
        totalBudgetedManHours: project.totalBudgetedManHours,
        labourBudgetAmount: project.labourBudgetAmount
      },
      totals: { totalCost, totalHours },
      breakdown: result,
      overBudget: project.labourBudgetAmount && totalCost > project.labourBudgetAmount
    });
  } catch (error) {
    console.error('Error generating cost report:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET project budget check
router.get('/project/:projectId/budget-check', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!canViewProjectCost(roles)) return res.status(403).json({ message: 'Access denied.' });

    const projectId = new mongoose.Types.ObjectId(req.params.projectId);
    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found.' });

    const result = await Attendance.aggregate([
      { $match: { 'projectAllocations.projectId': projectId } },
      { $unwind: '$projectAllocations' },
      { $match: { 'projectAllocations.projectId': projectId } },
      { $lookup: { from: 'employees', localField: 'employee', foreignField: '_id', as: 'emp' } },
      { $unwind: '$emp' },
      {
        $group: {
          _id: null,
          totalHours: { $sum: '$projectAllocations.hours' },
          totalCost: {
            $sum: {
              $multiply: [
                '$projectAllocations.hours',
                { $divide: [{ $ifNull: ['$emp.offerLetter.totalGrossSalary', 0] }, 240] }
              ]
            }
          }
        }
      }
    ]);

    const totalCost = result[0]?.totalCost || 0;
    const totalHours = result[0]?.totalHours || 0;

    res.json({
      projectId: project._id,
      projectName: project.name,
      totalBudgetedManHours: project.totalBudgetedManHours || null,
      labourBudgetAmount: project.labourBudgetAmount || null,
      actualHours: totalHours,
      actualCost: totalCost,
      hoursUtilization: project.totalBudgetedManHours ? totalHours / project.totalBudgetedManHours : null,
      costUtilization: project.labourBudgetAmount ? totalCost / project.labourBudgetAmount : null,
      overBudget: project.labourBudgetAmount ? totalCost > project.labourBudgetAmount : false,
      overAllocated: project.totalBudgetedManHours ? totalHours > project.totalBudgetedManHours : false
    });
  } catch (error) {
    console.error('Error checking budget:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/attendance/punch - employee self-service GPS punch in/out
/* ------------------------------------------------------------------ *
 *  Attendance v2 - multi-log GPS punch with Geofence Trap, Office IP
 *  Lock, Geofence Auto-Detect, selfie capture, and Universal Math.
 *  See server/utils/attendanceMath.js for the math contract.
 * ------------------------------------------------------------------ */

function validateLatLng(lat, lng) {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
    return { error: 'lat must be a number between -90 and 90.' };
  }
  if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
    return { error: 'lng must be a number between -180 and 180.' };
  }
  return { latNum, lngNum };
}

async function loadAttendanceSettings() {
  try {
    const s = await SystemSettings.getSettings();
    const a = (s && s.attendance) ? s.attendance.toObject?.() || s.attendance : {};
    return {
      ipLockEnabled: a.ipLockEnabled === true,
      allowedOfficeNetworks: Array.isArray(a.allowedOfficeNetworks) ? a.allowedOfficeNetworks : [],
      allowedRemoteNetworks: Array.isArray(a.allowedRemoteNetworks) ? a.allowedRemoteNetworks : [],
      ipLockExemptUserIds: Array.isArray(a.ipLockExemptUserIds) ? a.ipLockExemptUserIds.map(String) : [],
      selfieRequired: a.selfieRequired !== false,
      selfieMaxBytes: Number(a.selfieMaxBytes) || (50 * 1024),
      standardWorkdayHours: Number(a.standardWorkdayHours) || STANDARD_WORKDAY_HOURS,
      // Attendance v3 - status engine + schedules.
      autoStatusEnabled:    a.autoStatusEnabled === true,
      blockPunchOnHoliday:  a.blockPunchOnHoliday === true,
      blockPunchOnWeekend:  a.blockPunchOnWeekend === true,
      enforcePunchWindow:   a.enforcePunchWindow === true,
      // Geofence defaults to ENFORCED (true) - flips off only when the
      // admin explicitly sets it to false in Settings. This is the one
      // anti-fraud setting that ships on by default.
      enforceGeofence:      a.enforceGeofence !== false,
      autoClassifyLate:     a.autoClassifyLate === true,
      integrateLeaveRequests: a.integrateLeaveRequests !== false,
      // Lunch / break-skipped controls (Attendance v3)
      autoDeductLunch:              a.autoDeductLunch === true,
      lunchDeductionMinutes:        Number.isFinite(Number(a.lunchDeductionMinutes))        ? Number(a.lunchDeductionMinutes)        : 60,
      lunchDeductionThresholdHours: Number.isFinite(Number(a.lunchDeductionThresholdHours)) ? Number(a.lunchDeductionThresholdHours) : 6,
      flagBreakSkipped:             a.flagBreakSkipped === true,
      breakSkippedThresholdHours:   Number.isFinite(Number(a.breakSkippedThresholdHours))   ? Number(a.breakSkippedThresholdHours)   : 6,
      // Manual GPS escape hatches (Attendance v3)
      maxPunchAccuracyMeters:       Number.isFinite(Number(a.maxPunchAccuracyMeters))       ? Number(a.maxPunchAccuracyMeters)       : 1000,
      allowApproximatePunch:        a.allowApproximatePunch === true,
      ipLockSatisfiesGeofence:      a.ipLockSatisfiesGeofence === true,
      endOfDayCutoff:       typeof a.endOfDayCutoff === 'string' ? a.endOfDayCutoff : '23:55',
      office: a.office || undefined,
      site:   a.site   || undefined,
      _full:  a
    };
  } catch {
    return {
      ipLockEnabled: false,
      allowedOfficeNetworks: [],
      allowedRemoteNetworks: [],
      ipLockExemptUserIds: [],
      selfieRequired: false,           // fail-open if settings unavailable
      selfieMaxBytes: 50 * 1024,
      standardWorkdayHours: STANDARD_WORKDAY_HOURS,
      autoStatusEnabled: false,
      blockPunchOnHoliday: false,
      blockPunchOnWeekend: false,
      enforcePunchWindow: false,
      enforceGeofence: true,     // safe default: keep the anti-fraud guard on
      autoClassifyLate: false,
      integrateLeaveRequests: false,
      endOfDayCutoff: '23:55',
      autoDeductLunch: false,
      lunchDeductionMinutes: 60,
      lunchDeductionThresholdHours: 6,
      flagBreakSkipped: false,
      breakSkippedThresholdHours: 6,
      maxPunchAccuracyMeters: 1000,
      allowApproximatePunch: false,
      ipLockSatisfiesGeofence: false
    };
  }
}

/**
 * Build the `opts` object that recomputeFromTimeLogs() expects from a
 * loadAttendanceSettings() result. Centralised so every caller passes
 * the same shape - no chance of one path forgetting flagBreakSkipped
 * and producing inconsistent rows.
 */
function mathOptsFromSettings(settings) {
  return {
    autoDeductLunch:              settings.autoDeductLunch === true,
    lunchDeductionMinutes:        Number(settings.lunchDeductionMinutes)        || 60,
    lunchDeductionThresholdHours: Number(settings.lunchDeductionThresholdHours) || 6,
    flagBreakSkipped:             settings.flagBreakSkipped === true,
    breakSkippedThresholdHours:   Number(settings.breakSkippedThresholdHours)   || 6
  };
}

/* ------------------------------------------------------------------ *
 *  loadHolidaysForDate - fetches every Holiday matching the given
 *  calendar date (either same date, or recurring on that month/day).
 *  Returned to the caller as plain objects so attendanceSchedule.js
 *  can match scope/recurrence without a second query.
 * ------------------------------------------------------------------ */
async function loadHolidaysForDate(date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end   = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const rows = await Holiday.find({
    $or: [
      { date: { $gte: start, $lt: end } },
      { recurringYearly: true }
    ]
  }).lean();
  return rows;
}

/* ------------------------------------------------------------------ *
 *  hasApprovedLeaveOnDate - true if the employee has an approved
 *  Leave Request covering the given date. Status/field names match
 *  the existing LeaveRequest model.
 * ------------------------------------------------------------------ */
async function findApprovedLeaveOnDate(employeeId, date) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return LeaveRequest.findOne({
    employee: employeeId,
    status: 'approved',
    startDate: { $lte: day },
    endDate:   { $gte: day }
  }).lean();
}

/**
 * Geofence Auto-Detect for Site employees: walk every active assignedProject
 * with a populated siteLocationId, compute Haversine, return the closest
 * Location whose distance is within its own geofenceRadiusMeters.
 *
 * Returns one of:
 *   { project, location, distance }
 *   { error: { status, code, message, ... } }
 */
async function autoDetectSiteGeofence(employee, latNum, lngNum) {
  // Re-populate explicitly so siteLocationId is a Location doc, not just an ObjectId.
  await employee.populate({
    path: 'assignedProjects',
    select: 'name status siteLocationId',
    populate: { path: 'siteLocationId' }
  });

  const candidates = (employee.assignedProjects || [])
    .filter(p => p && p.status === 'active' && p.siteLocationId && p.siteLocationId.status === 'active');

  if (candidates.length === 0) {
    return { error: {
      status: 400,
      code: 'NO_ACTIVE_SITE',
      message: 'You have no active project with a configured site location. Ask your Project Engineer to assign one.'
    }};
  }

  let best = null;
  for (const project of candidates) {
    const loc = project.siteLocationId;
    const distance = haversineMeters({ lat: latNum, lng: lngNum }, { lat: loc.lat, lng: loc.lng });
    if (distance <= loc.geofenceRadiusMeters && (!best || distance < best.distance)) {
      best = { project, location: loc, distance };
    }
  }

  if (!best) {
    // Compute "closest miss" for a helpful error message
    let closest = null;
    for (const project of candidates) {
      const loc = project.siteLocationId;
      const d = haversineMeters({ lat: latNum, lng: lngNum }, { lat: loc.lat, lng: loc.lng });
      if (!closest || d < closest.distance) closest = { project, location: loc, distance: d };
    }
    return { error: {
      status: 403,
      code: 'NO_MATCHING_GEOFENCE',
      message: `You are not within any of your assigned project geofences. Closest is ${closest.location.name} at ${Math.round(closest.distance)}m (radius ${closest.location.geofenceRadiusMeters}m).`,
      closest: {
        projectId: closest.project._id,
        projectName: closest.project.name,
        locationName: closest.location.name,
        distanceMeters: Math.round(closest.distance),
        allowedRadiusMeters: closest.location.geofenceRadiusMeters
      }
    }};
  }

  return best;
}

/**
 * Office IP Lock check. Combines:
 *   1. Master switch - if ipLockEnabled is false, the lock is disabled entirely.
 *   2. User exemption - if the employee's userId is in ipLockExemptUserIds,
 *      they bypass the IP check (selfie + geofence still apply).
 *   3. Network match - req.ip is matched against the union of
 *      allowedOfficeNetworks and allowedRemoteNetworks[].cidr.
 *
 * Returns { ok, ip, lockDisabled?, exempted?, error? }.
 */
function checkOfficeIp(req, settings, employee) {
  const ip = req.ip;

  // 1. Master switch off → lock disabled
  if (!settings.ipLockEnabled) {
    return { ok: true, ip, lockDisabled: true };
  }

  // 2. User exemption (works only if the employee is linked to a user)
  if (employee && employee.userId) {
    const empUserId = String(employee.userId);
    if (settings.ipLockExemptUserIds.some(id => String(id) === empUserId)) {
      return { ok: true, ip, exempted: true };
    }
  }

  // 3. Network match - office allowlist + remote allowlist combined
  const officeCidrs = Array.isArray(settings.allowedOfficeNetworks) ? settings.allowedOfficeNetworks : [];
  const remoteCidrs = Array.isArray(settings.allowedRemoteNetworks)
    ? settings.allowedRemoteNetworks.map(r => r && r.cidr).filter(Boolean)
    : [];
  const combined = [...officeCidrs, ...remoteCidrs];

  // If the lock is enabled but no entries exist, treat it as misconfiguration
  // and fail CLOSED - the admin probably enabled it by mistake.
  if (combined.length === 0) {
    return { ok: false, ip, error: {
      status: 403,
      code: 'IP_LOCK_MISCONFIGURED',
      message: 'IP Lock is enabled but no networks are configured. Ask an admin to add allowed IPs or disable the lock in Settings → Attendance.'
    }};
  }

  if (!ipMatchesAny(ip, combined)) {
    return { ok: false, ip, error: {
      status: 403,
      code: 'IP_NOT_WHITELISTED',
      message: `This network (${ip}) is not on the office or remote allowlist. Connect to a permitted network, or ask HR to add this IP / mark you as exempt.`,
      ip
    }};
  }
  return { ok: true, ip };
}

/**
 * Resolve the geofence center for an existing open log. Used on punch-OUT to
 * validate the caller is still within the same site/office they punched in at.
 */
async function loadGeofenceCenterForLog(log) {
  if (!log || !log.referenceId || !log.referenceModel) {
    return { error: { status: 400, code: 'OPEN_LOG_BROKEN', message: 'Open log has no referenced location.' } };
  }
  if (log.referenceModel === 'Location') {
    const loc = await Location.findById(log.referenceId);
    if (!loc) return { error: { status: 400, code: 'OPEN_LOG_BROKEN', message: 'Open log references a deleted location.' } };
    return { location: loc };
  }
  if (log.referenceModel === 'Project') {
    const project = await Project.findById(log.referenceId).populate('siteLocationId');
    if (!project || !project.siteLocationId) {
      return { error: { status: 400, code: 'OPEN_LOG_BROKEN', message: 'Open log references a project with no site location.' } };
    }
    return { location: project.siteLocationId, project };
  }
  return { error: { status: 400, code: 'OPEN_LOG_BROKEN', message: `Unknown referenceModel "${log.referenceModel}".` } };
}

/**
 * Persist a selfie (if provided) and return its public URL. Honours
 * settings.attendance.selfieRequired: rejects when required and missing.
 * Returns an `errorResponse` object instead of throwing, for inline mapping.
 */
async function persistSelfie(req, employeeId, suffix, settings) {
  const base64 = req.body?.selfieBase64;
  if (!base64) {
    if (settings.selfieRequired) {
      return { error: { status: 400, code: 'SELFIE_MISSING', message: 'A selfie is required for every punch. Enable camera access.' } };
    }
    return { url: null };
  }
  try {
    const url = await saveSelfie({
      base64,
      employeeId: String(employeeId),
      suffix,
      maxBytes: settings.selfieMaxBytes
    });
    return { url };
  } catch (err) {
    if (err instanceof SelfieStorageError) {
      return { error: { status: 400, code: err.code, message: err.message } };
    }
    throw err;
  }
}

router.post('/punch', auth, async (req, res) => {
  try {
    const body = req.body || {};
    const action = String(body.action || '').toUpperCase();
    if (action !== 'IN' && action !== 'OUT') {
      return res.status(400).json({ code: 'BAD_ACTION', message: 'action must be "IN" or "OUT".' });
    }
    const { latNum, lngNum, error: coordErr } = validateLatLng(body.lat, body.lng);
    if (coordErr) return res.status(400).json({ code: 'BAD_COORDINATES', message: coordErr });

    const accuracy = Number.isFinite(Number(body.accuracyMeters)) ? Number(body.accuracyMeters) : undefined;
    // `approximate: true` is an explicit opt-in from the client when the
    // worker chose to use the "Punch with approximate position" secondary
    // button. It bypasses the maxPunchAccuracyMeters check below but is
    // recorded on the row so HR knows the location proof is weaker.
    const approximate = body.approximate === true;
    const requestedLogType = body.logType ? String(body.logType) : null;

    // Workers cannot self-mark Travel - that's supervisor-insertion only.
    if (requestedLogType === 'Travel') {
      return res.status(403).json({
        code: 'TRAVEL_NOT_SELF_SERVICE',
        message: 'Travel logs are added by your supervisor, not via self-punch.'
      });
    }

    const employee = await Employee.findOne({ userId: req.user.userId });
    if (!employee) return res.status(403).json({ code: 'NO_EMPLOYEE_PROFILE', message: 'No employee profile is linked to this user.' });
    if (employee.status !== 'active') return res.status(403).json({ code: 'EMPLOYEE_INACTIVE', message: 'Employee is not active.' });

    const settings = await loadAttendanceSettings();
    const today = normalizeDate(new Date());
    const now = new Date();
    const callerWeight = effectiveWeight(req);
    const isOfficeEmployee = employee.category === 'office';

    /* -------- Accuracy gate (configurable, admin-tunable) --------
     * The only "magic number" we expose to admins. Normally rejects
     * punches whose GPS accuracy is worse than the configured cap,
     * preventing low-confidence rows from polluting payroll.
     *
     * Bypassed when the client explicitly opts into `approximate`
     * (the "Punch with approximate position" secondary flow). The
     * `approximate: true` flag is recorded on the row so HR can see
     * the location proof is weaker than usual.
     *
     * `allowApproximatePunch` must be enabled in Settings for the
     * client even to offer the secondary button - server still
     * validates it here as defence in depth.
     * ------------------------------------------------------------ */
    if (Number.isFinite(accuracy) && accuracy > settings.maxPunchAccuracyMeters) {
      if (!approximate || !settings.allowApproximatePunch) {
        return res.status(400).json({
          code: 'LOW_ACCURACY',
          message: `GPS accuracy (±${Math.round(accuracy)}m) is worse than the configured limit (${settings.maxPunchAccuracyMeters}m). Move to an open area and try again, or ask HR to enable approximate-position punches.`,
          accuracyMeters: Math.round(accuracy),
          maxAcceptableMeters: settings.maxPunchAccuracyMeters,
          approximateAllowed: settings.allowApproximatePunch === true
        });
      }
      // Approximate punch explicitly opted into - allowed, but flagged.
    }

    /* -------- Attendance v3: holiday / weekend / window checks -------- *
     *  Each individual toggle (blockPunchOnHoliday, blockPunchOnWeekend,
     *  enforcePunchWindow) fires on its own - they no longer require the
     *  autoStatusEnabled master. Operators expect "if I tick blockPunchOnHoliday
     *  the punch is blocked on holidays" without also having to flip the
     *  master switch. The master still controls the nightly status sweep
     *  and leave→attendance fan-out (those genuinely depend on the engine).
     * ----------------------------------------------------------------- */
    let v3Schedule = null;
    let v3Holiday  = null;

    if (settings.blockPunchOnHoliday) {
      const holidays = await loadHolidaysForDate(today);
      v3Holiday = findHolidayFor(employee, today, holidays);
      if (v3Holiday) {
        return res.status(403).json({
          code: 'HOLIDAY_BLOCKED',
          message: `Today is a holiday: ${v3Holiday.name}. Punch is disabled. Contact HR for exceptions.`,
          holiday: { name: v3Holiday.name, scope: v3Holiday.scope, paid: v3Holiday.paid }
        });
      }
    }

    if (settings.blockPunchOnWeekend || settings.enforcePunchWindow || (settings.autoStatusEnabled && settings.autoClassifyLate)) {
      v3Schedule = pickSchedule(employee, { attendance: settings._full });

      if (settings.blockPunchOnWeekend && action === 'IN' && !isWorkday(v3Schedule, today)) {
        return res.status(403).json({
          code: 'WEEKEND_BLOCKED',
          message: 'Today is not a working day per the configured schedule.',
          schedule: { kind: v3Schedule.kind, workdays: v3Schedule.workdays }
        });
      }

      if (settings.enforcePunchWindow && action === 'IN') {
        const cls = classifyPunchIn(now, v3Schedule, { enforce: true });
        if (!cls.allowed) {
          return res.status(403).json({
            code: 'TOO_EARLY',
            message: cls.message,
            earliestPunchIn: v3Schedule.earliestPunchIn,
            scheduleStart: v3Schedule.startTime
          });
        }
      }
    }

    const inCoordinates = { lat: latNum, lng: lngNum, accuracyMeters: accuracy, capturedAt: now };

    let row = await Attendance.findOne({ employee: employee._id, date: today });

    /* ---------------------- PUNCH IN ---------------------- */
    if (action === 'IN') {
      // Geofence Trap - reject if a previous log is still open.
      if (row) {
        const open = findOpenLog(row.timeLogs || []);
        if (open) {
          return res.status(403).json({
            code: 'OPEN_LOG_EXISTS',
            message: 'You already have an open punch. Punch OUT before starting a new log.',
            openLog: {
              _id: open._id,
              type: open.type,
              referenceId: open.referenceId,
              timeIn: open.timeIn
            }
          });
        }
      }

      // ----- Resolve referenceId / location for this punch -----
      // Universal geofence: EVERY employee - including Office - has their
      // GPS validated against a real Location. Office employees may also be
      // subject to the IP Lock as an additional layer (see below).
      let resolvedLocation = null;
      let resolvedProject = null;
      let logType, referenceModel, referenceId;
      let inIpAddress;

      // The client can pre-select either a Project or a specific Location
      // (base / additional / group-member) from the picker UI.
      const requestedProjectId  = body.projectId  ? String(body.projectId)  : null;
      const requestedLocationId = body.locationId ? String(body.locationId) : null;

      if (requestedProjectId) {
        // ---- Explicit project pick ----
        const project = await Project.findById(requestedProjectId).populate('siteLocationId');
        if (!project) {
          return res.status(400).json({ code: 'PROJECT_NOT_FOUND', message: 'The selected project no longer exists.' });
        }
        const assignedIds = (employee.assignedProjects || []).map(p => String(p._id || p));
        if (!assignedIds.includes(String(project._id))) {
          return res.status(403).json({ code: 'PROJECT_NOT_ASSIGNED', message: 'You are not assigned to that project.' });
        }
        if (project.status !== 'active' || !project.siteLocationId || project.siteLocationId.status !== 'active') {
          return res.status(400).json({ code: 'PROJECT_INACTIVE', message: 'That project or its site location is not active.' });
        }
        resolvedProject  = project;
        resolvedLocation = project.siteLocationId;
        logType          = 'Project';
        referenceModel   = 'Project';
        referenceId      = project._id;
      } else if (requestedLocationId) {
        // ---- Explicit Location pick (base / additional / group member) ----
        // Validate that the location is one of the employee's authorized targets.
        const employeeLocationIds = new Set();
        if (employee.baseLocationId) employeeLocationIds.add(String(employee.baseLocationId._id || employee.baseLocationId));
        for (const l of (employee.additionalLocationIds || [])) {
          employeeLocationIds.add(String(l._id || l));
        }
        if (employee.locationGroupId && employee.locationGroupId.locationIds) {
          for (const l of employee.locationGroupId.locationIds) {
            employeeLocationIds.add(String(l._id || l));
          }
        }
        if (!employeeLocationIds.has(requestedLocationId)) {
          return res.status(403).json({
            code: 'LOCATION_NOT_ASSIGNED',
            message: 'You are not authorized to punch in at that location.'
          });
        }
        const loc = await Location.findById(requestedLocationId);
        if (!loc) {
          return res.status(400).json({ code: 'LOCATION_NOT_FOUND', message: 'The selected location no longer exists.' });
        }
        if (loc.status !== 'active') {
          return res.status(400).json({ code: 'LOCATION_INACTIVE', message: 'That location is not active.' });
        }
        resolvedLocation = loc;
        // Office category → Office log; other categories → still Office log
        // (a base/additional/group punch is conceptually an "Office" type).
        logType        = 'Office';
        referenceModel = 'Location';
        referenceId    = loc._id;
      } else if (isOfficeEmployee) {
        // ---- Office path: base location is the geofence anchor ----
        if (!employee.baseLocationId) {
          return res.status(400).json({
            code: 'NO_BASE_LOCATION',
            message: 'No base location is configured for this employee. Ask HR to set one.'
          });
        }
        resolvedLocation = await Location.findById(employee.baseLocationId);
        if (!resolvedLocation || resolvedLocation.status !== 'active') {
          return res.status(400).json({ code: 'BASE_LOCATION_INACTIVE', message: 'Your base location is not active.' });
        }
        logType        = 'Office';
        referenceModel = 'Location';
        referenceId    = resolvedLocation._id;
      } else {
        // ---- Site path: try auto-detect across assigned projects first,
        // fall back to baseLocation if no project matches. ----
        const detect = await autoDetectSiteGeofence(employee, latNum, lngNum);
        if (detect.error && detect.error.code === 'NO_ACTIVE_SITE' && employee.baseLocationId) {
          // No project sites at all → use base
          const baseLoc = await Location.findById(employee.baseLocationId);
          if (baseLoc && baseLoc.status === 'active') {
            resolvedLocation = baseLoc;
            logType          = 'Office';     // base location punches log as Office type
            referenceModel   = 'Location';
            referenceId      = baseLoc._id;
          } else {
            return res.status(detect.error.status).json(detect.error);
          }
        } else if (detect.error) {
          return res.status(detect.error.status).json(detect.error);
        } else {
          resolvedLocation = detect.location;
          resolvedProject  = detect.project;
          logType          = 'Project';
          referenceModel   = 'Project';
          referenceId      = resolvedProject._id;
        }
      }

      // ---- IP Lock check (Office-only, runs first so its result can
      // satisfy the geofence when configured) ----
      // The order matters: when `ipLockSatisfiesGeofence` is enabled,
      // an office worker whose IP matches the allowlist is exempt from
      // the geofence rejection below. Distance is still recorded.
      let ipSatisfied = false;
      if (isOfficeEmployee && logType === 'Office') {
        const ipCheck = checkOfficeIp(req, settings, employee);
        if (!ipCheck.ok) return res.status(ipCheck.error.status).json(ipCheck.error);
        inIpAddress = ipCheck.ip;
        // ipCheck.ok=true covers three states: lock disabled, user exempt,
        // or IP matched. For "IP satisfies geofence" we only want the
        // "IP matched against a real allowlist" case - not "lock disabled".
        ipSatisfied = ipCheck.ok && !ipCheck.lockDisabled;
      }

      // ---- Universal GPS geofence check ----
      // Skipped when any of these are true:
      //   - settings.enforceGeofence is false (org-wide override)
      //   - resolvedLocation.noGeofence is true (per-location exemption)
      //   - settings.ipLockSatisfiesGeofence AND ipSatisfied
      //     (office worker on the office Wi-Fi has already proven location)
      // Distance is recorded on the row regardless, for audit.
      const distance = haversineMeters(
        { lat: latNum, lng: lngNum },
        { lat: resolvedLocation.lat, lng: resolvedLocation.lng }
      );
      const geofenceOff =
        settings.enforceGeofence === false
        || resolvedLocation.noGeofence
        || (settings.ipLockSatisfiesGeofence && ipSatisfied);
      if (!geofenceOff && distance > resolvedLocation.geofenceRadiusMeters) {
        return res.status(403).json({
          code: 'OUT_OF_GEOFENCE',
          message: `You are ${Math.round(distance)}m from ${resolvedLocation.name} — outside the ${resolvedLocation.geofenceRadiusMeters}m geofence.`,
          distanceMeters: Math.round(distance),
          allowedRadiusMeters: resolvedLocation.geofenceRadiusMeters,
          locationName: resolvedLocation.name
        });
      }

      // Persist selfie (if required / provided)
      const selfieResult = await persistSelfie(req, employee._id, 'in', settings);
      if (selfieResult.error) return res.status(selfieResult.error.status).json(selfieResult.error);

      const newLog = {
        type: logType,
        referenceModel,
        referenceId,
        timeIn: now,
        timeOut: null,
        inCoordinates,
        inSelfieUrl: selfieResult.url || undefined,
        inIpAddress,
        inDistanceMeters: Math.round(distance)
      };

      // Attendance v3 - late classification. Stamp lateMinutes on the row
      // when autoClassifyLate is on; the status engine uses it to decide
      // between 'present' and 'late'.
      let v3LateMinutes;
      let v3RowStatus = 'present';
      if (settings.autoStatusEnabled && settings.autoClassifyLate && v3Schedule) {
        const cls = classifyPunchIn(now, v3Schedule, { enforce: false });
        v3LateMinutes = cls.minutes;
        if (cls.minutes > (v3Schedule.graceMinutes || 0)) {
          v3RowStatus = 'late';
        }
      }

      if (!row) {
        row = await Attendance.create({
          employee: employee._id,
          date: today,
          source: logType === 'Office' ? 'office' : 'site',
          status: v3RowStatus,
          entryMethod: 'GPS_PUNCH',
          markedBy: req.user.userId,
          createdBy: req.user.userId,
          // Legacy projections - first log of the day populates these for backward compat
          timeIn: now,
          punchLocation: inCoordinates,
          effectiveLocationId: resolvedLocation._id,
          distanceMeters: Math.round(distance),
          lockedByRoleWeight: callerWeight,
          timeLogs: [newLog],
          // approximate flag is sticky for the day - once any punch on the
          // row used approximate position, the row is marked approximate.
          ...(approximate ? { approximate: true } : {}),
          ...(Number.isFinite(v3LateMinutes) ? { lateMinutes: v3LateMinutes } : {})
        });
      } else {
        // Hierarchy lock - block self-punch only if locked by a HIGHER-ranked actor.
        if (!canOverwrite(req, row.lockedByRoleWeight)) {
          return res.status(403).json({
            code: 'locked',
            message: 'Today\'s entry is locked by a higher-ranked reviewer. Ask them to make changes.',
            lockedByRoleWeight: row.lockedByRoleWeight
          });
        }
        row.timeLogs.push(newLog);
        row.entryMethod = 'GPS_PUNCH';
        row.markedBy = req.user.userId;
        row.punchLocation = inCoordinates;
        row.effectiveLocationId = resolvedLocation._id;
        row.distanceMeters = Math.round(distance);
        row.lockedByRoleWeight = Math.max(row.lockedByRoleWeight || 0, callerWeight);
        // First-of-day projection only - don't overwrite timeIn if already set
        if (!row.timeIn) row.timeIn = now;
        // approximate is sticky: if ANY punch on the row was approximate,
        // the row stays flagged. Doesn't unset on a later precise punch.
        if (approximate) row.approximate = true;
        // Attendance v3 - only set lateMinutes for the FIRST punch of the day.
        // Subsequent re-punches keep the original arrival classification.
        if (Number.isFinite(v3LateMinutes) && !Number.isFinite(row.lateMinutes)) {
          row.lateMinutes = v3LateMinutes;
          if (v3RowStatus === 'late' && row.status !== 'late') row.status = 'late';
        }
        await row.save();
      }

      await audit('attendance_punched_in', row._id, req.user.userId, {
        employee: employee._id,
        type: logType,
        locationName: resolvedLocation.name,
        projectName: resolvedProject?.name,
        distanceMeters: Math.round(distance),
        ip: inIpAddress
      });

      return res.status(201).json({
        ...row.toObject(),
        locationName: resolvedLocation.name,
        projectName: resolvedProject?.name
      });
    }

    /* ---------------------- PUNCH OUT ---------------------- */
    // action === 'OUT'
    if (!row) {
      return res.status(400).json({ code: 'NO_OPEN_LOG', message: 'No attendance row exists for today — you haven\'t punched in.' });
    }
    const open = findOpenLog(row.timeLogs || []);
    if (!open) {
      return res.status(400).json({ code: 'NO_OPEN_LOG', message: 'No open punch found. Punch IN first.' });
    }
    if (!canOverwrite(req, row.lockedByRoleWeight)) {
      return res.status(403).json({
        code: 'locked',
        message: 'Today\'s entry is locked by a higher-ranked reviewer. Ask them to close this log manually.',
        lockedByRoleWeight: row.lockedByRoleWeight
      });
    }

    const center = await loadGeofenceCenterForLog(open);
    if (center.error) return res.status(center.error.status).json(center.error);

    const distance = haversineMeters(
      { lat: latNum, lng: lngNum },
      { lat: center.location.lat, lng: center.location.lng }
    );

    // IP Lock - Office-CATEGORY employees only, never Site workers.
    // Bug: earlier this was gated only by `open.type === 'Office'`, which
    // also fired for a Site worker whose punch-in fell back to their base
    // location (logType becomes 'Office' in that path). Result: site
    // workers got IP-rejected on punch-out even though IP Lock is meant
    // for office staff. Mirror the punch-IN guard which checks both.
    let outIpAddress;
    let outIpSatisfied = false;
    if (isOfficeEmployee && open.type === 'Office') {
      const ipCheck = checkOfficeIp(req, settings, employee);
      if (!ipCheck.ok) return res.status(ipCheck.error.status).json(ipCheck.error);
      outIpAddress = ipCheck.ip;
      outIpSatisfied = ipCheck.ok && !ipCheck.lockDisabled;
    }

    // Geofence gating: skip when org-wide override, per-location exemption,
    // or IP-satisfies-geofence with a real IP match. Distance is still
    // recorded for audit either way.
    const outGeofenceOff =
      settings.enforceGeofence === false
      || center.location.noGeofence
      || (settings.ipLockSatisfiesGeofence && outIpSatisfied);
    if (!outGeofenceOff && distance > center.location.geofenceRadiusMeters) {
      // The Geofence Mismatch - they left the site without punching out.
      return res.status(403).json({
        code: 'OUT_OF_GEOFENCE',
        message: 'Geofence mismatch. Missing Punch-Out. Contact Supervisor.',
        distanceMeters: Math.round(distance),
        allowedRadiusMeters: center.location.geofenceRadiusMeters,
        locationName: center.location.name,
        openLog: { _id: open._id, type: open.type, timeIn: open.timeIn }
      });
    }

    const selfieResult = await persistSelfie(req, employee._id, 'out', settings);
    if (selfieResult.error) return res.status(selfieResult.error.status).json(selfieResult.error);

    // Mutate the open log in place - Mongoose tracks the change.
    open.timeOut = now;
    open.outCoordinates = { lat: latNum, lng: lngNum, accuracyMeters: accuracy, capturedAt: now };
    open.outSelfieUrl = selfieResult.url || undefined;
    open.outIpAddress = outIpAddress;
    open.outDistanceMeters = Math.round(distance);

    // Universal Math - recompute root projections from the full timeLogs.
    const math = recomputeFromTimeLogs(
      row.timeLogs,
      settings.standardWorkdayHours,
      mathOptsFromSettings(settings)
    );
    const changes = [];
    if (Number(row.regularHours) !== math.regularHours) {
      changes.push({ field: 'regularHours', from: row.regularHours, to: math.regularHours });
    }
    if (Number(row.otHours) !== math.otHours) {
      changes.push({ field: 'otHours', from: row.otHours, to: math.otHours });
    }
    if (Number(row.breakMinutes) !== math.breakMinutes) {
      changes.push({ field: 'breakMinutes', from: row.breakMinutes, to: math.breakMinutes });
    }
    if (Boolean(row.breakSkipped) !== Boolean(math.breakSkipped)) {
      changes.push({ field: 'breakSkipped', from: row.breakSkipped, to: math.breakSkipped });
    }
    changes.push({ field: 'timeLogs.timeOut', from: null, to: now });

    row.timeOut = math.timeOut;
    row.regularHours = math.regularHours;
    row.otHours = math.otHours;
    row.breakMinutes = math.breakMinutes;
    row.breakSkipped = math.breakSkipped;
    row.entryMethod = 'GPS_PUNCH';
    row.markedBy = req.user.userId;
    row.punchLocation = open.outCoordinates;
    row.effectiveLocationId = center.location._id;
    row.distanceMeters = Math.round(distance);
    row.lockedByRoleWeight = Math.max(row.lockedByRoleWeight || 0, callerWeight);
    // approximate is sticky across IN + OUT punches on the same row.
    if (approximate) row.approximate = true;
    row.edits.push({ editedBy: req.user.userId, editedAt: now, changes });

    await row.save();
    await audit('attendance_punched_out', row._id, req.user.userId, {
      employee: employee._id,
      logId: open._id,
      type: open.type,
      locationName: center.location.name,
      distanceMeters: Math.round(distance),
      regularHours: math.regularHours,
      otHours: math.otHours,
      breakMinutes: math.breakMinutes
    });

    return res.json({
      ...row.toObject(),
      locationName: center.location.name,
      closedLog: { _id: open._id }
    });
  } catch (err) {
    console.error('Error in /attendance/punch:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: 'Server error' });
  }
});

module.exports = router;
