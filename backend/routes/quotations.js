const express = require('express');
const jwt = require('jsonwebtoken');
const Quotation = require('../models/Quotation');
const Lead = require('../models/Lead');
const Revision = require('../models/Revision');
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

// List quotations
router.get('/', auth, async (req, res) => {
  try {
    const list = await Quotation.find()
      .populate('lead', 'customerName projectTitle enquiryNumber enquiryDate')
      .populate('createdBy', 'name email')
      .populate('edits.editedBy', 'name email')
      .populate('managementApproval.requestedBy', 'name email')
      .populate('managementApproval.approvedBy', 'name email')
      .populate('managementApproval.logs.requestedBy', 'name email')
      .populate('managementApproval.logs.decidedBy', 'name email')
      .sort({ createdAt: -1 });
    res.json(list);
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get one
router.get('/:id', auth, async (req, res) => {
  try {
    const q = await Quotation.findById(req.params.id)
      .populate('lead', 'customerName projectTitle enquiryNumber enquiryDate')
      .populate('createdBy', 'name email')
      .populate('edits.editedBy', 'name email')
      .populate('managementApproval.requestedBy', 'name email')
      .populate('managementApproval.approvedBy', 'name email')
      .populate('managementApproval.logs.requestedBy', 'name email')
      .populate('managementApproval.logs.decidedBy', 'name email');
    if (!q) return res.status(404).json({ message: 'Quotation not found' });
    res.json(q);
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper: ensure rich text fields are stored as single HTML strings
const toRichString = (val, fieldName) => {
  if (typeof val === 'string') return val

  // Price schedule: prefer concatenated item descriptions
  if (fieldName === 'priceSchedule') {
    if (val && typeof val === 'object' && Array.isArray(val.items)) {
      const joined = val.items
        .map(it => (it && typeof it.description === 'string' ? it.description : ''))
        .filter(Boolean)
        .join('<br>')
      if (joined) return joined
    }
  }

  if (Array.isArray(val)) {
    return val.map(item => {
      if (item && typeof item === 'object') {
        if (typeof item.description === 'string') return item.description
        if (typeof item.milestoneDescription === 'string') return item.milestoneDescription
        return JSON.stringify(item)
      }
      return item != null ? String(item) : ''
    }).join('\n')
  }
  if (val && typeof val === 'object') {
    if (typeof val.description === 'string') return val.description
    if (typeof val.milestoneDescription === 'string') return val.milestoneDescription
    // fallback to JSON
    return JSON.stringify(val)
  }
  return val != null ? String(val) : ''
}

// Create quotation (estimation engineers only)
router.post('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!roles.includes('estimation_engineer')) {
      return res.status(403).json({ message: 'Only estimation engineers can create quotations' });
    }

    const { lead: leadId } = req.body;
    if (!leadId) return res.status(400).json({ message: 'Lead is required' });
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const payload = {
      ...req.body,
      scopeOfWork: toRichString(req.body.scopeOfWork, 'scopeOfWork'),
      priceSchedule: toRichString(req.body.priceSchedule, 'priceSchedule'),
      exclusions: toRichString(req.body.exclusions, 'exclusions'),
      paymentTerms: toRichString(req.body.paymentTerms, 'paymentTerms'),
      createdBy: req.user.userId
    }

    const quotation = await Quotation.create(payload);
    
    // Create audit log for quotation creation
    try {
      // Lead is already fetched above, use it
      await AuditLog.create({
        action: 'quotation_created',
        entityType: 'quotation',
        entityId: quotation._id,
        entityData: {
          offerReference: quotation.offerReference || null,
          projectTitle: quotation.projectTitle || lead?.projectTitle || null,
          customerName: lead?.customerName || null,
          grandTotal: quotation.priceSchedule?.grandTotal || null,
          currency: quotation.priceSchedule?.currency || null,
          createdBy: req.user.userId,
          createdAt: quotation.createdAt || null
        },
        performedBy: req.user.userId,
        performedAt: new Date(),
        ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
        userAgent: req.get('user-agent') || 'unknown'
      });
    } catch (auditError) {
      console.error('Error creating audit log for quotation creation:', auditError);
    }
    
    const populated = await Quotation.findById(quotation._id)
      .populate('lead', 'customerName projectTitle enquiryNumber enquiryDate')
      .populate('createdBy', 'name email');
    res.status(201).json(populated);
  } catch (e) {
    console.error('Error creating quotation:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update quotation (creator or estimation engineers)
router.put('/:id', auth, async (req, res) => {
  try {
    const q = await Quotation.findById(req.params.id);
    if (!q) return res.status(404).json({ message: 'Quotation not found' });

    const roles = req.user.roles || [];
    const isCreator = q.createdBy.toString() === req.user.userId;
    if (!isCreator && !roles.includes('estimation_engineer')) {
      return res.status(403).json({ message: 'Not authorized to edit quotation' });
    }

    // Prevent edits once approved
    if (q.managementApproval?.status === 'approved') {
      return res.status(400).json({ message: 'Approved quotations cannot be edited' });
    }

    const updatableRootFields = [
      'submittedTo','attention','offerReference','enquiryNumber','offerDate','enquiryDate','projectTitle','introductionText','ourViewpoints'
    ];

    const changes = [];

    // Helper to normalize date values for comparison
    const normalizeDateForComparison = (field, value) => {
      if (['offerDate', 'enquiryDate'].includes(field)) {
        if (!value) return null;
        // If it's already a Date object, convert to YYYY-MM-DD
        if (value instanceof Date) {
          return value.toISOString().slice(0, 10);
        }
        // If it's a string, try to parse and normalize
        if (typeof value === 'string') {
          const d = new Date(value);
          if (!isNaN(d.getTime())) {
            return d.toISOString().slice(0, 10);
          }
        }
        return null;
      }
      return value;
    };

    for (const field of updatableRootFields) {
      if (typeof req.body[field] === 'undefined') continue;
      const from = q[field];
      const to = req.body[field];
      
      // Normalize dates for comparison
      const fromNormalized = normalizeDateForComparison(field, from);
      const toNormalized = normalizeDateForComparison(field, to);
      
      if (JSON.stringify(fromNormalized) !== JSON.stringify(toNormalized)) {
        changes.push({ field, from, to });
        // Convert date strings to Date objects when saving
        if (['offerDate', 'enquiryDate'].includes(field) && to) {
          q[field] = new Date(to);
        } else {
          q[field] = to;
        }
      }
    }

    if (typeof req.body.companyInfo !== 'undefined') {
      const from = q.companyInfo;
      const to = req.body.companyInfo;
      if (JSON.stringify(from) !== JSON.stringify(to)) {
        changes.push({ field: 'companyInfo', from, to });
        q.companyInfo = to;
      }
    }
    if (typeof req.body.scopeOfWork !== 'undefined') {
      const from = q.scopeOfWork;
      const to = toRichString(req.body.scopeOfWork, 'scopeOfWork');
      if (JSON.stringify(from) !== JSON.stringify(to)) {
        changes.push({ field: 'scopeOfWork', from, to });
        q.scopeOfWork = to;
      }
    }
    if (typeof req.body.priceSchedule !== 'undefined') {
      const from = q.priceSchedule;
      const to = toRichString(req.body.priceSchedule, 'priceSchedule');
      if (JSON.stringify(from) !== JSON.stringify(to)) {
        changes.push({ field: 'priceSchedule', from, to });
        q.priceSchedule = to;
      }
    }
    if (typeof req.body.exclusions !== 'undefined') {
      const from = q.exclusions;
      const to = toRichString(req.body.exclusions, 'exclusions');
      if (JSON.stringify(from) !== JSON.stringify(to)) {
        changes.push({ field: 'exclusions', from, to });
        q.exclusions = to;
      }
    }
    if (typeof req.body.paymentTerms !== 'undefined') {
      const from = q.paymentTerms;
      const to = toRichString(req.body.paymentTerms, 'paymentTerms');
      if (JSON.stringify(from) !== JSON.stringify(to)) {
        changes.push({ field: 'paymentTerms', from, to });
        q.paymentTerms = to;
      }
    }
    if (typeof req.body.deliveryCompletionWarrantyValidity !== 'undefined') {
      const from = q.deliveryCompletionWarrantyValidity;
      const to = req.body.deliveryCompletionWarrantyValidity;
      if (JSON.stringify(from) !== JSON.stringify(to)) {
        changes.push({ field: 'deliveryCompletionWarrantyValidity', from, to });
        q.deliveryCompletionWarrantyValidity = to;
      }
    }

    if (changes.length > 0) {
      q.edits.push({ editedBy: req.user.userId, changes });
    }

    await q.save();
    
    // Create audit log for quotation update if there were changes
    if (changes.length > 0) {
      try {
        await q.populate('lead', 'customerName projectTitle');
        const leadData = typeof q.lead === 'object' ? q.lead : null;
        await AuditLog.create({
          action: 'quotation_updated',
          entityType: 'quotation',
          entityId: q._id,
          entityData: {
            offerReference: q.offerReference || null,
            projectTitle: q.projectTitle || leadData?.projectTitle || null,
            customerName: leadData?.customerName || null,
            grandTotal: q.priceSchedule?.grandTotal || null,
            currency: q.priceSchedule?.currency || null,
            managementApprovalStatus: q.managementApproval?.status || null,
            changesCount: changes.length
          },
          performedBy: req.user.userId,
          performedAt: new Date(),
          reason: `Updated ${changes.length} field(s)`,
          ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
          userAgent: req.get('user-agent') || 'unknown'
        });
      } catch (auditError) {
        console.error('Error creating audit log for quotation update:', auditError);
      }
    }
    
    await q.populate('edits.editedBy', 'name email');
    res.json(q);
  } catch (e) {
    console.error('Error updating quotation:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete quotation
router.delete('/:id', auth, async (req, res) => {
  try {
    const q = await Quotation.findById(req.params.id)
      .populate('lead', 'customerName projectTitle')
      .populate('createdBy', 'name email');
    if (!q) return res.status(404).json({ message: 'Quotation not found' });

    const roles = req.user.roles || [];
    const isApproved = q.managementApproval?.status === 'approved';
    
    // If approved, only manager or admin can delete
    if (isApproved && !roles.includes('manager') && !roles.includes('admin')) {
      return res.status(403).json({ message: 'Only managers and admins can delete approved quotations' });
    }

    // Check if any revisions exist for this quotation
    const revisionCount = await Revision.countDocuments({ parentQuotation: q._id });
    if (revisionCount > 0) {
      return res.status(400).json({ message: 'Cannot delete quotation: revisions exist for this quotation. Delete all revisions first.' });
    }

    // Create audit log before deletion
    const leadData = typeof q.lead === 'object' ? q.lead : null;
    // Handle createdBy - could be populated object or ObjectId
    let createdById = null;
    if (q.createdBy) {
      if (typeof q.createdBy === 'object' && q.createdBy._id) {
        createdById = q.createdBy._id;
      } else if (typeof q.createdBy === 'object' && q.createdBy.toString) {
        createdById = q.createdBy;
      } else {
        createdById = q.createdBy;
      }
    }
    
    try {
      await AuditLog.create({
        action: 'quotation_deleted',
        entityType: 'quotation',
        entityId: q._id,
        entityData: {
          offerReference: q.offerReference || null,
          projectTitle: q.projectTitle || leadData?.projectTitle || null,
          customerName: leadData?.customerName || null,
          grandTotal: q.priceSchedule?.grandTotal || null,
          currency: q.priceSchedule?.currency || null,
          managementApprovalStatus: q.managementApproval?.status || null,
          createdBy: createdById,
          createdAt: q.createdAt || null
        },
        deletedBy: req.user.userId,
        deletedAt: new Date(),
        reason: (req.body && req.body.reason) ? req.body.reason : null,
        ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
        userAgent: req.get('user-agent') || 'unknown'
      });
    } catch (auditError) {
      console.error('Error creating audit log:', auditError);
      // Continue with deletion even if audit log fails
    }

    await Quotation.findByIdAndDelete(req.params.id);
    res.json({ message: 'Quotation deleted successfully' });
  } catch (e) {
    console.error('Error deleting quotation:', e);
    res.status(500).json({ message: 'Server error', error: process.env.NODE_ENV === 'development' ? e.message : undefined });
  }
});

// Management approval
router.patch('/:id/approve', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const note = req.body.note ?? req.body.comments;
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const q = await Quotation.findById(req.params.id);
    if (!q) return res.status(404).json({ message: 'Quotation not found' });

    const roles = req.user.roles || [];
    const isCreator = q.createdBy?.toString?.() === req.user.userId;

    if (status === 'pending') {
      if (!(isCreator || roles.includes('estimation_engineer'))) {
        return res.status(403).json({ message: 'Not authorized to request approval' });
      }
      const prev = q.managementApproval || {};
      q.managementApproval = {
        ...prev,
        status: 'pending',
        requestedBy: req.user.userId,
        approvedBy: undefined,
        approvedAt: undefined,
        comments: note || prev.comments
      };
      q.managementApproval.logs = Array.isArray(prev.logs) ? prev.logs : [];
      q.managementApproval.logs.push({ status: 'pending', requestedBy: req.user.userId, note });
    } else {
      if (!(roles.includes('manager') || roles.includes('admin'))) {
        return res.status(403).json({ message: 'Not authorized to approve/reject' });
      }
      const prev = q.managementApproval || {};
      q.managementApproval = {
        ...prev,
        status,
        approvedBy: req.user.userId,
        approvedAt: new Date(),
        comments: note || prev.comments,
        requestedBy: prev.requestedBy
      };
      q.managementApproval.logs = Array.isArray(prev.logs) ? prev.logs : [];
      q.managementApproval.logs.push({ status, decidedBy: req.user.userId, note });
    }

    await q.save();
    
    // Create audit log for approval/rejection actions
    try {
      let auditAction = null;
      if (status === 'pending') {
        auditAction = 'quotation_approval_requested';
      } else if (status === 'approved') {
        auditAction = 'quotation_approved';
      } else if (status === 'rejected') {
        auditAction = 'quotation_rejected';
      }
      
      if (auditAction) {
        await q.populate('lead', 'customerName projectTitle');
        const leadData = typeof q.lead === 'object' ? q.lead : null;
        await AuditLog.create({
          action: auditAction,
          entityType: 'quotation',
          entityId: q._id,
          entityData: {
            offerReference: q.offerReference || null,
            projectTitle: q.projectTitle || leadData?.projectTitle || null,
            customerName: leadData?.customerName || null,
            grandTotal: q.priceSchedule?.grandTotal || null,
            currency: q.priceSchedule?.currency || null,
            managementApprovalStatus: status
          },
          performedBy: req.user.userId,
          performedAt: new Date(),
          reason: note || null,
          ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
          userAgent: req.get('user-agent') || 'unknown'
        });
      }
    } catch (auditError) {
      console.error('Error creating audit log:', auditError);
    }
    
    await q.populate('managementApproval.requestedBy', 'name email');
    await q.populate('managementApproval.approvedBy', 'name email');
    await q.populate('managementApproval.logs.requestedBy', 'name email');
    await q.populate('managementApproval.logs.decidedBy', 'name email');
    res.json(q);
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;


