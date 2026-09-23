const express = require('express');
const jwt = require('jsonwebtoken');
const AuditLog = require('../models/AuditLog');
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

// Get audit logs (only managers and admins)
router.get('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!roles.includes('manager') && !roles.includes('admin')) {
      return res.status(403).json({ message: 'Only managers and admins can view audit logs' });
    }

    const { 
      action, 
      entityType, 
      startDate, 
      endDate, 
      deletedBy,
      page = 1, 
      limit = 50 
    } = req.query;

    const query = {};
    
    if (action) query.action = action;
    if (entityType) query.entityType = entityType;
    if (deletedBy) query.deletedBy = deletedBy;
    
    if (startDate || endDate) {
      query.deletedAt = {};
      if (startDate) query.deletedAt.$gte = new Date(startDate);
      if (endDate) query.deletedAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const logs = await AuditLog.find(query)
      .populate('deletedBy', 'name email roles')
      .populate('entityData.createdBy', 'name email')
      .sort({ deletedAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await AuditLog.countDocuments(query);

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
    res.status(500).json({ message: 'Server error' });
  }
});

// Get audit log by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!roles.includes('manager') && !roles.includes('admin')) {
      return res.status(403).json({ message: 'Only managers and admins can view audit logs' });
    }

    const log = await AuditLog.findById(req.params.id)
      .populate('deletedBy', 'name email roles')
      .populate('entityData.createdBy', 'name email');
    
    if (!log) return res.status(404).json({ message: 'Audit log not found' });
    
    res.json(log);
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

