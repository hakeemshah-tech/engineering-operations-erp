const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Employee = require('../models/Employee');
const GeneralAuditLog = require('../models/GeneralAuditLog');
const auth = require('../middleware/auth');
const { maxWeight } = require('../utils/roleWeight');
const router = express.Router();

// Treat `supervisor` and `site_supervisor` as exact-same role for permission handling.
// If a user holds either key, both keys are injected into the JWT and response so every
// downstream check (UI + API) matches regardless of which canonical key was picked.
const SUPERVISOR_ALIASES = ['supervisor', 'site_supervisor'];
const withRoleAliases = (roleKeys = []) => {
  const hasAny = roleKeys.some(k => SUPERVISOR_ALIASES.includes(k));
  if (!hasAny) return roleKeys;
  return Array.from(new Set([...roleKeys, ...SUPERVISOR_ALIASES]));
};

// Helper function to get client IP address
const getClientIp = (req) => {
  return req.ip || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress || 
         req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         req.headers['x-real-ip'] || 
         'unknown';
};

// Helper function to get user agent
const getUserAgent = (req) => {
  return req.get('user-agent') || 'unknown';
};

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const ipAddress = getClientIp(req);
    const userAgent = getUserAgent(req);

    const user = await User.findOne({ email, isActive: true }).populate('roles');
    
    // Log failed login attempt
    if (!user || !(await user.comparePassword(password))) {
      try {
        await GeneralAuditLog.create({
          action: 'login_failed',
          module: 'authentication',
          entityType: 'user',
          entityName: email,
          performedBy: user?._id || null, // null if user doesn't exist
          description: `Failed login attempt for email: ${email}`,
          ipAddress,
          userAgent,
          success: false,
          errorMessage: user ? 'Invalid password' : 'User not found or inactive'
        });
      } catch (auditError) {
        console.error('Error creating audit log for failed login:', auditError);
      }
      
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const rawRoleKeys = (user.roles || []).map(r => (typeof r === 'string' ? r : r.key));
    const roleKeys = withRoleAliases(rawRoleKeys);
    const roleWeight = maxWeight(user.roles);
    const token = jwt.sign(
      { userId: user._id, email: user.email, roles: roleKeys, roleWeight, mustChangePassword: !!user.mustChangePassword },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Log successful login
    try {
      await GeneralAuditLog.create({
        action: 'user_login',
        module: 'authentication',
        entityType: 'user',
        entityId: user._id,
        entityName: user.name || user.email,
        performedBy: user._id,
        description: `User ${user.name || user.email} logged in successfully`,
        ipAddress,
        userAgent,
        success: true,
        details: {
          email: user.email,
          roles: roleKeys,
          loginTime: new Date()
        }
      });
    } catch (auditError) {
      console.error('Error creating audit log for successful login:', auditError);
      // Don't fail the login if audit logging fails
    }

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        roles: roleKeys,
        roleIds: (user.roles || []).map(r => (typeof r === 'string' ? null : r._id)).filter(Boolean),
        mustChangePassword: !!user.mustChangePassword
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    const ipAddress = getClientIp(req);
    const userAgent = getUserAgent(req);
    
    let userId = null;
    let userEmail = 'unknown';
    
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.userId;
        userEmail = decoded.email;
      } catch (e) {
        // Token invalid or expired, but we still log the logout attempt
      }
    }

    // Log logout action
    if (userId) {
      try {
        const user = await User.findById(userId);
        await GeneralAuditLog.create({
          action: 'user_logout',
          module: 'authentication',
          entityType: 'user',
          entityId: userId,
          entityName: user?.name || userEmail,
          performedBy: userId,
          description: `User ${user?.name || userEmail} logged out`,
          ipAddress,
          userAgent,
          success: true,
          details: {
            email: userEmail,
            logoutTime: new Date()
          }
        });
      } catch (auditError) {
        console.error('Error creating audit log for logout:', auditError);
      }
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('name email roles isActive mustChangePassword passwordChangedAt createdAt updatedAt')
      .populate('roles', 'key name weight');

    if (!user) return res.status(404).json({ message: 'User not found' });

    const employee = await Employee.findOne({ userId: user._id })
      .select('employeeId fullName position department category status joiningDate probationEndDate phone email assignedProjects reportingTo photoUrl')
      .populate('assignedProjects', 'name status')
      .populate('reportingTo', 'name email');

    res.json({ user, employee });
  } catch (error) {
    console.error('Error fetching current user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'currentPassword and newPassword are required' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 10) {
      return res.status(400).json({ message: 'New password must be at least 10 characters' });
    }
    if (newPassword === currentPassword) {
      return res.status(400).json({ message: 'New password must differ from current password' });
    }

    const user = await User.findById(req.user.userId).populate('roles');
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'User not found or inactive' });
    }

    const ok = await user.comparePassword(currentPassword);
    if (!ok) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    user.mustChangePassword = false;
    user.passwordChangedAt = new Date();
    await user.save();

    const rawRoleKeys = (user.roles || []).map(r => (typeof r === 'string' ? r : r.key));
    const roleKeys = withRoleAliases(rawRoleKeys);
    const roleWeight = maxWeight(user.roles);
    const token = jwt.sign(
      { userId: user._id, email: user.email, roles: roleKeys, roleWeight, mustChangePassword: false },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    try {
      await GeneralAuditLog.create({
        action: 'password_changed',
        module: 'authentication',
        entityType: 'user',
        entityId: user._id,
        entityName: user.name || user.email,
        performedBy: user._id,
        description: `Password changed for ${user.name || user.email}`,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        success: true
      });
    } catch (auditError) {
      console.error('Error creating audit log for password change:', auditError);
    }

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        roles: roleKeys,
        roleIds: (user.roles || []).map(r => (typeof r === 'string' ? null : r._id)).filter(Boolean),
        mustChangePassword: false
      }
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/forgot-password-request', async (req, res) => {
  try {
    const rawIdentifier = (req.body?.identifier ?? '').toString().trim();
    if (!rawIdentifier) {
      return res.status(400).json({ message: 'Please enter an email, Employee ID, or phone number.' });
    }

    const isEmailShape = rawIdentifier.includes('@');
    const normalized = isEmailShape ? rawIdentifier.toLowerCase() : rawIdentifier;

    let user = null;
    let via = null;

    if (isEmailShape) {
      user = await User.findOne({ email: normalized, isActive: true });
      if (user) via = 'email';
    }

    let employee = null;
    if (!user) {
      employee = await Employee.findOne({
        $or: [
          { employeeId: rawIdentifier },
          { email: normalized },
          { phone: rawIdentifier }
        ]
      });
      if (employee && employee.userId) {
        user = await User.findOne({ _id: employee.userId, isActive: true });
        if (user) {
          if (rawIdentifier === employee.employeeId) via = 'employee_id';
          else if (normalized === employee.email) via = 'email';
          else if (rawIdentifier === employee.phone) via = 'phone';
          else via = 'employee_id';
        }
      }
    }

    if (!user) {
      if (employee && !employee.userId) {
        return res.status(409).json({
          message: 'This employee record has no login account yet. Please contact HR directly.'
        });
      }
      return res.status(404).json({
        message: 'No active account matches that email, Employee ID, or phone number. Please check and try again.'
      });
    }

    user.passwordResetRequested = true;
    user.passwordResetRequestedAt = new Date();
    user.passwordResetRequestedVia = via;
    await user.save();

    try {
      await GeneralAuditLog.create({
        action: 'password_reset_requested',
        module: 'authentication',
        entityType: 'user',
        entityId: user._id,
        entityName: user.name || user.email,
        performedBy: user._id,
        description: `Password reset requested for ${user.name || user.email}`,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        success: true,
        details: { via, identifierLength: rawIdentifier.length }
      });
    } catch (auditError) {
      console.error('Error creating audit log for password reset request:', auditError);
    }

    return res.json({
      message: 'Request submitted. HR will generate a temporary password and share it with you shortly.',
      maskedEmail: user.email ? user.email.replace(/(.{2}).+(@.+)/, '$1***$2') : null
    });
  } catch (error) {
    console.error('Forgot password request error:', error);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;