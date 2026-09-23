const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Credential = require('../models/Credential');
const router = express.Router();

const uploadsDir = path.join(__dirname, '..', 'uploads', 'credentials');
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
      fileUrl: a.filename ? `/uploads/credentials/${a.filename}` : null
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
      status, credentialType, verificationStatus, issuingAuthority, search,
      expiringWithin, page = 1, limit = 50
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (credentialType) filter.credentialType = credentialType;
    if (verificationStatus) filter.verificationStatus = verificationStatus;
    if (issuingAuthority) filter.issuingAuthority = issuingAuthority;

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
        { credentialName: { $regex: search, $options: 'i' } },
        { credentialNumber: { $regex: search, $options: 'i' } },
        { issuingAuthority: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Credential.find(filter)
        .populate('createdBy', 'name email')
        .populate('responsiblePerson', 'name email')
        .populate('verifiedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Credential.countDocuments(filter)
    ]);

    res.json({
      items: items.map(attachFileUrls),
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum) || 1,
      limit: limitNum
    });
  } catch (error) {
    console.error('Error fetching credentials:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET single
router.get('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const cred = await Credential.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('responsiblePerson', 'name email')
      .populate('verifiedBy', 'name email')
      .populate('edits.editedBy', 'name email')
      .populate('attachments.uploadedBy', 'name email')
      .populate('renewalHistory.renewedBy', 'name email');

    if (!cred) return res.status(404).json({ message: 'Credential not found.' });
    res.json(attachFileUrls(cred));
  } catch (error) {
    console.error('Error fetching credential:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create
router.post('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const body = req.body || {};
    if (!body.credentialName || !String(body.credentialName).trim()) {
      return res.status(400).json({ message: 'Credential name is required.' });
    }
    if (!body.issuingAuthority || !String(body.issuingAuthority).trim()) {
      return res.status(400).json({ message: 'Issuing authority is required.' });
    }

    const cred = await Credential.create({
      ...body,
      credentialName: String(body.credentialName).trim(),
      issuingAuthority: String(body.issuingAuthority).trim(),
      createdBy: req.user.userId
    });

    await cred.populate('createdBy', 'name email');
    res.status(201).json(attachFileUrls(cred));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Duplicate credential number.' });
    }
    console.error('Error creating credential:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update with edit tracking
router.put('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const cred = await Credential.findById(req.params.id);
    if (!cred) return res.status(404).json({ message: 'Credential not found.' });

    const body = req.body || {};
    const trackFields = [
      'credentialName', 'credentialType', 'issuingAuthority', 'description',
      'issueDate', 'expiryDate', 'renewalDate', 'noExpiry',
      'priority', 'status', 'verificationStatus',
      'coverageScope', 'applicableRegion', 'level',
      'ownerDepartment', 'responsiblePerson',
      'reminderDaysBefore', 'renewalFee', 'renewalNotes'
    ];

    const changes = [];
    for (const field of trackFields) {
      if (body[field] !== undefined) {
        const nextVal = typeof body[field] === 'string' ? body[field].trim() : body[field];
        const prevVal = cred[field];
        if (String(nextVal ?? '') !== String(prevVal ?? '')) {
          changes.push({ field, from: prevVal, to: nextVal });
        }
      }
    }

    if (changes.length > 0) {
      cred.edits.push({ editedBy: req.user.userId, editedAt: new Date(), changes });
    }

    trackFields.forEach(f => {
      if (body[f] !== undefined) {
        cred[f] = typeof body[f] === 'string' ? body[f].trim() : body[f];
      }
    });

    await cred.save();
    await cred.populate('createdBy', 'name email');
    await cred.populate('responsiblePerson', 'name email');
    await cred.populate('verifiedBy', 'name email');
    await cred.populate('edits.editedBy', 'name email');

    res.json(attachFileUrls(cred));
  } catch (error) {
    console.error('Error updating credential:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE
router.delete('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const cred = await Credential.findById(req.params.id);
    if (!cred) return res.status(404).json({ message: 'Credential not found.' });

    (cred.attachments || []).forEach(a => unlinkSilent(a.path));
    await cred.deleteOne();
    res.json({ message: 'Credential deleted successfully.' });
  } catch (error) {
    console.error('Error deleting credential:', error);
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

    const cred = await Credential.findById(req.params.id);
    if (!cred) {
      (req.files || []).forEach(f => unlinkSilent(f.path));
      return res.status(404).json({ message: 'Credential not found.' });
    }

    const files = req.files || [];
    if (files.length === 0) return res.status(400).json({ message: 'No files uploaded.' });

    const prevCount = cred.attachments.length;
    files.forEach(f => {
      cred.attachments.push({
        filename: f.filename,
        originalName: f.originalname,
        path: f.path,
        mimetype: f.mimetype,
        size: f.size,
        uploadedAt: new Date(),
        uploadedBy: req.user.userId
      });
    });

    cred.edits.push({
      editedBy: req.user.userId,
      editedAt: new Date(),
      changes: [{ field: 'attachments', from: prevCount, to: cred.attachments.length }]
    });

    await cred.save();
    res.json(attachFileUrls(cred));
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

    const cred = await Credential.findById(req.params.id);
    if (!cred) return res.status(404).json({ message: 'Credential not found.' });

    const attachment = cred.attachments.id(req.params.attachmentId);
    if (!attachment) return res.status(404).json({ message: 'Attachment not found.' });

    unlinkSilent(attachment.path);
    const prevCount = cred.attachments.length;
    attachment.deleteOne();

    cred.edits.push({
      editedBy: req.user.userId,
      editedAt: new Date(),
      changes: [{ field: 'attachments', from: prevCount, to: cred.attachments.length }]
    });

    await cred.save();
    res.json(attachFileUrls(cred));
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST verify
router.post('/:id/verify', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const cred = await Credential.findById(req.params.id);
    if (!cred) return res.status(404).json({ message: 'Credential not found.' });

    const wasVerified = cred.verificationStatus === 'verified';
    cred.verificationStatus = wasVerified ? 'unverified' : 'verified';
    cred.verifiedBy = wasVerified ? null : req.user.userId;
    cred.verifiedAt = wasVerified ? null : new Date();

    cred.edits.push({
      editedBy: req.user.userId,
      editedAt: new Date(),
      changes: [{ field: 'verificationStatus', from: wasVerified ? 'verified' : 'unverified', to: cred.verificationStatus }]
    });

    await cred.save();
    res.json(attachFileUrls(cred));
  } catch (error) {
    console.error('Error verifying credential:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST renew
router.post('/:id/renew', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const cred = await Credential.findById(req.params.id);
    if (!cred) return res.status(404).json({ message: 'Credential not found.' });

    const { newExpiryDate, notes, renewalFee } = req.body || {};
    if (!newExpiryDate) return res.status(400).json({ message: 'New expiry date is required.' });

    cred.renewalHistory.push({
      renewedAt: new Date(),
      renewedBy: req.user.userId,
      previousExpiry: cred.expiryDate,
      newExpiry: newExpiryDate,
      renewalFee: renewalFee || 0,
      notes: notes || ''
    });

    cred.expiryDate = newExpiryDate;
    cred.renewalDate = new Date();
    cred.status = 'active';

    cred.edits.push({
      editedBy: req.user.userId,
      editedAt: new Date(),
      changes: [
        { field: 'expiryDate', from: cred.renewalHistory[cred.renewalHistory.length - 1].previousExpiry, to: newExpiryDate },
        { field: 'renewalDate', from: null, to: new Date() }
      ]
    });

    await cred.save();
    await cred.populate('renewalHistory.renewedBy', 'name email');
    res.json(attachFileUrls(cred));
  } catch (error) {
    console.error('Error renewing credential:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST recompute statuses (admin-only)
router.post('/recompute-statuses', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!roles.includes('admin')) return res.status(403).json({ message: 'Access denied.' });

    const creds = await Credential.find({ status: { $ne: 'archived' } });
    let updated = 0;
    for (const c of creds) {
      const newStatus = Credential.computeExpiryStatus(c);
      if (newStatus !== c.status) {
        c.status = newStatus;
        await c.save();
        updated++;
      }
    }
    res.json({ message: 'Recompute complete.', scanned: creds.length, updated });
  } catch (error) {
    console.error('Error recomputing statuses:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
