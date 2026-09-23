const express = require('express');
const jwt = require('jsonwebtoken');
const Quotation = require('../models/Quotation');
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

// List revisions
router.get('/', auth, async (req, res) => {
  try {
    const filter = {}
    if (req.query.parentQuotation) filter.parentQuotation = req.query.parentQuotation
    const list = await Revision.find(filter)
      .populate('lead', 'customerName projectTitle enquiryNumber enquiryDate')
      .populate('createdBy', 'name email')
      .populate('parentQuotation', 'offerReference projectTitle')
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
    const r = await Revision.findById(req.params.id)
      .populate('lead', 'customerName projectTitle enquiryNumber enquiryDate')
      .populate('createdBy', 'name email')
      .populate('parentQuotation', 'offerReference projectTitle')
      .populate('edits.editedBy', 'name email')
      .populate('managementApproval.requestedBy', 'name email')
      .populate('managementApproval.approvedBy', 'name email')
      .populate('managementApproval.logs.requestedBy', 'name email')
      .populate('managementApproval.logs.decidedBy', 'name email');
    if (!r) return res.status(404).json({ message: 'Revision not found' });
    res.json(r);
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update revision (creator or estimation engineers)
router.put('/:id', auth, async (req, res) => {
  try {
    const r = await Revision.findById(req.params.id);
    if (!r) return res.status(404).json({ message: 'Revision not found' });

    const roles = req.user.roles || [];
    const isCreator = r.createdBy?.toString?.() === req.user.userId;
    if (!isCreator && !roles.includes('estimation_engineer')) {
      return res.status(403).json({ message: 'Not authorized to edit revision' });
    }

    const updatableRootFields = [
      'submittedTo','attention','offerReference','enquiryNumber','offerDate','enquiryDate','projectTitle','introductionText','ourViewpoints'
    ];

    const changes = [];

    const isDateField = (f) => ['offerDate','enquiryDate'].includes(f);
    const normalizeForCompare = (f, v) => {
      if (v === '' || typeof v === 'undefined' || v === null) return null;
      if (isDateField(f)) {
        const d = new Date(v);
        if (isNaN(d)) return null;
        return d.toISOString().slice(0,10);
      }
      return v;
    };

    for (const field of updatableRootFields) {
      if (typeof req.body[field] === 'undefined') continue;
      const fromRaw = r[field];
      const toRaw = req.body[field];
      const from = normalizeForCompare(field, fromRaw);
      const to = normalizeForCompare(field, toRaw);
      if (JSON.stringify(from) !== JSON.stringify(to)) {
        changes.push({ field, from, to });
        r[field] = isDateField(field) ? (to ? new Date(to) : null) : toRaw;
      }
    }

    if (typeof req.body.companyInfo !== 'undefined') {
      const from = r.companyInfo; const to = req.body.companyInfo;
      if (JSON.stringify(from) !== JSON.stringify(to)) { changes.push({ field: 'companyInfo', from, to }); r.companyInfo = to; }
    }
    if (typeof req.body.scopeOfWork !== 'undefined') {
      const from = r.scopeOfWork; const to = req.body.scopeOfWork;
      if (JSON.stringify(from) !== JSON.stringify(to)) { changes.push({ field: 'scopeOfWork', from, to }); r.scopeOfWork = to; }
    }
    if (typeof req.body.priceSchedule !== 'undefined') {
      const from = r.priceSchedule; const to = req.body.priceSchedule;
      if (JSON.stringify(from) !== JSON.stringify(to)) { changes.push({ field: 'priceSchedule', from, to }); r.priceSchedule = to; }
    }
    if (typeof req.body.exclusions !== 'undefined') {
      const from = r.exclusions; const to = req.body.exclusions;
      if (JSON.stringify(from) !== JSON.stringify(to)) { changes.push({ field: 'exclusions', from, to }); r.exclusions = to; }
    }
    if (typeof req.body.paymentTerms !== 'undefined') {
      const from = r.paymentTerms; const to = req.body.paymentTerms;
      if (JSON.stringify(from) !== JSON.stringify(to)) { changes.push({ field: 'paymentTerms', from, to }); r.paymentTerms = to; }
    }
    if (typeof req.body.deliveryCompletionWarrantyValidity !== 'undefined') {
      const from = r.deliveryCompletionWarrantyValidity; const to = req.body.deliveryCompletionWarrantyValidity;
      if (JSON.stringify(from) !== JSON.stringify(to)) { changes.push({ field: 'deliveryCompletionWarrantyValidity', from, to }); r.deliveryCompletionWarrantyValidity = to; }
    }

    if (changes.length > 0) {
      r.edits.push({ editedBy: req.user.userId, changes });
    }

    await r.save();
    await r.populate('edits.editedBy', 'name email');
    res.json(r);
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Management approval for revisions
router.patch('/:id/approve', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const note = req.body.note ?? req.body.comments;
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const r = await Revision.findById(req.params.id);
    if (!r) return res.status(404).json({ message: 'Revision not found' });

    const roles = req.user.roles || [];
    const isCreator = r.createdBy?.toString?.() === req.user.userId;

    if (status === 'pending') {
      if (!(isCreator || roles.includes('estimation_engineer'))) {
        return res.status(403).json({ message: 'Not authorized to request approval' });
      }
      const prev = r.managementApproval || {};
      r.managementApproval = {
        ...prev,
        status: 'pending',
        requestedBy: req.user.userId,
        approvedBy: undefined,
        approvedAt: undefined,
        comments: note || prev.comments
      };
      r.managementApproval.logs = Array.isArray(prev.logs) ? prev.logs : [];
      r.managementApproval.logs.push({ status: 'pending', requestedBy: req.user.userId, note });
    } else {
      if (!(roles.includes('manager') || roles.includes('admin'))) {
        return res.status(403).json({ message: 'Not authorized to approve/reject' });
      }
      const prev = r.managementApproval || {};
      r.managementApproval = {
        ...prev,
        status,
        approvedBy: req.user.userId,
        approvedAt: new Date(),
        comments: note || prev.comments,
        requestedBy: prev.requestedBy
      };
      r.managementApproval.logs = Array.isArray(prev.logs) ? prev.logs : [];
      r.managementApproval.logs.push({ status, decidedBy: req.user.userId, note });
    }

    await r.save();
    
    // Create audit log for approval/rejection actions
    try {
      let auditAction = null;
      if (status === 'pending') {
        auditAction = 'revision_approval_requested';
      } else if (status === 'approved') {
        auditAction = 'revision_approved';
      } else if (status === 'rejected') {
        auditAction = 'revision_rejected';
      }
      
      if (auditAction) {
        await r.populate('parentQuotation', 'offerReference');
        await r.populate('lead', 'customerName projectTitle');
        const quotationData = typeof r.parentQuotation === 'object' ? r.parentQuotation : null;
        const leadData = typeof r.lead === 'object' ? r.lead : null;
        await AuditLog.create({
          action: auditAction,
          entityType: 'revision',
          entityId: r._id,
          entityData: {
            revisionNumber: r.revisionNumber || null,
            projectTitle: r.projectTitle || leadData?.projectTitle || null,
            customerName: leadData?.customerName || null,
            offerReference: quotationData?.offerReference || null,
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
    
    await r.populate('managementApproval.requestedBy', 'name email');
    await r.populate('managementApproval.approvedBy', 'name email');
    await r.populate('managementApproval.logs.requestedBy', 'name email');
    await r.populate('managementApproval.logs.decidedBy', 'name email');

    res.json(r);
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a revision from an approved quotation
router.post('/', auth, async (req, res) => {
  try {
    const { sourceQuotationId, sourceRevisionId, data } = req.body;
    if (!sourceQuotationId && !sourceRevisionId) return res.status(400).json({ message: 'sourceQuotationId or sourceRevisionId is required' });
    const sourceDoc = sourceRevisionId ? await Revision.findById(sourceRevisionId) : await Quotation.findById(sourceQuotationId)
      .populate('lead')
      .populate('createdBy')
      .populate('edits.editedBy')
      .populate('managementApproval.requestedBy')
      .populate('managementApproval.approvedBy');
    if (!sourceDoc) return res.status(404).json({ message: 'Source not found' });
    if (!sourceRevisionId && sourceDoc.managementApproval?.status !== 'approved') {
      return res.status(400).json({ message: 'Only approved quotations can be revised' });
    }

    const parentQuotationId = sourceRevisionId ? sourceDoc.parentQuotation : sourceDoc._id;
    // If creating from a revision, block if a child revision already exists
    if (sourceRevisionId) {
      const childCount = await Revision.countDocuments({ parentRevision: sourceRevisionId });
      if (childCount > 0) {
        return res.status(400).json({ message: 'A child revision already exists for this revision.' });
      }
    }
    
    // Get the parent quotation to access lead information for project key
    const parentQuotation = await Quotation.findById(parentQuotationId).populate('lead');
    if (!parentQuotation) return res.status(404).json({ message: 'Parent quotation not found' });
    
    // Generate project key from project title or customer name (uppercase, alphanumeric, max 8 chars)
    const projectName = parentQuotation.projectTitle || parentQuotation.lead?.projectTitle || parentQuotation.lead?.customerName || 'PROJ';
    const projectKey = projectName
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 8) || 'PROJ';
    
    // Count existing revisions for this quotation
    const existingCount = await Revision.countDocuments({ parentQuotation: parentQuotationId });
    const revisionNum = existingCount + 1;
    const revisionNumber = `${projectKey}-REV-${String(revisionNum).padStart(3, '0')}`;
    if (sourceQuotationId && existingCount > 0) {
      return res.status(400).json({ message: 'A revision already exists for this quotation. Delete all revisions to create a new one from the approved quotation.' });
    }

    const base = sourceDoc.toObject({ depopulate: true });
    delete base._id;
    delete base.createdAt;
    delete base.updatedAt;
    // ensure clean slate for new revision-specific state
    delete base.edits;
    delete base.managementApproval;

    const allowedFields = [
      'companyInfo','submittedTo','attention','offerReference','enquiryNumber','offerDate','enquiryDate','projectTitle','introductionText',
      'scopeOfWork','priceSchedule','ourViewpoints','exclusions','paymentTerms','deliveryCompletionWarrantyValidity'
    ];

    const nextData = { ...base };
    const diffs = [];
    for (const field of allowedFields) {
      if (typeof data?.[field] === 'undefined') continue;
      const normalizeForDiff = (f, v) => {
        if (v === '' || typeof v === 'undefined') return null;
        if (['offerDate','enquiryDate'].includes(f)) {
          if (!v) return null;
          const d = new Date(v);
          if (isNaN(d)) return null;
          return d.toISOString().slice(0,10);
        }
        if (['exclusions', 'paymentTerms'].includes(f) && typeof v === 'string') {
          return v.replace(/<br\s*\/?>/gi, '\n').replace(/\r\n/g, '\n').trim();
        }
        return v;
      };
      const fromValRaw = base[field];
      const toValRaw = data[field];
      const fromVal = normalizeForDiff(field, fromValRaw);
      const toVal = normalizeForDiff(field, toValRaw);
      if (JSON.stringify(fromVal) !== JSON.stringify(toVal)) {
        diffs.push({ field, from: fromVal, to: toVal });
        // Persist normalized types for dates
        if (['offerDate','enquiryDate'].includes(field)) {
          nextData[field] = toVal ? new Date(toVal) : null;
        } else {
          nextData[field] = toValRaw;
        }
      }
    }

    if (diffs.length === 0) {
      return res.status(400).json({ message: 'No changes detected. Please modify data before creating a revision.' });
    }

    const revision = await Revision.create({
      ...nextData,
      parentQuotation: parentQuotationId,
      parentRevision: sourceRevisionId || undefined,
      revisionNumber,
      createdBy: req.user.userId,
      diffFromParent: diffs,
      edits: [],
      managementApproval: {}
    });

    const populated = await Revision.findById(revision._id)
      .populate('lead', 'customerName projectTitle enquiryNumber enquiryDate')
      .populate('createdBy', 'name email')
      .populate('parentQuotation', 'offerReference projectTitle')
      .populate('edits.editedBy', 'name email')
      .populate('managementApproval.requestedBy', 'name email')
      .populate('managementApproval.approvedBy', 'name email')
      .populate('managementApproval.logs.requestedBy', 'name email')
      .populate('managementApproval.logs.decidedBy', 'name email');

    // Create audit log for revision creation from quotation
    if (sourceQuotationId) {
      try {
        const quotationData = typeof populated.parentQuotation === 'object' ? populated.parentQuotation : null;
        const leadData = typeof populated.lead === 'object' ? populated.lead : null;
        await AuditLog.create({
          action: 'revision_created',
          entityType: 'revision',
          entityId: revision._id,
          entityData: {
            revisionNumber: revision.revisionNumber || null,
            projectTitle: populated.projectTitle || leadData?.projectTitle || null,
            customerName: leadData?.customerName || null,
            offerReference: quotationData?.offerReference || null,
            parentQuotationId: parentQuotationId,
            changesCount: diffs.length
          },
          performedBy: req.user.userId,
          performedAt: new Date(),
          reason: `Created revision from quotation with ${diffs.length} change(s)`,
          ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
          userAgent: req.get('user-agent') || 'unknown'
        });
      } catch (auditError) {
        console.error('Error creating audit log for revision creation:', auditError);
      }
    }

    res.status(201).json(populated);
  } catch (e) {
    console.error('Error creating revision:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete revision (estimation engineers can delete non-approved, managers/admin can delete approved)
router.delete('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    const isEstimationEngineer = roles.includes('estimation_engineer');
    const isManagerOrAdmin = roles.includes('manager') || roles.includes('admin');
    
    if (!isEstimationEngineer && !isManagerOrAdmin) {
      return res.status(403).json({ message: 'Only estimation engineers, managers, and admins can delete revisions' });
    }
    const rev = await Revision.findById(req.params.id)
      .populate('parentQuotation', 'offerReference')
      .populate('lead', 'customerName projectTitle')
      .populate('createdBy', 'name email');
    if (!rev) return res.status(404).json({ message: 'Revision not found' });
    
    // Estimation engineers cannot delete approved revisions
    // Managers and admins can delete approved revisions
    if (rev?.managementApproval?.status === 'approved' && !isManagerOrAdmin) {
      return res.status(400).json({ message: 'Cannot delete: revision is approved' });
    }
    const children = await Revision.countDocuments({ parentRevision: rev._id });
    if (children > 0) return res.status(400).json({ message: 'Cannot delete: subsequent revisions depend on this revision' });
    
    // Create audit log before deletion
    const quotationData = typeof rev.parentQuotation === 'object' ? rev.parentQuotation : null;
    const leadData = typeof rev.lead === 'object' ? rev.lead : null;
    let createdById = null;
    if (rev.createdBy) {
      if (typeof rev.createdBy === 'object' && rev.createdBy._id) {
        createdById = rev.createdBy._id;
      } else {
        createdById = rev.createdBy;
      }
    }
    
    try {
      await AuditLog.create({
        action: 'revision_deleted',
        entityType: 'revision',
        entityId: rev._id,
        entityData: {
          revisionNumber: rev.revisionNumber || null,
          projectTitle: rev.projectTitle || leadData?.projectTitle || null,
          customerName: leadData?.customerName || null,
          offerReference: quotationData?.offerReference || null,
          managementApprovalStatus: rev.managementApproval?.status || null,
          createdBy: createdById,
          createdAt: rev.createdAt || null
        },
        deletedBy: req.user.userId,
        deletedAt: new Date(),
        reason: (req.body && req.body.reason) ? req.body.reason : null,
        ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
        userAgent: req.get('user-agent') || 'unknown'
      });
    } catch (auditError) {
      console.error('Error creating audit log:', auditError);
    }
    
    await Revision.deleteOne({ _id: rev._id });
    res.json({ success: true });
  } catch (e) {
    console.error('Error deleting revision:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;


