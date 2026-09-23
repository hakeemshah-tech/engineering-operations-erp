const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const CompanyDocument = require('../models/CompanyDocument');
const router = express.Router();

const uploadsDir = path.join(__dirname, '..', 'uploads', 'company-documents');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const allowedMimes = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

const fileFilter = (req, file, cb) => {
  if (allowedMimes.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Invalid file type. Images, PDFs, and Office documents are allowed.'), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const hasAccess = (roles) => roles.includes('admin') || roles.includes('manager');

function attachFileUrls(doc) {
  if (!doc) return doc;
  const obj = typeof doc.toObject === 'function' ? doc.toObject({ virtuals: true }) : { ...doc };
  if (Array.isArray(obj.attachments)) {
    obj.attachments = obj.attachments.map(a => ({
      ...a,
      fileUrl: a.filename ? `/uploads/company-documents/${a.filename}` : null
    }));
  }
  return obj;
}

function unlinkSilent(p) {
  try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { /* ignore */ }
}

// GET list with filters
router.get('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const {
      status, documentType, priority, department, owner, search,
      expiringWithin, includeArchived, page = 1, limit = 50
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (documentType) filter.documentType = documentType;
    if (priority) filter.priority = priority;
    if (department) filter.department = department;
    if (owner) filter.owner = owner;

    if (!includeArchived || includeArchived === 'false') {
      if (!status) filter.status = { $ne: 'archived' };
    }

    if (expiringWithin) {
      const days = parseInt(expiringWithin, 10);
      if (!isNaN(days)) {
        const now = new Date();
        const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        filter.expiryDate = { $gte: now, $lte: until };
        filter.noExpiry = { $ne: true };
      }
    }

    if (search) {
      filter.$or = [
        { documentName: { $regex: search, $options: 'i' } },
        { documentNumber: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      CompanyDocument.find(filter)
        .populate('createdBy', 'name email')
        .populate('owner', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      CompanyDocument.countDocuments(filter)
    ]);

    res.json({
      items: items.map(attachFileUrls),
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum) || 1,
      limit: limitNum
    });
  } catch (error) {
    console.error('Error fetching company documents:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET single
router.get('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const doc = await CompanyDocument.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('owner', 'name email')
      .populate('edits.editedBy', 'name email')
      .populate('attachments.uploadedBy', 'name email');

    if (!doc) return res.status(404).json({ message: 'Document not found.' });
    res.json(attachFileUrls(doc));
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create
router.post('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const body = req.body || {};
    if (!body.documentName || !String(body.documentName).trim()) {
      return res.status(400).json({ message: 'Document name is required.' });
    }
    if (!body.documentType) {
      return res.status(400).json({ message: 'Document type is required.' });
    }

    const doc = await CompanyDocument.create({
      ...body,
      documentName: String(body.documentName).trim(),
      createdBy: req.user.userId
    });

    await doc.populate('createdBy', 'name email');
    res.status(201).json(attachFileUrls(doc));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Duplicate document number.' });
    }
    console.error('Error creating document:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update with edit tracking
router.put('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const doc = await CompanyDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Document not found.' });

    const body = req.body || {};
    const trackFields = [
      'documentName', 'documentType', 'description', 'category', 'department',
      'issueDate', 'expiryDate', 'noExpiry', 'priority', 'version',
      'owner', 'responsiblePerson', 'reminderDaysBefore', 'lastRenewedAt', 'renewalNotes',
      'primaryAttachmentId', 'status'
    ];

    const changes = [];
    for (const field of trackFields) {
      if (body[field] !== undefined) {
        const nextVal = typeof body[field] === 'string' ? body[field].trim() : body[field];
        const prevVal = doc[field];
        if (String(nextVal ?? '') !== String(prevVal ?? '')) {
          changes.push({ field, from: prevVal, to: nextVal });
        }
      }
    }
    if (body.tags !== undefined) {
      const prevJson = JSON.stringify(doc.tags || []);
      const nextJson = JSON.stringify(body.tags || []);
      if (prevJson !== nextJson) changes.push({ field: 'tags', from: doc.tags, to: body.tags });
    }

    if (changes.length > 0) {
      doc.edits.push({ editedBy: req.user.userId, editedAt: new Date(), changes });
    }

    trackFields.forEach(f => {
      if (body[f] !== undefined) {
        doc[f] = typeof body[f] === 'string' ? body[f].trim() : body[f];
      }
    });
    if (Array.isArray(body.tags)) doc.tags = body.tags;

    await doc.save();
    await doc.populate('createdBy', 'name email');
    await doc.populate('owner', 'name email');
    await doc.populate('edits.editedBy', 'name email');

    res.json(attachFileUrls(doc));
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE
router.delete('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const doc = await CompanyDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Document not found.' });

    (doc.attachments || []).forEach(a => unlinkSilent(a.path));
    await doc.deleteOne();
    res.json({ message: 'Document deleted successfully.' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST attachments - append
router.post('/:id/attachments', auth, upload.array('files', 10), async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) {
      (req.files || []).forEach(f => unlinkSilent(f.path));
      return res.status(403).json({ message: 'Access denied.' });
    }

    const doc = await CompanyDocument.findById(req.params.id);
    if (!doc) {
      (req.files || []).forEach(f => unlinkSilent(f.path));
      return res.status(404).json({ message: 'Document not found.' });
    }

    const files = req.files || [];
    if (files.length === 0) return res.status(400).json({ message: 'No files uploaded.' });

    const prevCount = doc.attachments.length;
    files.forEach(f => {
      doc.attachments.push({
        filename: f.filename,
        originalName: f.originalname,
        path: f.path,
        mimetype: f.mimetype,
        size: f.size,
        uploadedAt: new Date(),
        uploadedBy: req.user.userId
      });
    });

    doc.edits.push({
      editedBy: req.user.userId,
      editedAt: new Date(),
      changes: [{ field: 'attachments', from: prevCount, to: doc.attachments.length }]
    });

    await doc.save();
    await doc.populate('attachments.uploadedBy', 'name email');
    res.json(attachFileUrls(doc));
  } catch (error) {
    (req.files || []).forEach(f => unlinkSilent(f.path));
    console.error('Error uploading attachments:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE one attachment
router.delete('/:id/attachments/:attachmentId', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const doc = await CompanyDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Document not found.' });

    const attachment = doc.attachments.id(req.params.attachmentId);
    if (!attachment) return res.status(404).json({ message: 'Attachment not found.' });

    unlinkSilent(attachment.path);
    const prevCount = doc.attachments.length;
    attachment.deleteOne();

    doc.edits.push({
      editedBy: req.user.userId,
      editedAt: new Date(),
      changes: [{ field: 'attachments', from: prevCount, to: doc.attachments.length }]
    });

    await doc.save();
    res.json(attachFileUrls(doc));
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH archive / unarchive
router.patch('/:id/archive', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const doc = await CompanyDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Document not found.' });

    const wasArchived = doc.status === 'archived';
    doc.status = wasArchived ? 'active' : 'archived';
    doc.edits.push({
      editedBy: req.user.userId,
      editedAt: new Date(),
      changes: [{ field: 'status', from: wasArchived ? 'archived' : doc.status, to: doc.status }]
    });
    await doc.save();
    res.json(attachFileUrls(doc));
  } catch (error) {
    console.error('Error archiving document:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST recompute statuses (admin-only maintenance endpoint)
router.post('/recompute-statuses', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!roles.includes('admin')) return res.status(403).json({ message: 'Access denied.' });

    const docs = await CompanyDocument.find({ status: { $ne: 'archived' } });
    let updated = 0;
    for (const d of docs) {
      const newStatus = CompanyDocument.computeExpiryStatus(d);
      if (newStatus !== d.status) {
        d.status = newStatus;
        await d.save();
        updated++;
      }
    }
    res.json({ message: 'Recompute complete.', scanned: docs.length, updated });
  } catch (error) {
    console.error('Error recomputing statuses:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
