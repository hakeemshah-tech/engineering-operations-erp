const express = require('express');
const jwt = require('jsonwebtoken');
const LeaveRequest = require('../models/LeaveRequest');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const SystemSettings = require('../models/SystemSettings');
const GeneralAuditLog = require('../models/GeneralAuditLog');

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

async function audit(action, entityId, userId, details = {}) {
  try {
    await GeneralAuditLog.create({
      action,
      module: 'hr_management',
      entityType: 'leave_request',
      entityId,
      performedBy: userId,
      performedAt: new Date(),
      details,
      success: true
    });
  } catch (err) {
    console.error('[leave audit]', err.message);
  }
}

function normalizeDate(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function eachDayBetween(start, end) {
  const out = [];
  const s = normalizeDate(start);
  const e = normalizeDate(end);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    out.push(new Date(d));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 *  Sync Attendance with an approved/cancelled LeaveRequest.
 *
 *  approve  → for each covered date, upsert an Attendance row with
 *             status='leave'. Conflict policy is "punch wins":
 *             if the day already has any timeLogs (employee did work),
 *             we DO NOT overwrite status; we only stamp leaveRequestId
 *             so HR can see the overlap and decide how to credit it.
 *
 *  cancel/reject → for each covered date that we marked as 'leave',
 *             clear leaveRequestId and revert status to 'not_marked'.
 *             Days where the employee actually worked are untouched.
 *
 *  Both paths short-circuit when `settings.attendance.integrateLeaveRequests`
 *  is false - admins can opt out of automatic sync without losing the
 *  Leave Request workflow itself.
 * ------------------------------------------------------------------ */
async function syncAttendanceForLeaveApproval(request, userId) {
  try {
    const s = await SystemSettings.getSettings();
    const a = s?.attendance?.toObject?.() || s?.attendance || {};
    if (a.integrateLeaveRequests === false) return { skipped: true };
    if (a.autoStatusEnabled !== true)        return { skipped: true };

    const days = eachDayBetween(request.startDate, request.endDate);
    let created = 0, marked = 0, conflicts = 0;

    // Half-day leaves only ever cover a single day; flag the row so the
    // attendance grid can render "Half Day" instead of "Leave". The worker
    // is still expected to punch for the other half, and the punch-wins
    // policy continues to apply.
    const leaveStatus = request.halfDay ? 'half_day' : 'leave';

    for (const day of days) {
      const date = normalizeDate(day);
      const existing = await Attendance.findOne({ employee: request.employee, date });
      if (!existing) {
        await Attendance.create({
          employee: request.employee,
          date,
          source: 'office',
          status: leaveStatus,
          entryMethod: 'manual',
          createdBy: userId,
          leaveRequestId: request._id
        });
        created += 1;
        continue;
      }
      // Existing row - punch wins.
      const hasLogs = Array.isArray(existing.timeLogs) && existing.timeLogs.length > 0;
      if (hasLogs) {
        existing.leaveRequestId = request._id;
        await existing.save();
        conflicts += 1;
        continue;
      }
      existing.status = leaveStatus;
      existing.leaveRequestId = request._id;
      await existing.save();
      marked += 1;
    }

    return { created, marked, conflicts };
  } catch (err) {
    console.error('[leave→attendance sync]', err.message);
    return { error: err.message };
  }
}

async function syncAttendanceForLeaveCancel(request) {
  try {
    const rows = await Attendance.find({ leaveRequestId: request._id });
    let cleared = 0;
    for (const row of rows) {
      const hasLogs = Array.isArray(row.timeLogs) && row.timeLogs.length > 0;
      row.leaveRequestId = undefined;
      // Revert both auto-marked variants. 'half_day' is the new variant for
      // half-day requests; pre-half_day rows still come through as 'leave'.
      if (!hasLogs && (row.status === 'leave' || row.status === 'half_day')) {
        row.status = 'not_marked';
      }
      await row.save();
      cleared += 1;
    }
    return { cleared };
  } catch (err) {
    console.error('[leave→attendance revert]', err.message);
    return { error: err.message };
  }
}

// GET list
/**
 * Returns the list of employees the caller can submit leave for. Matches
 * the create-rule:
 *   HR / Manager / Admin → all active employees
 *   PE / SS / Sup        → workers (and supervisors if PE) on their projects
 *                          PLUS themselves
 *   anyone else          → just themselves
 */
router.get('/eligible-employees', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    const me = await Employee.findOne({ userId: req.user.userId })
      .select('_id employeeId fullName category status');

    if (hasHRAccess(roles)) {
      const all = await Employee.find({ status: 'active' })
        .select('_id employeeId fullName category status photoUrl')
        .sort({ fullName: 1 });
      return res.json(all);
    }

    const isPe  = roles.includes('project_engineer');
    const isSup = roles.includes('site_supervisor') || roles.includes('supervisor');
    if (!isPe && !isSup) {
      return res.json(me ? [me] : []);
    }

    const projectQuery = { $or: [] };
    if (isPe)  projectQuery.$or.push({ assignedProjectEngineer: req.user.userId });
    if (isSup) projectQuery.$or.push({ supervisors: req.user.userId });
    const Project = require('../models/Project');
    const myProjects = await Project.find(projectQuery).select('_id workers supervisors');
    const myProjectIds = myProjects.map(p => p._id);
    const allowedUserIds = new Set();
    for (const p of myProjects) {
      for (const w of (p.workers || [])) allowedUserIds.add(String(w));
      if (isPe) for (const s of (p.supervisors || [])) allowedUserIds.add(String(s));
    }

    const ors = [];
    if (allowedUserIds.size > 0) ors.push({ userId: { $in: Array.from(allowedUserIds) } });
    if (myProjectIds.length > 0) {
      // PE → any category (so site supervisors with category='office' still
      // appear); supervisor-likes → site_* only (peers excluded).
      const second = { assignedProjects: { $in: myProjectIds } };
      if (!isPe) {
        second.category = { $in: ['site_company_visa', 'site_mission_visa'] };
      }
      ors.push(second);
    }
    if (ors.length === 0 && !me) return res.json([]);

    const emps = ors.length > 0
      ? await Employee.find({ status: 'active', $or: ors })
          .select('_id employeeId fullName category status photoUrl')
          .sort({ fullName: 1 })
      : [];
    // Always include self.
    const seen = new Set(emps.map(e => String(e._id)));
    if (me && !seen.has(String(me._id))) emps.unshift(me);
    res.json(emps);
  } catch (error) {
    console.error('Error fetching eligible employees:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    const filter = {};
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
    if (req.query.employee) filter.employee = req.query.employee;

    if (!hasHRAccess(roles)) {
      const me = await Employee.findOne({ userId: req.user.userId });
      const isPe  = roles.includes('project_engineer');
      const isSup = roles.includes('site_supervisor') || roles.includes('supervisor');
      if (isPe || isSup) {
        // PE/SS/Sup can see leave requests for employees on their projects,
        // plus their own. Scope matches the create rule.
        const projectQuery = { $or: [] };
        if (isPe)  projectQuery.$or.push({ assignedProjectEngineer: req.user.userId });
        if (isSup) projectQuery.$or.push({ supervisors: req.user.userId });
        const Project = require('../models/Project');
        const myProjects = await Project.find(projectQuery).select('_id workers supervisors');
        const allowedUserIds = new Set();
        const myProjectIds = myProjects.map(p => p._id);
        for (const p of myProjects) {
          for (const w of (p.workers || [])) allowedUserIds.add(String(w));
          if (isPe) for (const s of (p.supervisors || [])) allowedUserIds.add(String(s));
        }
        // Resolve to Employee IDs (via User-link OR Employee.assignedProjects)
        const empByUser = allowedUserIds.size > 0
          ? await Employee.find({ userId: { $in: Array.from(allowedUserIds) } }).select('_id')
          : [];
        const empByProj = myProjectIds.length > 0
          ? await Employee.find({
              assignedProjects: { $in: myProjectIds },
              // PE → any category (covers office-category site supervisors);
              // SS/Sup → site_* only (peer supervisors excluded by category).
              ...(isPe ? {} : { category: { $in: ['site_company_visa', 'site_mission_visa'] } })
            }).select('_id')
          : [];
        const empIds = new Set([
          ...empByUser.map(e => String(e._id)),
          ...empByProj.map(e => String(e._id))
        ]);
        if (me) empIds.add(String(me._id));   // also their own
        if (empIds.size === 0) return res.json([]);
        filter.employee = { $in: Array.from(empIds) };
      } else {
        if (!me) return res.json([]);
        filter.employee = me._id;
      }
    }

    const requests = await LeaveRequest.find(filter)
      .populate('employee', 'employeeId fullName category email phone userId')
      .populate('appliedBy', 'name email')
      .populate('createdBy', 'name email')
      .populate('approvalChain.approver', 'name email')
      .populate('reversal.requestedBy', 'name email')
      .populate('reversal.approvalChain.approver', 'name email')
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    console.error('Error fetching leave requests:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET single
router.get('/:id', auth, async (req, res) => {
  try {
    const request = await LeaveRequest.findById(req.params.id)
      .populate('employee', 'employeeId fullName category email phone userId')
      .populate('appliedBy', 'name email')
      .populate('createdBy', 'name email')
      .populate('approvalChain.approver', 'name email')
      .populate('reversal.requestedBy', 'name email')
      .populate('reversal.approvalChain.approver', 'name email');
    if (!request) return res.status(404).json({ message: 'Not found.' });

    const roles = req.user.roles || [];
    const isOwn = request.employee?.userId?.toString() === req.user.userId;
    if (!hasHRAccess(roles) && !isOwn) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    res.json(request);
  } catch (error) {
    console.error('Error fetching leave request:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create
router.post('/', auth, async (req, res) => {
  try {
    const { employee, leaveType, startDate, endDate, reason, halfDay, halfDayPeriod } = req.body || {};
    if (!employee || !leaveType || !startDate || !endDate) {
      return res.status(400).json({ message: 'employee, leaveType, startDate, endDate are required.' });
    }
    if (new Date(endDate) < new Date(startDate)) {
      return res.status(400).json({ message: 'endDate cannot be before startDate.' });
    }

    const roles = req.user.roles || [];
    const emp = await Employee.findById(employee);
    if (!emp) return res.status(400).json({ message: 'Employee not found.' });

    // Self-leave is always allowed. HR/Manager/Admin can submit for anyone.
    // PE/SS/Sup can submit for employees on projects they own - RBAC scope
    // matches the attendance-marking rule (PE may submit for workers AND
    // supervisors; SS/Sup may only submit for workers).
    const isOwn = emp.userId?.toString() === req.user.userId;
    if (!hasHRAccess(roles) && !isOwn) {
      const isPe  = roles.includes('project_engineer');
      const isSup = roles.includes('site_supervisor') || roles.includes('supervisor');
      if (!isPe && !isSup) {
        return res.status(403).json({ message: 'You can only submit leave for yourself.' });
      }
      const projectQuery = { $or: [] };
      if (isPe)  projectQuery.$or.push({ assignedProjectEngineer: req.user.userId });
      if (isSup) projectQuery.$or.push({ supervisors: req.user.userId });
      const Project = require('../models/Project');
      const myProjects = await Project.find(projectQuery).select('workers supervisors');
      const allowedUserIds = new Set();
      for (const p of myProjects) {
        for (const w of (p.workers || [])) allowedUserIds.add(String(w));
        if (isPe) for (const s of (p.supervisors || [])) allowedUserIds.add(String(s));
      }
      const targetUserIdStr = String(emp.userId || '');
      const okByUser = targetUserIdStr && allowedUserIds.has(targetUserIdStr);
      // Fallback: target Employee.assignedProjects overlaps with our projects
      // and target has site_* category (worker or supervisor).
      let okByEmp = false;
      if (!okByUser && ['site_company_visa', 'site_mission_visa'].includes(emp.category)) {
        const myProjectIds = myProjects.map(p => String(p._id));
        const empProjectIds = (emp.assignedProjects || []).map(p => String(p?._id || p));
        okByEmp = empProjectIds.some(pid => myProjectIds.includes(pid));
      }
      if (!okByUser && !okByEmp) {
        return res.status(403).json({ message: 'You can only submit leave for employees on your projects.' });
      }
    }

    const request = await LeaveRequest.create({
      employee,
      leaveType,
      startDate,
      endDate,
      reason,
      halfDay: halfDay === true,
      halfDayPeriod: halfDay === true && (halfDayPeriod === 'first' || halfDayPeriod === 'second')
        ? halfDayPeriod
        : (halfDay === true ? 'first' : undefined),
      status: 'pending',
      appliedBy: req.user.userId,
      createdBy: req.user.userId,
      approvalChain: [
        { role: 'hr', status: 'pending' },
        { role: 'manager', status: 'pending' }
      ]
    });

    await audit('leave_requested', request._id, req.user.userId, { employee, leaveType, days: request.totalDays });
    res.status(201).json(request);
  } catch (error) {
    console.error('Error creating leave request:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// POST approve
router.post('/:id/approve', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const request = await LeaveRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Not found.' });
    if (request.status !== 'pending') {
      return res.status(400).json({ message: `Cannot approve a ${request.status} request.` });
    }

    const myRole = roles.includes('manager') || roles.includes('admin') ? 'manager' : 'hr';
    const body = req.body || {};
    const step = request.approvalChain.find(s => s.role === myRole);
    if (!step) {
      return res.status(400).json({ message: 'Your role is not part of this leave\'s approval chain.' });
    }
    if (step.status !== 'pending') {
      return res.status(400).json({
        code: 'STEP_ALREADY_ACTIONED',
        message: `Your step in this chain is already ${step.status}.`
      });
    }
    step.approver = req.user.userId;
    step.status = 'approved';
    step.actedAt = new Date();
    step.comments = body.comments || '';

    const allApproved = request.approvalChain.every(s => s.status === 'approved');
    if (allApproved) request.status = 'approved';

    await request.save();
    await audit('leave_approved', request._id, req.user.userId, { role: myRole, finalised: allApproved });

    // When the chain is fully approved, fan out attendance rows.
    if (allApproved) {
      const sync = await syncAttendanceForLeaveApproval(request, req.user.userId);
      await audit('leave_attendance_synced', request._id, req.user.userId, sync || {});
    }

    res.json(request);
  } catch (error) {
    console.error('Error approving leave:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST reject
router.post('/:id/reject', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const request = await LeaveRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Not found.' });
    if (request.status !== 'pending') {
      return res.status(400).json({ message: `Cannot reject a ${request.status} request.` });
    }

    const myRole = roles.includes('manager') || roles.includes('admin') ? 'manager' : 'hr';
    const body = req.body || {};
    const step = request.approvalChain.find(s => s.role === myRole);
    if (!step) {
      return res.status(400).json({ message: 'Your role is not part of this leave\'s approval chain.' });
    }
    if (step.status !== 'pending') {
      return res.status(400).json({
        code: 'STEP_ALREADY_ACTIONED',
        message: `Your step in this chain is already ${step.status}.`
      });
    }
    step.approver = req.user.userId;
    step.status = 'rejected';
    step.actedAt = new Date();
    step.comments = body.comments || '';
    request.status = 'rejected';

    await request.save();
    await audit('leave_rejected', request._id, req.user.userId, { role: myRole });
    // A reject only matters for attendance if the request had already been
    // fully approved before - revert any rows we'd marked as 'leave'.
    await syncAttendanceForLeaveCancel(request);
    res.json(request);
  } catch (error) {
    console.error('Error rejecting leave:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST cancel
//   Pending-only path. Approved leaves now require the multi-step reversal
//   workflow (POST /:id/reverse-request) - a single HR/Manager click can no
//   longer silently overturn a fully approved leave.
router.post('/:id/cancel', auth, async (req, res) => {
  try {
    const request = await LeaveRequest.findById(req.params.id).populate('employee', 'userId');
    if (!request) return res.status(404).json({ message: 'Not found.' });

    if (request.status === 'approved') {
      return res.status(400).json({
        code: 'NEEDS_REVERSAL',
        message: 'An already-approved leave cannot be cancelled directly. Use Request Reversal — the same approvers must sign off again before the leave is reverted.'
      });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ message: `Cannot cancel a ${request.status} request.` });
    }

    const roles = req.user.roles || [];
    const isOwn = request.employee?.userId?.toString() === req.user.userId;
    // The PE/SS/Sup who submitted on behalf of a worker should also be able
    // to cancel their own pending request - they were the requester.
    const isSubmitter = request.appliedBy?.toString() === req.user.userId
      || request.createdBy?.toString() === req.user.userId;
    const allowedAsActor = (isOwn || isSubmitter);
    if (!hasHRAccess(roles) && !allowedAsActor) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    request.status = 'cancelled';
    await request.save();
    await audit('leave_cancelled', request._id, req.user.userId);
    await syncAttendanceForLeaveCancel(request);
    res.json(request);
  } catch (error) {
    console.error('Error cancelling leave:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ----------------------- Reversal flow (approved leaves) ------------------ *
 *  Same chain shape as the original approval (one 'hr' step + one 'manager'
 *  step). While the reversal is pending the parent request stays 'approved'
 *  so attendance is not yet reverted. On full approval of the reversal we
 *  flip request.status to 'cancelled' and call syncAttendanceForLeaveCancel.
 * -------------------------------------------------------------------------- */

function buildReversalChain() {
  return [
    { role: 'hr', status: 'pending' },
    { role: 'manager', status: 'pending' }
  ];
}

// POST initiate a reversal - only on approved leaves, only HR/Manager/Admin
router.post('/:id/reverse-request', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) return res.status(403).json({ message: 'Only HR or Manager can request a reversal.' });

    const request = await LeaveRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Not found.' });
    if (request.status !== 'approved') {
      return res.status(400).json({ message: `Reversal can only be requested on an approved leave (current status: ${request.status}).` });
    }
    if (request.reversal && request.reversal.status === 'pending') {
      return res.status(400).json({ message: 'A reversal is already in progress for this leave.' });
    }

    const body = req.body || {};
    request.reversal = {
      requestedBy: req.user.userId,
      requestedAt: new Date(),
      reason: (body.reason || '').trim(),
      status: 'pending',
      approvalChain: buildReversalChain()
    };

    // The initiator auto-approves their own step in the reversal chain -
    // their role on the leave request side counts as one half of the sign-off.
    const initiatorRole = roles.includes('manager') || roles.includes('admin') ? 'manager' : 'hr';
    const ownStep = request.reversal.approvalChain.find(s => s.role === initiatorRole);
    if (ownStep) {
      ownStep.approver = req.user.userId;
      ownStep.status = 'approved';
      ownStep.actedAt = new Date();
      ownStep.comments = body.reason ? `Initiated reversal: ${body.reason}` : 'Initiated reversal.';
    }

    await request.save();
    await audit('leave_reversal_requested', request._id, req.user.userId, { initiatorRole });
    res.json(request);
  } catch (error) {
    console.error('Error requesting reversal:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST approve a reversal step
router.post('/:id/reverse-approve', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const request = await LeaveRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Not found.' });
    if (!request.reversal || request.reversal.status !== 'pending') {
      return res.status(400).json({ message: 'No pending reversal for this leave.' });
    }

    const myRole = roles.includes('manager') || roles.includes('admin') ? 'manager' : 'hr';
    const body = req.body || {};
    const step = request.reversal.approvalChain.find(s => s.role === myRole);
    if (!step) return res.status(400).json({ message: 'Your role is not part of the reversal chain.' });
    if (step.status !== 'pending') {
      return res.status(400).json({ message: `You have already ${step.status} this reversal.` });
    }

    step.approver = req.user.userId;
    step.status = 'approved';
    step.actedAt = new Date();
    step.comments = (body.comments || '').trim();

    const allApproved = request.reversal.approvalChain.every(s => s.status === 'approved');
    if (allApproved) {
      request.reversal.status = 'approved';
      request.reversal.completedAt = new Date();
      request.status = 'cancelled';
    }

    await request.save();
    await audit('leave_reversal_approved', request._id, req.user.userId, { role: myRole, finalised: allApproved });

    if (allApproved) {
      await syncAttendanceForLeaveCancel(request);
    }

    res.json(request);
  } catch (error) {
    console.error('Error approving reversal:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST reject a reversal - leaves the original 'approved' status intact
router.post('/:id/reverse-reject', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const request = await LeaveRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Not found.' });
    if (!request.reversal || request.reversal.status !== 'pending') {
      return res.status(400).json({ message: 'No pending reversal for this leave.' });
    }

    const myRole = roles.includes('manager') || roles.includes('admin') ? 'manager' : 'hr';
    const body = req.body || {};
    const step = request.reversal.approvalChain.find(s => s.role === myRole);
    if (!step) return res.status(400).json({ message: 'Your role is not part of the reversal chain.' });
    if (step.status !== 'pending') {
      return res.status(400).json({ message: `You have already ${step.status} this reversal.` });
    }

    step.approver = req.user.userId;
    step.status = 'rejected';
    step.actedAt = new Date();
    step.comments = (body.comments || '').trim();

    request.reversal.status = 'rejected';
    request.reversal.completedAt = new Date();

    await request.save();
    await audit('leave_reversal_rejected', request._id, req.user.userId, { role: myRole });
    res.json(request);
  } catch (error) {
    console.error('Error rejecting reversal:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
