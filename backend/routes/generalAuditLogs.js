const express = require('express');
const jwt = require('jsonwebtoken');
const GeneralAuditLog = require('../models/GeneralAuditLog');
const router = express.Router();

const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Access denied' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Get general audit logs (only managers and admins)
router.get('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!roles.includes('manager') && !roles.includes('admin')) {
      return res.status(403).json({ message: 'Only managers and admins can view general audit logs' });
    }

    const { 
      action, 
      module: moduleFilter, 
      entityType, 
      startDate, 
      endDate, 
      performedBy,
      page = 1, 
      limit = 50 
    } = req.query;

    const query = {};
    
    if (action) query.action = action;
    if (moduleFilter) query.module = moduleFilter;
    if (entityType) query.entityType = entityType;
    if (performedBy) query.performedBy = performedBy;
    
    if (startDate || endDate) {
      query.performedAt = {};
      if (startDate) query.performedAt.$gte = new Date(startDate);
      if (endDate) query.performedAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const logs = await GeneralAuditLog.find(query)
      .populate('performedBy', 'name email roles')
      .sort({ performedAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await GeneralAuditLog.countDocuments(query);

    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (e) {
    console.error('Error fetching general audit logs:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get general audit log by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!roles.includes('manager') && !roles.includes('admin')) {
      return res.status(403).json({ message: 'Only managers and admins can view general audit logs' });
    }

    const log = await GeneralAuditLog.findById(req.params.id)
      .populate('performedBy', 'name email roles');
    
    if (!log) return res.status(404).json({ message: 'Audit log not found' });
    
    res.json(log);
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

