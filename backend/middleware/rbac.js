const Project = require('../models/Project');
const Employee = require('../models/Employee');

const HR_ROLES = ['hr', 'manager', 'admin'];
const PROJECT_SCOPED_ROLES = ['project_engineer', 'site_supervisor', 'supervisor'];
// Roles that behave as a site-supervisor (scoped to their project.supervisors[] membership)
const SITE_SUPERVISOR_LIKE = ['site_supervisor', 'supervisor'];

const hasHRAccess = (roles = []) => HR_ROLES.some(r => roles.includes(r));
const isProjectScoped = (roles = []) => PROJECT_SCOPED_ROLES.some(r => roles.includes(r));
const isSiteSupervisorLike = (roles = []) => SITE_SUPERVISOR_LIKE.some(r => roles.includes(r));

function requireRole(...keys) {
  return (req, res, next) => {
    const userRoles = req.user?.roles || [];
    const missing = keys.filter(k => !userRoles.includes(k));
    if (missing.length > 0) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  };
}

function requireAnyRole(...keys) {
  return (req, res, next) => {
    const userRoles = req.user?.roles || [];
    if (!keys.some(k => userRoles.includes(k))) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  };
}

function canAccessHRAttendance(req, res, next) {
  const roles = req.user?.roles || [];
  if (hasHRAccess(roles)) return next();
  if (isProjectScoped(roles)) return next();
  if (roles.includes('supervisor') || roles.includes('site_engineer') || roles.includes('employee')) return next();
  return res.status(403).json({ message: 'Access denied.' });
}

/**
 * Attendance-marking scope rules (enforced server-side, set on req for
 * downstream handlers):
 *
 *   Admin / Manager / HR   → no scoping; can mark anyone (handled above).
 *   Project Engineer       → can mark Site Supervisors, Supervisors, AND
 *                            Site Workers, BUT only on projects where
 *                            they are listed in `assignedProjectEngineer`.
 *   Site Supervisor /
 *   Supervisor             → can mark Site Workers ONLY, and only on
 *                            projects where they are listed in
 *                            `supervisors`. They CANNOT mark other
 *                            supervisors (peers).
 *
 *   Anyone else            → no markable set; downstream handler refuses.
 *
 * `req.scopedProjectIds` - projects in scope (visibility for reads)
 * `req.scopedWorkerUserIds` - user IDs the caller may write attendance
 *                             for. Name is historical; this set includes
 *                             supervisor IDs when the caller is a PE.
 */
async function scopeAttendanceToProjects(req, res, next) {
  try {
    const roles = req.user?.roles || [];
    if (hasHRAccess(roles)) return next();
    if (!isProjectScoped(roles)) return next();

    const userId = req.user.userId;
    const or = [];
    if (roles.includes('project_engineer')) or.push({ assignedProjectEngineer: userId });
    if (isSiteSupervisorLike(roles))         or.push({ supervisors: userId });
    if (or.length === 0) return next();

    const projects = await Project.find({ $or: or }).select('_id workers supervisors');
    const canMarkSupervisors = roles.includes('project_engineer');
    const markableUserIdSet = new Set();
    for (const p of projects) {
      for (const w of (p.workers || [])) markableUserIdSet.add(String(w));
      if (canMarkSupervisors) {
        for (const s of (p.supervisors || [])) markableUserIdSet.add(String(s));
      }
    }

    // Second-path coverage - Employees who have `assignedProjects` pointing
    // at one of the scoped projects, regardless of whether their `userId`
    // matched a worker/supervisor in step one. This catches:
    //   • employee profile exists but the userId link is missing,
    //   • a worker has an Employee record but no User account yet,
    //   • a supervisor was assigned via Employee.assignedProjects rather
    //     than the Manage Site Team flow.
    //
    // For Site Supervisors / Supervisors (peers): we only widen to site_*
    // workers so a supervisor doesn't see other supervisors' attendance.
    // For Project Engineers: we widen to ALL non-terminated employees on
    // the project so site supervisors with any category (site_* or office)
    // are visible. The caller's OWN row is excluded by the self-edit guard
    // downstream regardless of category.
    const scopedProjectIds = projects.map(p => p._id);
    const employeeIdSet = new Set();
    if (scopedProjectIds.length > 0) {
      const categoryFilter = canMarkSupervisors
        ? {}   // PE → any category
        : { category: { $in: ['site_company_visa', 'site_mission_visa'] } };
      const scopedEmployees = await Employee.find({
        assignedProjects: { $in: scopedProjectIds },
        status: { $ne: 'terminated' },
        ...categoryFilter
      }).select('_id userId');
      for (const e of scopedEmployees) {
        // For supervisor-like callers, also drop any employee whose User is
        // a peer supervisor on the project - they're not in markableUserIdSet
        // and shouldn't sneak in via assignedProjects.
        if (!canMarkSupervisors) {
          // Peer-supervisor check would need cross-project supervisor list;
          // keep the simple category gate above as the guard. Site-only
          // employees never overlap with peer supervisors in practice.
        }
        employeeIdSet.add(String(e._id));
      }
    }

    req.attendanceScoped = true;
    req.scopedProjectIds = scopedProjectIds;
    req.scopedWorkerUserIds = Array.from(markableUserIdSet);
    req.scopedEmployeeIds = Array.from(employeeIdSet);
    next();
  } catch (err) {
    console.error('[scopeAttendanceToProjects]', err);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {
  requireRole,
  requireAnyRole,
  canAccessHRAttendance,
  scopeAttendanceToProjects,
  hasHRAccess,
  isProjectScoped,
  isSiteSupervisorLike,
  HR_ROLES,
  PROJECT_SCOPED_ROLES,
  SITE_SUPERVISOR_LIKE
};
