const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const Role = require('../models/Role');
const Employee = require('../models/Employee');
const GeneralAuditLog = require('../models/GeneralAuditLog');
const jwt = require('jsonwebtoken');
const { requireAnyRole } = require('../middleware/rbac');
const router = express.Router();

const generateTempPassword = () => crypto.randomBytes(9).toString('base64url');

const getClientIp = (req) =>
  req.ip ||
  req.connection?.remoteAddress ||
  req.socket?.remoteAddress ||
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
  req.headers['x-real-ip'] ||
  'unknown';
const getUserAgent = (req) => req.get('user-agent') || 'unknown';

const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Access denied' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const canManageUsers = (req, res, next) => {
  const userRoles = req.user.roles || [];
  const allowedRoles = ['admin', 'manager', 'hr', 'supervisor', 'site_engineer', 'inventory_manager'];
  
  if (!userRoles.some(role => allowedRoles.includes(role))) {
    return res.status(403).json({ message: 'Insufficient permissions' });
  }
  next();
};

// HR queue: list users with pending password reset requests
router.get('/pending-password-resets', auth, requireAnyRole('hr', 'manager', 'admin'), async (req, res) => {
  try {
    const users = await User.find({ passwordResetRequested: true, isActive: true })
      .select('_id name email passwordResetRequestedAt passwordResetRequestedVia roles')
      .populate('roles', 'key name')
      .sort({ passwordResetRequestedAt: 1 });

    if (users.length === 0) return res.json([]);

    const userIds = users.map(u => u._id);
    const employees = await Employee.find({ userId: { $in: userIds } })
      .select('userId employeeId fullName department');

    const byUserId = new Map();
    for (const e of employees) byUserId.set(String(e.userId), e);

    const payload = users.map(u => {
      const emp = byUserId.get(String(u._id));
      return {
        _id: u._id,
        name: u.name,
        email: u.email,
        roles: (u.roles || []).map(r => ({ key: r.key, name: r.name })),
        requestedAt: u.passwordResetRequestedAt,
        requestedVia: u.passwordResetRequestedVia,
        employee: emp
          ? { employeeId: emp.employeeId, fullName: emp.fullName, department: emp.department }
          : null
      };
    });

    res.json(payload);
  } catch (error) {
    console.error('Error fetching pending password resets:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// HR approve: generate a temporary password for a user
router.post('/:id/generate-temp-password', auth, requireAnyRole('hr', 'manager', 'admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('roles');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.isActive === false) {
      return res.status(400).json({ message: 'Cannot reset a deactivated user.' });
    }

    const targetRoleKeys = (user.roles || []).map(r => (typeof r === 'string' ? r : r.key));
    const callerRoles = req.user.roles || [];
    const targetIsAdmin = targetRoleKeys.includes('admin');
    const callerIsAdmin = callerRoles.includes('admin');
    if (targetIsAdmin && !callerIsAdmin) {
      return res.status(403).json({ message: 'Admin-level resets require an admin approver.' });
    }

    const tempPassword = generateTempPassword();
    user.password = tempPassword;
    user.mustChangePassword = true;
    user.passwordResetRequested = false;
    user.passwordResetRequestedAt = null;
    user.passwordResetRequestedVia = null;
    await user.save();

    try {
      await GeneralAuditLog.create({
        action: 'password_reset_approved',
        module: 'hr_management',
        entityType: 'user',
        entityId: user._id,
        entityName: user.name || user.email,
        performedBy: req.user.userId,
        description: `Temporary password generated for ${user.name || user.email}`,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        success: true,
        details: { approverRoles: callerRoles, targetRoles: targetRoleKeys }
      });
    } catch (auditError) {
      console.error('Error creating audit log for password reset approval:', auditError);
    }

    res.json({
      user: { _id: user._id, name: user.name, email: user.email },
      tempPassword,
      message: 'Temporary password generated. Share it securely — it will not be shown again.'
    });
  } catch (error) {
    console.error('Error generating temp password:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Lookup users by role key - used by team allocation and similar selectors
// Users who are not currently linked to any Employee. The HR Activate &
// Assign Role flow uses this to offer "Link existing user" instead of
// always creating a new login. Filters: ?q= (name/email substring),
// ?limit= (default 20). HR / Manager / Admin only.
router.get('/unlinked', auth, requireAnyRole('hr', 'manager', 'admin'), async (req, res) => {
  try {
    const { q } = req.query;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

    const linked = await Employee.find({ userId: { $ne: null } }).select('userId');
    const linkedIds = linked.map(e => e.userId);

    const filter = { _id: { $nin: linkedIds }, isActive: true };
    if (q) {
      const safe = String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: safe, $options: 'i' } },
        { email: { $regex: safe, $options: 'i' } }
      ];
    }

    const users = await User.find(filter)
      .select('_id name email roles')
      .populate('roles', 'key name')
      .sort({ name: 1 })
      .limit(limit);

    res.json(users);
  } catch (err) {
    console.error('[users/unlinked]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/by-role/:roleKey', auth, async (req, res) => {
  try {
    const roleKey = String(req.params.roleKey || '').trim().toLowerCase();
    if (!roleKey) return res.status(400).json({ message: 'roleKey is required' });

    const userRoles = req.user.roles || [];
    // Anyone who may need to view or assign team members on a project. Supervisors
    // and site supervisors need this to populate the Site Team lists for the
    // projects they are assigned to.
    const allowed = ['admin', 'manager', 'hr', 'project_engineer', 'supervisor', 'site_supervisor'];
    if (!userRoles.some(r => allowed.includes(r))) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const role = await Role.findOne({ key: roleKey }).select('_id');
    if (!role) return res.json([]);

    const users = await User.find({ roles: role._id, isActive: true })
      .select('_id name email')
      .sort({ name: 1 });
    res.json(users);
  } catch (error) {
    console.error('Error fetching users by role:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/', auth, canManageUsers, async (req, res) => {
  try {
    let query = {};
    
    // Filter users based on role permissions
    if (!req.user.roles.includes('admin')) {
      const adminRole = await Role.findOne({ key: 'admin' }).select('_id');
      const managerRole = await Role.findOne({ key: 'manager' }).select('_id');
      if (req.user.roles.includes('manager') || req.user.roles.includes('hr')) {
        query = { roles: { $nin: [adminRole?._id].filter(Boolean) } };
      } else {
        // For supervisors, site_engineers, inventory_managers - show limited users
        query = { roles: { $nin: [adminRole?._id, managerRole?._id].filter(Boolean) } };
      }
    }
    
    const users = await User.find(query).select('-password').populate('roles').sort({ createdAt: -1 });
    const mapped = users.map(u => {
      const roleKeys = (u.roles || []).map(r => (typeof r === 'string' ? r : r.key));
      const roleIds = (u.roles || []).map(r => (typeof r === 'string' ? null : r._id)).filter(Boolean);
      const obj = u.toObject();
      delete obj.password;
      return { ...obj, roles: roleKeys, roleIds };
    });
    res.json(mapped);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, canManageUsers, async (req, res) => {
  try {
    const { name, email, roles, roleIds } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Role-based restrictions
    const userRoles = req.user.roles;
    let allowedRoles = [];
    
    if (userRoles.includes('admin')) {
      allowedRoles = ['admin', 'manager', 'account_manager', 'hr', 'inventory_manager', 'procurement_engineer', 'store_keeper', 'supervisor', 'site_supervisor', 'site_worker', 'site_engineer', 'sales_engineer', 'project_engineer', 'estimation_engineer', 'vendor', 'employee'];
    } else if (userRoles.includes('manager')) {
      allowedRoles = ['account_manager', 'hr', 'inventory_manager', 'procurement_engineer', 'store_keeper', 'supervisor', 'site_supervisor', 'site_worker', 'site_engineer', 'sales_engineer', 'project_engineer', 'estimation_engineer', 'vendor', 'employee'];
    } else if (userRoles.includes('hr')) {
      allowedRoles = ['account_manager', 'inventory_manager', 'store_keeper', 'supervisor', 'site_supervisor', 'site_worker', 'site_engineer', 'employee'];
    } else if (userRoles.includes('supervisor') || userRoles.includes('site_engineer')) {
      allowedRoles = ['vendor'];
    } else if (userRoles.includes('inventory_manager')) {
      allowedRoles = ['store_keeper'];
    }
    // roles can be provided as keys or ids; normalize to keys for permission validation
    let incomingRoleKeys = roles || [];
    if ((!incomingRoleKeys || incomingRoleKeys.length === 0) && Array.isArray(roleIds) && roleIds.length > 0) {
      const rolesDocs = await Role.find({ _id: { $in: roleIds } });
      incomingRoleKeys = rolesDocs.map(r => r.key);
    }

    const hasInvalidRole = incomingRoleKeys.some(role => !allowedRoles.includes(role));
    if (hasInvalidRole) {
      return res.status(403).json({ message: 'You cannot assign these roles' });
    }

    // map to Role ids
    let roleObjectIds = [];
    if (Array.isArray(roleIds) && roleIds.length > 0) {
      roleObjectIds = roleIds;
    } else if (Array.isArray(incomingRoleKeys) && incomingRoleKeys.length > 0) {
      const rolesDocs = await Role.find({ key: { $in: incomingRoleKeys } });
      roleObjectIds = rolesDocs.map(r => r._id);
    }

    const tempPassword = generateTempPassword();
    const user = new User({
      name,
      email,
      password: tempPassword,
      roles: roleObjectIds,
      mustChangePassword: true
    });

    await user.save();
    await user.populate('roles');

    const roleKeys = (user.roles || []).map(r => (typeof r === 'string' ? r : r.key));
    const roleIdsResp = (user.roles || []).map(r => (typeof r === 'string' ? null : r._id)).filter(Boolean);
    const userResponse = user.toObject();
    delete userResponse.password;
    res.status(201).json({ ...userResponse, roles: roleKeys, roleIds: roleIdsResp, tempPassword });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', auth, canManageUsers, async (req, res) => {
  try {
    const { name, email, roles, roleIds, isActive } = req.body;
    
    // Role-based restrictions (same as create)
    const userRoles = req.user.roles;
    let allowedRoles = [];
    
    if (userRoles.includes('admin')) {
      allowedRoles = ['admin', 'manager', 'account_manager', 'hr', 'inventory_manager', 'procurement_engineer', 'store_keeper', 'supervisor', 'site_supervisor', 'site_worker', 'site_engineer', 'sales_engineer', 'project_engineer', 'estimation_engineer', 'vendor', 'employee'];
    } else if (userRoles.includes('manager')) {
      allowedRoles = ['account_manager', 'hr', 'inventory_manager', 'procurement_engineer', 'store_keeper', 'supervisor', 'site_supervisor', 'site_worker', 'site_engineer', 'sales_engineer', 'project_engineer', 'estimation_engineer', 'vendor', 'employee'];
    } else if (userRoles.includes('hr')) {
      allowedRoles = ['account_manager', 'inventory_manager', 'store_keeper', 'supervisor', 'site_supervisor', 'site_worker', 'site_engineer', 'employee'];
    } else if (userRoles.includes('supervisor') || userRoles.includes('site_engineer')) {
      allowedRoles = ['vendor'];
    } else if (userRoles.includes('inventory_manager')) {
      allowedRoles = ['store_keeper'];
    }

    let incomingRoleKeys = roles || [];
    if ((!incomingRoleKeys || incomingRoleKeys.length === 0) && Array.isArray(roleIds) && roleIds.length > 0) {
      const rolesDocs = await Role.find({ _id: { $in: roleIds } });
      incomingRoleKeys = rolesDocs.map(r => r.key);
    }

    const hasInvalidRole = (incomingRoleKeys || []).some(role => !allowedRoles.includes(role));
    if (hasInvalidRole) {
      return res.status(403).json({ message: 'You cannot assign these roles' });
    }
    
    // map to Role ids
    let roleObjectIds = undefined;
    if (Array.isArray(roleIds) && roleIds.length > 0) {
      roleObjectIds = roleIds;
    } else if (Array.isArray(incomingRoleKeys) && incomingRoleKeys.length > 0) {
      const rolesDocs = await Role.find({ key: { $in: incomingRoleKeys } });
      roleObjectIds = rolesDocs.map(r => r._id);
    }

    const update = { name, email, isActive };
    if (roleObjectIds) update.roles = roleObjectIds;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    ).select('-password').populate('roles');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Mirror name/email to the linked Employee so the two records do not
    // drift apart. We only touch fields the caller actually changed; if the
    // payload didn't include `name` or `email` the corresponding Employee
    // field is left alone.
    try {
      const linkedEmp = await Employee.findOne({ userId: user._id });
      if (linkedEmp) {
        const changes = [];
        if (typeof name === 'string' && name && name !== linkedEmp.fullName) {
          changes.push({ field: 'fullName', from: linkedEmp.fullName, to: name });
          linkedEmp.fullName = name;
        }
        if (typeof email === 'string' && email && email.toLowerCase() !== (linkedEmp.email || '').toLowerCase()) {
          changes.push({ field: 'email', from: linkedEmp.email, to: email });
          linkedEmp.email = email.toLowerCase();
        }
        if (changes.length > 0) {
          linkedEmp.edits = Array.isArray(linkedEmp.edits) ? linkedEmp.edits : [];
          linkedEmp.edits.push({ editedBy: req.user.userId, editedAt: new Date(), changes });
          await linkedEmp.save();
        }
      }
    } catch (err) {
      console.warn('[users PUT] mirror to employee failed:', err.message);
    }

    const roleKeys = (user.roles || []).map(r => (typeof r === 'string' ? r : r.key));
    const roleIdsResp = (user.roles || []).map(r => (typeof r === 'string' ? null : r._id)).filter(Boolean);
    const userResponse = user.toObject();
    delete userResponse.password;
    res.json({ ...userResponse, roles: roleKeys, roleIds: roleIdsResp });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', auth, canManageUsers, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // If the user is linked to an Employee, refuse the delete unless the
    // caller explicitly opts in via ?force=true. The client surfaces this
    // 409 as a confirmation modal listing the linked employee and offering
    // "Unlink and Delete" which sends the force flag. Clearing
    // Employee.userId here keeps the employee record intact - HR can later
    // reassign a new user via the Activate & Assign Role flow.
    const linkedEmp = await Employee.findOne({ userId: user._id })
      .select('_id employeeId fullName status');
    const force = req.query.force === 'true' || req.body?.force === true;
    if (linkedEmp && !force) {
      return res.status(409).json({
        code: 'USER_LINKED_TO_EMPLOYEE',
        message: `This user is linked to employee ${linkedEmp.fullName || linkedEmp.employeeId}. Unlink before deleting.`,
        employee: {
          _id: linkedEmp._id,
          employeeId: linkedEmp.employeeId,
          fullName: linkedEmp.fullName,
          status: linkedEmp.status
        }
      });
    }

    if (linkedEmp) {
      linkedEmp.userId = undefined;
      linkedEmp.edits = Array.isArray(linkedEmp.edits) ? linkedEmp.edits : [];
      linkedEmp.edits.push({
        editedBy: req.user.userId,
        editedAt: new Date(),
        changes: [{ field: 'userId', from: user._id, to: null }]
      });
      await linkedEmp.save();
    }

    await user.deleteOne();

    try {
      await GeneralAuditLog.create({
        action: 'user_deleted',
        module: 'user_management',
        entityType: 'user',
        entityId: user._id,
        entityName: user.name || user.email,
        performedBy: req.user.userId,
        description: linkedEmp
          ? `User deleted (was linked to employee ${linkedEmp.fullName || linkedEmp.employeeId}; link cleared)`
          : 'User deleted',
        success: true,
        details: linkedEmp ? { unlinkedEmployeeId: linkedEmp._id } : {}
      });
    } catch (err) {
      console.warn('[users DELETE] audit failed:', err.message);
    }

    res.json({
      message: 'User deleted successfully',
      unlinkedEmployee: linkedEmp ? {
        _id: linkedEmp._id,
        fullName: linkedEmp.fullName
      } : null
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;