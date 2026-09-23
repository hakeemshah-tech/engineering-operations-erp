const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const SiteVisit = require('../models/SiteVisit');
const Project = require('../models/Project');
const AuditLog = require('../models/AuditLog');
const router = express.Router();

// Configure multer for file uploads
const uploadsDir = path.join(__dirname, '..', 'uploads', 'site-visits');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Allow images, documents, and videos
  const allowedMimes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv',
    'video/webm', 'video/ogg', 'video/3gpp', 'video/x-matroska'
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, documents, and videos are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Access denied' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Create a site visit (project engineers only)
router.post('/', auth, (req, res, next) => {
  upload.array('attachments', 10)(req, res, (err) => {
    if (err) {
      // Handle multer errors
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File size exceeds 10MB limit' });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ message: 'Too many files. Maximum 10 files allowed' });
      }
      if (err.message && err.message.includes('Invalid file type')) {
        return res.status(400).json({ message: err.message });
      }
      return res.status(400).json({ message: err.message || 'File upload error' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.user.roles.includes('project_engineer')) {
      return res.status(403).json({ message: 'Only project engineers can create site visits' });
    }

    const { projectId, visitAt, siteLocation, engineerName, workProgressSummary, safetyObservations, qualityMaterialCheck, issuesFound, actionItems, weatherConditions, description } = req.body;

    if (!projectId || !visitAt || !siteLocation || !engineerName || !workProgressSummary || !description) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    // Process uploaded files
    const attachments = [];
    console.log('Site visit creation (project) - Files received:', req.files ? req.files.length : 0);
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        console.log('Processing file:', file.originalname, 'Size:', file.size, 'Type:', file.mimetype);
        attachments.push({
          filename: file.filename,
          originalName: file.originalname,
          path: `/uploads/site-visits/${file.filename}`,
          mimetype: file.mimetype,
          size: file.size
        });
      });
    } else {
      console.log('No files received in req.files');
    }

    const siteVisit = await SiteVisit.create({
      project: projectId,
      visitAt,
      siteLocation,
      engineerName,
      workProgressSummary,
      safetyObservations,
      qualityMaterialCheck,
      issuesFound,
      actionItems,
      weatherConditions,
      description,
      attachments,
      createdBy: req.user.userId
    });

    // Create audit log for site visit creation
    try {
      await AuditLog.create({
        action: 'site_visit_created',
        entityType: 'site_visit',
        entityId: siteVisit._id,
        entityData: {
          visitAt: siteVisit.visitAt || null,
          engineerName: siteVisit.engineerName || null,
          siteLocation: siteVisit.siteLocation || null,
          projectTitle: project.name || null,
          createdBy: siteVisit.createdBy || null,
          createdAt: siteVisit.createdAt || null
        },
        performedBy: req.user.userId,
        performedAt: new Date(),
        ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
        userAgent: req.get('user-agent') || 'unknown'
      });
    } catch (auditError) {
      console.error('Error creating audit log for site visit creation:', auditError);
    }

    res.status(201).json(siteVisit);
  } catch (error) {
    // Clean up uploaded files if there's an error
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        const filePath = path.join(uploadsDir, file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    }
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// List visits for a project (auth required)
router.get('/project/:projectId', auth, async (req, res) => {
  try {
    const visits = await SiteVisit.find({ project: req.params.projectId }).sort({ visitAt: -1 });
    res.json(visits);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

