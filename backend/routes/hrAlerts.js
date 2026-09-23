const express = require('express');
const jwt = require('jsonwebtoken');
const HRAlert = require('../models/HRAlert');
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
      entityType: 'hr_alert',
      entityId,
      performedBy: userId,
      performedAt: new Date(),
      details,
      success: true
    });
  } catch (err) {
    console.error('[hrAlerts audit]', err.message);
  }
}

router.get('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const filter = {};
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
    if (req.query.severity && req.query.severity !== 'all') filter.severity = req.query.severity;
    if (req.query.alertType && req.query.alertType !== 'all') filter.alertType = req.query.alertType;

    const alerts = await HRAlert.find(filter)
      .populate('employee', 'employeeId fullName category')
      .populate('project', 'name status')
      .populate('acknowledgedBy', 'name email')
      .sort({ severity: 1, createdAt: -1 })
      .limit(200);

    res.json(alerts);
  } catch (error) {
    console.error('Error fetching HR alerts:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/:id/acknowledge', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const alert = await HRAlert.findById(req.params.id);
    if (!alert) return res.status(404).json({ message: 'Alert not found.' });

    alert.status = 'acknowledged';
    alert.acknowledgedBy = req.user.userId;
    alert.acknowledgedAt = new Date();
    await alert.save();

    await audit('hr_alert_acknowledged', alert._id, req.user.userId, { alertType: alert.alertType });
    res.json(alert);
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/:id/dismiss', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const alert = await HRAlert.findById(req.params.id);
    if (!alert) return res.status(404).json({ message: 'Alert not found.' });

    alert.status = 'dismissed';
    alert.dismissedBy = req.user.userId;
    alert.dismissedAt = new Date();
    await alert.save();

    await audit('hr_alert_dismissed', alert._id, req.user.userId, { alertType: alert.alertType });
    res.json(alert);
  } catch (error) {
    console.error('Error dismissing alert:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
