const crypto = require('crypto');
const User = require('../models/User');
const Role = require('../models/Role');
const Employee = require('../models/Employee');
const GeneralAuditLog = require('../models/GeneralAuditLog');
const auth = require('../middleware/auth');

const TERMINAL_STATUSES = ['terminated', 'resigned'];
const FORBIDDEN_PROVISION_ROLES = ['admin'];
const MIN_ROLE_COUNT = 1;

// Find the employee - if any - that currently has `userId` set to the given
// user. Used to block double-linking before granting a user to an employee
// or deleting a user that's still bridged.
async function findEmployeeByUserId(userId) {
  if (!userId) return null;
  return Employee.findOne({ userId }).select('_id employeeId fullName status');
}

const generateTempPassword = () => crypto.randomBytes(9).toString('base64url');

async function syncUserActivationFromEmployee(employee, actorUserId) {
  if (!employee || !employee.userId) return { changed: false };
  if (!TERMINAL_STATUSES.includes(employee.status)) return { changed: false };

  const user = await User.findById(employee.userId);
  if (!user) return { changed: false };
  if (user.isActive === false) return { changed: false };

  user.isActive = false;
  await user.save();

  // Drop any cached "still active" result so the next API call from this
  // user's existing session is rejected immediately rather than waiting on
  // the cache TTL to expire.
  try { auth.invalidateActiveCache(String(user._id)); } catch {}

  try {
    await GeneralAuditLog.create({
      action: 'user_deactivated_by_employee_status',
      module: 'hr_management',
      entityType: 'user',
      entityId: user._id,
      entityName: user.name || user.email,
      performedBy: actorUserId || null,
      description: `User deactivated because linked employee status became ${employee.status}`,
      success: true,
      details: {
        employeeId: employee._id,
        employeeStatus: employee.status
      }
    });
  } catch (err) {
    console.error('[employeeBridge audit]', err.message);
  }

  return { changed: true, userId: user._id };
}

// Activate flow has two shapes:
//   1) Create a brand new User (default - when existingUserId is falsy):
//        creates the user, sets temp password, links employee.userId.
//   2) Link an existing unlinked User (existingUserId provided):
//        validates the user is not already linked to another employee,
//        merges any newly-selected role keys into the existing user's roles,
//        links employee.userId, returns the user with no temp password.
async function activateEmployeeUser({ employee, roleKeys, actorUserId, existingUserId = null }) {
  if (!employee) {
    const err = new Error('Employee not found');
    err.status = 404;
    throw err;
  }
  if (employee.userId) {
    const err = new Error('Employee already has a linked user');
    err.status = 409;
    err.extra = { userId: employee.userId };
    throw err;
  }
  if (employee.status !== 'active') {
    const err = new Error('Employee must be in "active" status before activation');
    err.status = 400;
    throw err;
  }
  if (!Array.isArray(roleKeys) || roleKeys.length < MIN_ROLE_COUNT) {
    const err = new Error('At least one role is required');
    err.status = 400;
    throw err;
  }
  const uniqueKeys = Array.from(new Set(roleKeys.map(k => String(k).trim().toLowerCase()).filter(Boolean)));
  if (uniqueKeys.length === 0) {
    const err = new Error('At least one valid role is required');
    err.status = 400;
    throw err;
  }
  if (uniqueKeys.some(k => FORBIDDEN_PROVISION_ROLES.includes(k))) {
    const err = new Error('admin role cannot be granted via HR activation');
    err.status = 403;
    throw err;
  }
  if (!employee.email && !existingUserId) {
    const err = new Error('Employee must have an email before activation');
    err.status = 400;
    throw err;
  }

  const roleDocs = await Role.find({ key: { $in: uniqueKeys } });
  if (roleDocs.length !== uniqueKeys.length) {
    const found = new Set(roleDocs.map(r => r.key));
    const missing = uniqueKeys.filter(k => !found.has(k));
    const err = new Error(`Unknown role key(s): ${missing.join(', ')}`);
    err.status = 400;
    throw err;
  }

  // -------- Path A: link an existing user --------
  if (existingUserId) {
    const user = await User.findById(existingUserId).populate('roles', 'key name');
    if (!user) {
      const err = new Error('Selected user no longer exists');
      err.status = 404;
      throw err;
    }
    const alreadyLinked = await findEmployeeByUserId(user._id);
    if (alreadyLinked) {
      const err = new Error(`User is already linked to employee ${alreadyLinked.fullName || alreadyLinked.employeeId}`);
      err.status = 409;
      err.extra = { linkedEmployeeId: alreadyLinked._id, linkedEmployeeName: alreadyLinked.fullName };
      throw err;
    }
    // Merge selected role keys into the user's roles. Admin is still blocked
    // and we never strip existing roles silently.
    const existingRoleIds = new Set((user.roles || []).map(r => String(r._id || r)));
    let rolesChanged = false;
    for (const r of roleDocs) {
      if (!existingRoleIds.has(String(r._id))) {
        existingRoleIds.add(String(r._id));
        rolesChanged = true;
      }
    }
    if (rolesChanged) {
      user.roles = Array.from(existingRoleIds);
    }
    // Reactivate dormant accounts on link
    if (user.isActive === false) user.isActive = true;
    await user.save();
    try { auth.invalidateActiveCache(String(user._id)); } catch {}

    employee.userId = user._id;
    employee.edits.push({
      editedBy: actorUserId,
      editedAt: new Date(),
      changes: [
        { field: 'userId', from: null, to: user._id },
        { field: 'roles', from: null, to: uniqueKeys }
      ]
    });
    await employee.save();

    try {
      await GeneralAuditLog.create({
        action: 'employee_user_linked',
        module: 'hr_management',
        entityType: 'user',
        entityId: user._id,
        entityName: user.name || user.email,
        performedBy: actorUserId || null,
        description: `Existing user linked to employee ${employee.employeeId || employee.fullName}`,
        success: true,
        details: { employeeId: employee._id, roleAdditions: uniqueKeys }
      });
    } catch (err) {
      console.error('[employeeBridge audit]', err.message);
    }

    return { user, tempPassword: null, roleKeys: uniqueKeys, mode: 'linked' };
  }

  // -------- Path B: create a new user --------
  const existing = await User.findOne({ email: employee.email });
  if (existing) {
    const err = new Error('A user with this email already exists. Use "Link existing user" instead.');
    err.status = 409;
    err.extra = { userId: existing._id, suggestLink: true };
    throw err;
  }

  const tempPassword = generateTempPassword();
  const user = new User({
    name: employee.fullName,
    email: employee.email,
    password: tempPassword,
    roles: roleDocs.map(r => r._id),
    mustChangePassword: true
  });
  await user.save();

  employee.userId = user._id;
  employee.edits.push({
    editedBy: actorUserId,
    editedAt: new Date(),
    changes: [
      { field: 'userId', from: null, to: user._id },
      { field: 'roles', from: null, to: uniqueKeys }
    ]
  });
  await employee.save();

  try {
    await GeneralAuditLog.create({
      action: 'employee_user_provisioned',
      module: 'hr_management',
      entityType: 'user',
      entityId: user._id,
      entityName: user.name || user.email,
      performedBy: actorUserId || null,
      description: `User provisioned from employee ${employee.employeeId || employee.fullName}`,
      success: true,
      details: { employeeId: employee._id, employeeCode: employee.employeeId, roles: uniqueKeys }
    });
  } catch (err) {
    console.error('[employeeBridge audit]', err.message);
  }

  return { user, tempPassword, roleKeys: uniqueKeys, mode: 'created' };
}

module.exports = {
  syncUserActivationFromEmployee,
  activateEmployeeUser,
  findEmployeeByUserId,
  TERMINAL_STATUSES,
  FORBIDDEN_PROVISION_ROLES
};
