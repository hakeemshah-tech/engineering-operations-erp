const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Vehicle = require('../models/Vehicle');
const router = express.Router();

const uploadsDir = path.join(__dirname, '..', 'uploads', 'vehicles');
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
  if (Array.isArray(obj.vehicleDocuments)) {
    obj.vehicleDocuments = obj.vehicleDocuments.map(vd => ({
      ...vd,
      attachments: (vd.attachments || []).map(a => ({
        ...a,
        fileUrl: a.filename ? `/uploads/vehicles/${a.filename}` : null
      }))
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
      status, vehicleType, category, assignedDriver, search,
      documentsExpiringWithin, page = 1, limit = 50
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (vehicleType) filter.vehicleType = vehicleType;
    if (category) filter.category = category;
    if (assignedDriver) filter['assignedDriver.userId'] = assignedDriver;

    if (search) {
      filter.$or = [
        { plateNumber: { $regex: search, $options: 'i' } },
        { vehicleId: { $regex: search, $options: 'i' } },
        { make: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } },
        { vin: { $regex: search, $options: 'i' } }
      ];
    }

    if (documentsExpiringWithin) {
      const days = parseInt(documentsExpiringWithin, 10);
      if (!isNaN(days)) {
        const now = new Date();
        const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        filter['vehicleDocuments.expiryDate'] = { $gte: now, $lte: until };
      }
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Vehicle.find(filter)
        .populate('createdBy', 'name email')
        .populate('assignedDriver.userId', 'name email')
        .populate('currentProject', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Vehicle.countDocuments(filter)
    ]);

    res.json({
      items: items.map(attachFileUrls),
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum) || 1,
      limit: limitNum
    });
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET single
router.get('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const vehicle = await Vehicle.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('assignedDriver.userId', 'name email')
      .populate('currentProject', 'name')
      .populate('edits.editedBy', 'name email');

    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found.' });
    res.json(attachFileUrls(vehicle));
  } catch (error) {
    console.error('Error fetching vehicle:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create
router.post('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const body = req.body || {};
    if (!body.plateNumber || !String(body.plateNumber).trim()) {
      return res.status(400).json({ message: 'Vehicle plate number is required.' });
    }

    const existingPlate = await Vehicle.findOne({ plateNumber: String(body.plateNumber).trim().toUpperCase() });
    if (existingPlate) {
      return res.status(400).json({ message: `A vehicle with plate "${body.plateNumber.toUpperCase()}" already exists.` });
    }

    const vehicle = await Vehicle.create({
      ...body,
      plateNumber: String(body.plateNumber).trim().toUpperCase(),
      createdBy: req.user.userId
    });

    await vehicle.populate('createdBy', 'name email');
    res.status(201).json(attachFileUrls(vehicle));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Duplicate vehicle plate number, VIN, or vehicle ID.' });
    }
    console.error('Error creating vehicle:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update with edit tracking
router.put('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found.' });

    const body = req.body || {};
    const trackFields = [
      'plateNumber', 'make', 'model', 'year', 'color', 'vin', 'engineNumber',
      'vehicleType', 'category', 'fuelType', 'transmission',
      'seatingCapacity', 'loadCapacity', 'weight',
      'purchaseDate', 'purchasePrice', 'currentValue', 'ownershipStatus', 'leasingCompany',
      'assignedDepartment', 'currentProject', 'status', 'priority', 'currentLocation',
      'odometerReading', 'lastServiceDate', 'nextServiceDate', 'notes'
    ];

    const changes = [];
    for (const field of trackFields) {
      if (body[field] !== undefined) {
        const nextVal = typeof body[field] === 'string' ? body[field].trim() : body[field];
        const prevVal = vehicle[field];
        if (String(nextVal ?? '') !== String(prevVal ?? '')) {
          changes.push({ field, from: prevVal, to: nextVal });
        }
      }
    }

    if (body.assignedDriver !== undefined) {
      const prevJson = JSON.stringify(vehicle.assignedDriver || {});
      const nextJson = JSON.stringify(body.assignedDriver || {});
      if (prevJson !== nextJson) changes.push({ field: 'assignedDriver', from: vehicle.assignedDriver, to: body.assignedDriver });
    }

    if (body.insurance !== undefined) {
      const prevJson = JSON.stringify(vehicle.insurance || {});
      const nextJson = JSON.stringify(body.insurance || {});
      if (prevJson !== nextJson) changes.push({ field: 'insurance', from: vehicle.insurance, to: body.insurance });
    }

    if (changes.length > 0) {
      vehicle.edits.push({ editedBy: req.user.userId, editedAt: new Date(), changes });
    }

    trackFields.forEach(f => {
      if (body[f] !== undefined) {
        vehicle[f] = typeof body[f] === 'string' ? body[f].trim() : body[f];
      }
    });
    if (body.assignedDriver !== undefined) vehicle.assignedDriver = body.assignedDriver;
    if (body.insurance !== undefined) vehicle.insurance = body.insurance;

    await vehicle.save();
    await vehicle.populate('createdBy', 'name email');
    await vehicle.populate('assignedDriver.userId', 'name email');
    await vehicle.populate('currentProject', 'name');
    await vehicle.populate('edits.editedBy', 'name email');

    res.json(attachFileUrls(vehicle));
  } catch (error) {
    console.error('Error updating vehicle:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE
router.delete('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found.' });

    (vehicle.vehicleDocuments || []).forEach(vd => {
      (vd.attachments || []).forEach(a => unlinkSilent(a.path));
    });

    await vehicle.deleteOne();
    res.json({ message: 'Vehicle deleted successfully.' });
  } catch (error) {
    console.error('Error deleting vehicle:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== VEHICLE DOCUMENTS (embedded) =====

// POST add vehicleDocument
router.post('/:id/documents', auth, upload.array('files', 10), async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) {
      (req.files || []).forEach(f => unlinkSilent(f.path));
      return res.status(403).json({ message: 'Access denied.' });
    }

    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) {
      (req.files || []).forEach(f => unlinkSilent(f.path));
      return res.status(404).json({ message: 'Vehicle not found.' });
    }

    const body = req.body || {};
    if (!body.documentType) {
      (req.files || []).forEach(f => unlinkSilent(f.path));
      return res.status(400).json({ message: 'Document type is required.' });
    }

    const newDoc = {
      documentType: body.documentType,
      documentNumber: body.documentNumber || '',
      issueDate: body.issueDate || null,
      expiryDate: body.expiryDate || null,
      issuingAuthority: body.issuingAuthority || '',
      notes: body.notes || '',
      reminderDaysBefore: body.reminderDaysBefore ? parseInt(body.reminderDaysBefore, 10) : 30,
      attachments: []
    };

    (req.files || []).forEach(f => {
      newDoc.attachments.push({
        filename: f.filename,
        originalName: f.originalname,
        path: f.path,
        mimetype: f.mimetype,
        size: f.size,
        uploadedAt: new Date(),
        uploadedBy: req.user.userId
      });
    });

    vehicle.vehicleDocuments.push(newDoc);

    vehicle.edits.push({
      editedBy: req.user.userId,
      editedAt: new Date(),
      changes: [{ field: 'vehicleDocuments', from: vehicle.vehicleDocuments.length - 1, to: vehicle.vehicleDocuments.length }]
    });

    await vehicle.save();
    res.json(attachFileUrls(vehicle));
  } catch (error) {
    (req.files || []).forEach(f => unlinkSilent(f.path));
    console.error('Error adding vehicle document:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update vehicleDocument metadata
router.put('/:id/documents/:docId', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found.' });

    const vdoc = vehicle.vehicleDocuments.id(req.params.docId);
    if (!vdoc) return res.status(404).json({ message: 'Vehicle document not found.' });

    const body = req.body || {};
    const trackFields = ['documentType', 'documentNumber', 'issueDate', 'expiryDate', 'issuingAuthority', 'notes', 'reminderDaysBefore'];

    const changes = [];
    trackFields.forEach(f => {
      if (body[f] !== undefined) {
        const nextVal = typeof body[f] === 'string' ? body[f].trim() : body[f];
        const prevVal = vdoc[f];
        if (String(nextVal ?? '') !== String(prevVal ?? '')) {
          changes.push({ field: f, from: prevVal, to: nextVal });
        }
      }
    });

    if (changes.length > 0) {
      vehicle.edits.push({ editedBy: req.user.userId, editedAt: new Date(), changes });
    }

    trackFields.forEach(f => {
      if (body[f] !== undefined) {
        vdoc[f] = typeof body[f] === 'string' ? body[f].trim() : body[f];
      }
    });

    await vehicle.save();
    res.json(attachFileUrls(vehicle));
  } catch (error) {
    console.error('Error updating vehicle document:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE vehicleDocument
router.delete('/:id/documents/:docId', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found.' });

    const vdoc = vehicle.vehicleDocuments.id(req.params.docId);
    if (!vdoc) return res.status(404).json({ message: 'Vehicle document not found.' });

    (vdoc.attachments || []).forEach(a => unlinkSilent(a.path));
    vdoc.deleteOne();

    vehicle.edits.push({
      editedBy: req.user.userId,
      editedAt: new Date(),
      changes: [{ field: 'vehicleDocuments', from: vehicle.vehicleDocuments.length + 1, to: vehicle.vehicleDocuments.length }]
    });

    await vehicle.save();
    res.json(attachFileUrls(vehicle));
  } catch (error) {
    console.error('Error deleting vehicle document:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST add attachments to vehicleDocument
router.post('/:id/documents/:docId/attachments', auth, upload.array('files', 10), async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) {
      (req.files || []).forEach(f => unlinkSilent(f.path));
      return res.status(403).json({ message: 'Access denied.' });
    }

    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) {
      (req.files || []).forEach(f => unlinkSilent(f.path));
      return res.status(404).json({ message: 'Vehicle not found.' });
    }

    const vdoc = vehicle.vehicleDocuments.id(req.params.docId);
    if (!vdoc) {
      (req.files || []).forEach(f => unlinkSilent(f.path));
      return res.status(404).json({ message: 'Vehicle document not found.' });
    }

    const files = req.files || [];
    if (files.length === 0) return res.status(400).json({ message: 'No files uploaded.' });

    const prevCount = vdoc.attachments.length;
    files.forEach(f => {
      vdoc.attachments.push({
        filename: f.filename,
        originalName: f.originalname,
        path: f.path,
        mimetype: f.mimetype,
        size: f.size,
        uploadedAt: new Date(),
        uploadedBy: req.user.userId
      });
    });

    vehicle.edits.push({
      editedBy: req.user.userId,
      editedAt: new Date(),
      changes: [{ field: `vehicleDocuments.${req.params.docId}.attachments`, from: prevCount, to: vdoc.attachments.length }]
    });

    await vehicle.save();
    res.json(attachFileUrls(vehicle));
  } catch (error) {
    (req.files || []).forEach(f => unlinkSilent(f.path));
    console.error('Error adding attachments:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE one attachment from vehicleDocument
router.delete('/:id/documents/:docId/attachments/:attachmentId', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found.' });

    const vdoc = vehicle.vehicleDocuments.id(req.params.docId);
    if (!vdoc) return res.status(404).json({ message: 'Vehicle document not found.' });

    const attachment = vdoc.attachments.id(req.params.attachmentId);
    if (!attachment) return res.status(404).json({ message: 'Attachment not found.' });

    unlinkSilent(attachment.path);
    const prevCount = vdoc.attachments.length;
    attachment.deleteOne();

    vehicle.edits.push({
      editedBy: req.user.userId,
      editedAt: new Date(),
      changes: [{ field: `vehicleDocuments.${req.params.docId}.attachments`, from: prevCount, to: vdoc.attachments.length }]
    });

    await vehicle.save();
    res.json(attachFileUrls(vehicle));
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
