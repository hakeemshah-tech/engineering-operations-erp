const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Company = require('../models/Company');
const { invalidateCompanyCache } = require('../utils/accounts/companyContext');
const router = express.Router();

const uploadsDir = path.join(__dirname, '..', 'uploads', 'company');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const allowedMimes = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

const fileFilter = (req, file, cb) => {
  if (allowedMimes.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Invalid file type. Images, PDFs and Office docs are allowed.'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

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
const isAdmin = (roles) => roles.includes('admin');

const BANKING_FIELDS = ['bankName', 'accountName', 'accountNumber', 'iban', 'swiftCode'];

function attachLogoUrl(company) {
  if (!company) return company;
  const obj = typeof company.toObject === 'function' ? company.toObject({ virtuals: true }) : { ...company };
  if (obj.logo && obj.logo.filename) {
    obj.logo.fileUrl = `/uploads/company/${obj.logo.filename}`;
  }
  return obj;
}

function stripBankingIfNeeded(obj, roles) {
  if (isAdmin(roles)) return obj;
  if (!obj) return obj;
  const out = { ...obj };
  BANKING_FIELDS.forEach(f => { delete out[f]; });
  return out;
}

function unlinkSilent(filePath) {
  try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath); }
  catch (e) { /* ignore */ }
}

// GET singleton company profile
router.get('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });

    const company = await Company.findOne()
      .populate('createdBy', 'name email')
      .populate('edits.editedBy', 'name email');

    if (!company) return res.json(null);

    const payload = stripBankingIfNeeded(attachLogoUrl(company), roles);
    res.json(payload);
  } catch (error) {
    console.error('Error fetching company:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create singleton company profile
router.post('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });

    const existing = await Company.countDocuments();
    if (existing >= 1) {
      return res.status(400).json({ message: 'A company profile already exists.' });
    }

    const body = { ...req.body };
    if (!body.legalName || !body.legalName.trim()) {
      return res.status(400).json({ message: 'Legal name is required.' });
    }

    if (!isAdmin(roles)) {
      BANKING_FIELDS.forEach(f => { delete body[f]; });
    }

    const company = await Company.create({
      ...body,
      legalName: body.legalName.trim(),
      createdBy: req.user.userId
    });

    await company.populate('createdBy', 'name email');
    res.status(201).json(stripBankingIfNeeded(attachLogoUrl(company), roles));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Duplicate value. Registration number or TRN already exists.' });
    }
    console.error('Error creating company:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// PUT update company
router.put('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });

    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ message: 'Company profile not found.' });

    const body = { ...req.body };
    if (!isAdmin(roles)) {
      BANKING_FIELDS.forEach(f => { delete body[f]; });
    }

    // Track changes for simple top-level fields
    const trackFields = [
      'legalName', 'tradingName', 'companyType', 'industry', 'establishmentDate', 'companySize',
      'registrationNumber', 'licenseExpiryDate', 'licenseIssuingAuthority', 'countryOfIncorporation',
      'trn', 'taxRegistrationDate',
      'primaryEmail', 'phone', 'alternatePhone', 'website', 'fax',
      'workingHours', 'businessDescription', 'numberOfEmployees', 'annualRevenueRange',
      'status', 'mailingSameAsAddress',
      ...(isAdmin(roles) ? BANKING_FIELDS : [])
    ];
    const changes = [];
    for (const field of trackFields) {
      if (body[field] !== undefined) {
        const nextVal = typeof body[field] === 'string' ? body[field].trim() : body[field];
        const prevVal = company[field];
        if (String(nextVal ?? '') !== String(prevVal ?? '')) {
          changes.push({ field, from: prevVal, to: nextVal });
        }
      }
    }
    // Nested object changes (address/mailingAddress/socialLinks/keyServices) tracked as JSON
    ['address', 'mailingAddress', 'socialLinks', 'keyServices'].forEach(field => {
      if (body[field] !== undefined) {
        const prevJson = JSON.stringify(company[field] ?? null);
        const nextJson = JSON.stringify(body[field] ?? null);
        if (prevJson !== nextJson) changes.push({ field, from: company[field], to: body[field] });
      }
    });

    if (changes.length > 0) {
      company.edits.push({ editedBy: req.user.userId, editedAt: new Date(), changes });
    }

    // Apply updates
    trackFields.forEach(f => {
      if (body[f] !== undefined) {
        company[f] = typeof body[f] === 'string' ? body[f].trim() : body[f];
      }
    });
    if (body.address !== undefined) company.address = body.address;
    if (body.mailingAddress !== undefined) company.mailingAddress = body.mailingAddress;
    if (body.socialLinks !== undefined) company.socialLinks = body.socialLinks;
    if (Array.isArray(body.keyServices)) company.keyServices = body.keyServices;

    await company.save();
    invalidateCompanyCache();
    await company.populate('createdBy', 'name email');
    await company.populate('edits.editedBy', 'name email');

    res.json(stripBankingIfNeeded(attachLogoUrl(company), roles));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Duplicate value. Registration number or TRN already exists.' });
    }
    console.error('Error updating company:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST upload/replace logo
router.post('/:id/logo', auth, upload.single('logo'), async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const company = await Company.findById(req.params.id);
    if (!company) {
      if (req.file) unlinkSilent(req.file.path);
      return res.status(404).json({ message: 'Company profile not found.' });
    }
    if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });

    const oldFilename = company.logo && company.logo.filename;
    if (oldFilename) {
      unlinkSilent(path.join(uploadsDir, oldFilename));
    }

    company.logo = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      mimetype: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date(),
      uploadedBy: req.user.userId
    };

    company.edits.push({
      editedBy: req.user.userId,
      editedAt: new Date(),
      changes: [{ field: 'logo', from: oldFilename || null, to: req.file.filename }]
    });

    await company.save();
    invalidateCompanyCache();
    res.json(stripBankingIfNeeded(attachLogoUrl(company), roles));
  } catch (error) {
    if (req.file) unlinkSilent(req.file.path);
    console.error('Error uploading logo:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE logo
router.delete('/:id/logo', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ message: 'Company profile not found.' });

    const oldFilename = company.logo && company.logo.filename;
    if (oldFilename) unlinkSilent(path.join(uploadsDir, oldFilename));

    company.logo = null;
    company.edits.push({
      editedBy: req.user.userId,
      editedAt: new Date(),
      changes: [{ field: 'logo', from: oldFilename || null, to: null }]
    });

    await company.save();
    invalidateCompanyCache();
    res.json(stripBankingIfNeeded(attachLogoUrl(company), roles));
  } catch (error) {
    console.error('Error removing logo:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
