const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Project = require('../models/Project');
const User = require('../models/User');
const Role = require('../models/Role');
const Employee = require('../models/Employee');
const jwt = require('jsonwebtoken');
const Revision = require('../models/Revision');
const Lead = require('../models/Lead');
const Quotation = require('../models/Quotation');
const AuditLog = require('../models/AuditLog');
const router = express.Router();

// Configure multer for file uploads (projects)
const uploadsDir = path.join(__dirname, '..', 'uploads', 'projects');
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

// Get all projects (optionally scoped to the caller with ?mine=true)
router.get('/', auth, async (req, res) => {
  try {
    const filter = {};
    if (String(req.query.mine || '').toLowerCase() === 'true') {
      const uid = req.user.userId;
      filter.$or = [
        { assignedProjectEngineer: uid },
        { assignedSiteEngineer: uid },
        { supervisors: uid },
        { workers: uid },
        { createdBy: uid }
      ];
    }
    // Site location filter - matches projects whose siteLocationId equals
    // the requested location. Future enhancement could include indirect
    // matches (e.g. project doesn't have siteLocationId but employees on
    // it have a base matching) - out of scope for now.
    if (req.query.siteLocation && req.query.siteLocation !== 'all') {
      filter.siteLocationId = req.query.siteLocation;
    }
    if (req.query.status && req.query.status !== 'all') {
      filter.status = req.query.status;
    }
    const projects = await Project.find(filter)
      .populate('assignedSiteEngineer', 'name email')
      .populate('assignedProjectEngineer', 'name email')
      .populate('createdBy', 'name email')
      .populate('siteLocationId', 'name type address geofenceRadiusMeters noGeofence status')
      .populate('sourceRevision')
      .populate('sourceQuotation')
      .populate('leadId')
      .populate('revisions.createdBy', 'name')
      .populate('revisions.approvedBy', 'name')
      .sort({ createdAt: -1 });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// (moved below fixed routes to avoid shadowing)

// Update project with edit tracking (manager/admin/estimation_engineer)
router.put('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!(roles.includes('manager') || roles.includes('admin') || roles.includes('estimation_engineer'))) {
      return res.status(403).json({ message: 'Not authorized to update projects' });
    }

    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const updatable = ['name','locationDetails','workingHours','manpowerCount','status','assignedProjectEngineer','siteLocationId'];
    const changes = [];
    for (const field of updatable) {
      if (typeof req.body[field] === 'undefined') continue;
      const from = project[field];
      let to = req.body[field];
      
      // Normalize assignedProjectEngineer to array format
      if (field === 'assignedProjectEngineer') {
        if (to) {
          to = Array.isArray(to) ? to.filter(id => id) : [to].filter(id => id);
        } else {
          to = [];
        }
        // Normalize 'from' for comparison
        const fromArray = Array.isArray(from) ? from : (from ? [from] : []);
        if (JSON.stringify(fromArray.sort()) === JSON.stringify(to.sort())) {
          continue; // No change
        }
      } else {
        if (JSON.stringify(from) !== JSON.stringify(to)) {
          changes.push({ field, from, to });
          project[field] = to;
          continue;
        }
      }
      
      // Handle assignedProjectEngineer change
      if (field === 'assignedProjectEngineer') {
        const fromArray = Array.isArray(from) ? from : (from ? [from] : []);
        changes.push({ field, from: fromArray, to });
        project[field] = to;
      }
    }
    if (changes.length > 0) {
      project.edits = Array.isArray(project.edits) ? project.edits : [];
      project.edits.push({ editedBy: req.user.userId, changes });
    }
    await project.save();
    await project.populate('assignedSiteEngineer', 'name email');
    await project.populate('assignedProjectEngineer', 'name email');
    await project.populate('createdBy', 'name email');
    await project.populate('siteLocationId', 'name type address geofenceRadiusMeters noGeofence status');
    res.json(project);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a project with file attachment support (PATCH)
router.patch('/:id', auth, (req, res, next) => {
  upload.array('attachments', 10)(req, res, (err) => {
    if (err) {
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
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const editable = ['name', 'locationDetails', 'workingHours', 'manpowerCount', 'status', 'assignedProjectEngineer', 'siteLocationId'];
    const changes = [];
    
    // Helper function to normalize values for comparison
    const normalizeValue = (value, field) => {
      if (value === null || value === undefined || value === '') {
        return null;
      }
      // For manpowerCount, ensure it's a number
      if (field === 'manpowerCount') {
        const num = Number(value);
        return isNaN(num) ? null : num;
      }
      return value;
    };
    
    for (const field of editable) {
      if (!(field in req.body)) continue;
      const from = project[field];
      let to = req.body[field];
      
      // Handle assignedProjectEngineer as array
      if (field === 'assignedProjectEngineer') {
        if (!Array.isArray(to)) {
          // Handle empty array indicator from FormData (empty string means clear all)
          if (to === '' || to === '[]') {
            to = [];
          } else {
            to = to ? [to] : [];
          }
        } else {
          // If it's already an array, filter out empty markers
          // This handles the case where FormData sends [''] or ['[]'] as an array
          to = to.filter(item => item !== '' && item !== '[]');
          // If after filtering we have an empty array, that's valid (means clear all)
        }
        const fromArray = Array.isArray(from) ? from : (from ? [from] : []);
        if (JSON.stringify(fromArray.sort()) !== JSON.stringify(to.sort())) {
          changes.push({ field, from: fromArray, to });
          project[field] = to;
        }
      } else {
        // Normalize values for comparison
        const normalizedFrom = normalizeValue(from, field);
        const normalizedTo = normalizeValue(to, field);
        
        // Only track change if values are actually different
        if (JSON.stringify(normalizedFrom) !== JSON.stringify(normalizedTo)) {
          changes.push({ field, from: normalizedFrom, to: normalizedTo });
          project[field] = normalizedTo;
        }
      }
    }

    // Track attachment changes for edit history
    const attachmentChanges = [];
    const originalAttachmentCount = project.attachments ? project.attachments.length : 0;
    const originalAttachmentNames = project.attachments ? project.attachments.map(a => a.originalName || a.filename).sort() : [];

    // Handle file attachments
    if (req.files && req.files.length > 0) {
      if (!project.attachments) project.attachments = [];
      req.files.forEach(file => {
        project.attachments.push({
          filename: file.filename,
          originalName: file.originalname,
          path: `/uploads/projects/${file.filename}`,
          mimetype: file.mimetype,
          size: file.size,
          uploadedAt: new Date()
        });
        attachmentChanges.push({ action: 'added', filename: file.originalname });
      });
    }

    // Handle attachment removals
    if (req.body.removeAttachments) {
      const indicesToRemove = Array.isArray(req.body.removeAttachments) 
        ? req.body.removeAttachments 
        : [req.body.removeAttachments];
      
      // Delete files from filesystem and track removals
      for (const index of indicesToRemove) {
        const idx = parseInt(index);
        if (idx >= 0 && idx < project.attachments.length) {
          const attachment = project.attachments[idx];
          attachmentChanges.push({ action: 'removed', filename: attachment.originalName || attachment.filename });
          try {
            const filePath = path.join(__dirname, '..', 'uploads', 'projects', attachment.filename);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              console.log(`Removed attachment: ${attachment.filename}`);
            }
          } catch (fileError) {
            console.error(`Error removing file ${attachment.filename}:`, fileError);
          }
        }
      }
      
      // Remove from database
      project.attachments = project.attachments.filter((_, idx) => 
        !indicesToRemove.includes(idx.toString())
      );
    }

    // Add attachment changes to edit history if any attachments were added or removed
    if (attachmentChanges.length > 0) {
      const newAttachmentNames = project.attachments ? project.attachments.map(a => a.originalName || a.filename).sort() : [];
      changes.push({ 
        field: 'attachments', 
        from: originalAttachmentNames.length > 0 ? `${originalAttachmentCount} file(s): ${originalAttachmentNames.join(', ')}` : '(none)',
        to: newAttachmentNames.length > 0 ? `${newAttachmentNames.length} file(s): ${newAttachmentNames.join(', ')}` : '(none)'
      });
    }

    // Save edit history
    if (changes.length > 0) {
      project.edits = Array.isArray(project.edits) ? project.edits : [];
      project.edits.push({ editedBy: req.user.userId, changes });
    }

    await project.save();
    await project.populate('assignedSiteEngineer', 'name email');
    await project.populate('assignedProjectEngineer', 'name email');
    await project.populate('createdBy', 'name email');
    await project.populate('siteLocationId', 'name type address geofenceRadiusMeters noGeofence status');
    
    res.json(project);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// Create a project from an approved Revision
router.post('/from-revision/:revisionId', auth, (req, res, next) => {
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
    const { revisionId } = req.params;
    const revision = await Revision.findById(revisionId)
      .populate('lead');
    if (!revision) return res.status(404).json({ message: 'Revision not found' });

    if (revision?.managementApproval?.status !== 'approved') {
      return res.status(400).json({ message: 'Only approved revisions can be converted to a project' });
    }

    const existingProject = await Project.findOne({ sourceRevision: revision._id });
    if (existingProject) {
      return res.status(400).json({ message: 'A project already exists for this revision' });
    }

    // Enforce: Only allow creation from the last approved child revision in the chain
    // 1) Block if this revision has any child
    const hasChild = await Revision.countDocuments({ parentRevision: revision._id });
    if (hasChild > 0) {
      return res.status(400).json({ message: 'Project can only be created from the last approved child revision.' });
    }
    // 2) If there exists a later approved revision in the same quotation chain, block
    const latestApproved = await Revision.findOne({ parentQuotation: revision.parentQuotation, 'managementApproval.status': 'approved' })
      .sort({ revisionNumber: -1 })
      .select('_id revisionNumber');
    if (latestApproved && String(latestApproved._id) !== String(revision._id)) {
      return res.status(400).json({ message: `Only the latest approved revision (#${latestApproved.revisionNumber}) can be used to create a project.` });
    }

    const leadId = revision.lead ? (revision.lead._id || revision.lead) : null;
    const lead = leadId ? await Lead.findById(leadId) : null;

    const { name, locationDetails, workingHours, manpowerCount, siteLocationId } = req.body || {};
    // Handle assignedProjectEngineerIds - FormData may send as array or repeated keys
    let engineerIds = [];
    if (req.body.assignedProjectEngineerIds) {
      // FormData with repeated keys creates an array, or it might be a single value
      const ids = Array.isArray(req.body.assignedProjectEngineerIds) 
        ? req.body.assignedProjectEngineerIds 
        : [req.body.assignedProjectEngineerIds];
      engineerIds = ids.filter(id => id && id !== '');
    }
    
    // Process uploaded files
    const attachments = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        attachments.push({
          filename: file.filename,
          originalName: file.originalname,
          path: `/uploads/projects/${file.filename}`,
          mimetype: file.mimetype,
          size: file.size
        });
      });
    }
    
    // Parse manpowerCount from FormData (which sends strings)
    let parsedManpowerCount = lead?.manpowerCount; // Default to lead's value
    if (manpowerCount !== undefined && manpowerCount !== null && manpowerCount !== '') {
      const num = Number(manpowerCount);
      if (!isNaN(num)) {
        parsedManpowerCount = num;
      }
    }
    
    const project = new Project({
      name: name || revision.projectTitle || lead?.projectTitle || 'Project',
      budget: lead?.budget,
      locationDetails: (locationDetails ?? lead?.locationDetails ?? ''),
      siteLocationId: siteLocationId || undefined,
      workingHours: (workingHours ?? lead?.workingHours ?? ''),
      manpowerCount: parsedManpowerCount,
      leadId: leadId,
      createdBy: req.user.userId,
      assignedProjectEngineer: engineerIds.length > 0 ? engineerIds : undefined,
      sourceRevision: revision._id,
      sourceQuotation: revision.parentQuotation,
      attachments: attachments.length > 0 ? attachments : undefined
    });

    await project.save();

    const populated = await Project.findById(project._id)
      .populate('assignedSiteEngineer', 'name email')
      .populate('assignedProjectEngineer', 'name email')
      .populate('createdBy', 'name email')
      .populate('siteLocationId', 'name type address geofenceRadiusMeters noGeofence status')
      .populate('sourceRevision')
      .populate('sourceQuotation')
      .populate('leadId')
      .populate('revisions.createdBy', 'name')
      .populate('revisions.approvedBy', 'name');

    return res.status(201).json(populated);
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// Check if a project exists for a given revision
router.get('/by-revision/:revisionId', auth, async (req, res) => {
  try {
    const project = await Project.findOne({ sourceRevision: req.params.revisionId }).select('_id name createdAt');
    if (!project) return res.status(404).json({ message: 'Not found' });
    return res.json(project);
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// Create a project directly from an approved Quotation (without revision)
router.post('/from-quotation/:quotationId', auth, (req, res, next) => {
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
    const { quotationId } = req.params;
    const quotation = await Quotation.findById(quotationId)
      .populate('lead');
    if (!quotation) return res.status(404).json({ message: 'Quotation not found' });

    if (quotation?.managementApproval?.status !== 'approved') {
      return res.status(400).json({ message: 'Only approved quotations can be converted to a project' });
    }

    // Check if a project already exists for this quotation (without revision)
    const existingProject = await Project.findOne({ 
      sourceQuotation: quotation._id,
      sourceRevision: null
    });
    if (existingProject) {
      return res.status(400).json({ message: 'A project already exists for this quotation' });
    }

    // Check if any revision exists for this quotation (if so, project should be created from revision instead)
    const hasRevision = await Revision.countDocuments({ parentQuotation: quotation._id });
    if (hasRevision > 0) {
      return res.status(400).json({ message: 'Cannot create project directly from quotation. Revisions exist for this quotation. Please create project from the latest approved revision instead.' });
    }

    const leadId = quotation.lead ? (quotation.lead._id || quotation.lead) : null;
    const lead = leadId ? await Lead.findById(leadId) : null;

    const { name, locationDetails, workingHours, manpowerCount, siteLocationId } = req.body || {};
    // Handle assignedProjectEngineerIds - FormData may send as array or repeated keys
    let engineerIds = [];
    if (req.body.assignedProjectEngineerIds) {
      // FormData with repeated keys creates an array, or it might be a single value
      const ids = Array.isArray(req.body.assignedProjectEngineerIds) 
        ? req.body.assignedProjectEngineerIds 
        : [req.body.assignedProjectEngineerIds];
      engineerIds = ids.filter(id => id && id !== '');
    }
    
    // Process uploaded files
    const attachments = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        attachments.push({
          filename: file.filename,
          originalName: file.originalname,
          path: `/uploads/projects/${file.filename}`,
          mimetype: file.mimetype,
          size: file.size
        });
      });
    }
    
    // Parse manpowerCount from FormData (which sends strings)
    let parsedManpowerCount = lead?.manpowerCount; // Default to lead's value
    if (manpowerCount !== undefined && manpowerCount !== null && manpowerCount !== '') {
      const num = Number(manpowerCount);
      if (!isNaN(num)) {
        parsedManpowerCount = num;
      }
    }
    
    const project = new Project({
      name: name || quotation.projectTitle || lead?.projectTitle || 'Project',
      budget: lead?.budget,
      locationDetails: (locationDetails ?? lead?.locationDetails ?? ''),
      siteLocationId: siteLocationId || undefined,
      workingHours: (workingHours ?? lead?.workingHours ?? ''),
      manpowerCount: parsedManpowerCount,
      leadId: leadId,
      createdBy: req.user.userId,
      assignedProjectEngineer: engineerIds.length > 0 ? engineerIds : undefined,
      sourceRevision: null, // No revision - created directly from quotation
      sourceQuotation: quotation._id,
      attachments: attachments.length > 0 ? attachments : undefined
    });

    await project.save();

    const populated = await Project.findById(project._id)
      .populate('assignedSiteEngineer', 'name email')
      .populate('assignedProjectEngineer', 'name email')
      .populate('createdBy', 'name email')
      .populate('siteLocationId', 'name type address geofenceRadiusMeters noGeofence status')
      .populate('sourceRevision')
      .populate('sourceQuotation')
      .populate('leadId')
      .populate('revisions.createdBy', 'name')
      .populate('revisions.approvedBy', 'name');

    return res.status(201).json(populated);
  } catch (error) {
    console.error('Error creating project from quotation:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Check if a project exists for a given quotation (without revision)
router.get('/by-quotation/:quotationId', auth, async (req, res) => {
  try {
    const project = await Project.findOne({ 
      sourceQuotation: req.params.quotationId,
      sourceRevision: null
    }).select('_id name createdAt');
    if (!project) return res.status(404).json({ message: 'Not found' });
    return res.json(project);
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// List Project Engineers (accessible to managers and estimation engineers)
router.get('/project-engineers', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!(roles.includes('admin') || roles.includes('manager') || roles.includes('estimation_engineer'))) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    const Role = require('../models/Role');
    const roleDoc = await Role.findOne({ key: 'project_engineer' }).select('_id');
    if (!roleDoc) return res.json([]);
    const users = await User.find({ roles: roleDoc._id }).select('name email');
    return res.json(users);
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// Get single project by id (populated)
router.get('/:id', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('assignedSiteEngineer', 'name email')
      .populate('assignedProjectEngineer', 'name email')
      .populate('supervisors', 'name email')
      .populate('workers', 'name email')
      .populate('createdBy', 'name email')
      .populate('siteLocationId', 'name type address geofenceRadiusMeters noGeofence status')
      .populate('sourceRevision')
      .populate('sourceQuotation')
      .populate('leadId')
      .populate('revisions.createdBy', 'name')
      .populate('revisions.approvedBy', 'name')
      .populate('edits.editedBy', 'name email');
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a project (manager/admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!(roles.includes('manager') || roles.includes('admin'))) {
      return res.status(403).json({ message: 'Only managers can delete projects' });
    }
    const project = await Project.findById(req.params.id)
      .populate('leadId', 'customerName projectTitle')
      .populate('createdBy', 'name email');
    if (!project) return res.status(404).json({ message: 'Project not found' });
    
    // Create audit log before deletion
    const leadData = typeof project.leadId === 'object' ? project.leadId : null;
    let createdById = null;
    if (project.createdBy) {
      if (typeof project.createdBy === 'object' && project.createdBy._id) {
        createdById = project.createdBy._id;
      } else {
        createdById = project.createdBy;
      }
    }
    
    try {
      await AuditLog.create({
        action: 'project_deleted',
        entityType: 'project',
        entityId: project._id,
        entityData: {
          name: project.name || null,
          projectTitle: leadData?.projectTitle || null,
          customerName: leadData?.customerName || null,
          status: project.status || null,
          createdBy: createdById,
          createdAt: project.createdAt || null
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
    
    // Delete associated attachment files from filesystem
    if (project.attachments && Array.isArray(project.attachments) && project.attachments.length > 0) {
      for (const attachment of project.attachments) {
        try {
          const filePath = path.join(__dirname, '..', 'uploads', 'projects', attachment.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`Deleted file: ${attachment.filename}`);
          }
        } catch (fileError) {
          // Log error but don't fail the deletion
          console.error(`Error deleting file ${attachment.filename}:`, fileError);
        }
      }
    }
    
    await Project.findByIdAndDelete(req.params.id);

    return res.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Assign site engineer
router.patch('/:id/assign-engineer', auth, async (req, res) => {
  try {
    const { siteEngineerId } = req.body;
    const userRoles = req.user.roles;
    const canAssign = userRoles.includes('admin') || userRoles.includes('manager') || userRoles.includes('supervisor');
    if (!canAssign) {
      return res.status(403).json({ message: 'Not authorized to assign engineers' });
    }

    const engineer = await User.findById(siteEngineerId).populate('roles');
    const engineerRoleKeys = (engineer?.roles || []).map(r => (typeof r === 'string' ? r : r.key));
    if (!engineer || !engineerRoleKeys.includes('site_engineer')) {
      return res.status(400).json({ message: 'Invalid site engineer' });
    }

    const project = await Project.findById(req.params.id).populate('assignedSiteEngineer', 'name email');
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const prev = project.assignedSiteEngineer ? project.assignedSiteEngineer._id : null;
    project.assignedSiteEngineer = siteEngineerId;
    project.edits = Array.isArray(project.edits) ? project.edits : [];
    project.edits.push({ editedBy: req.user.userId, changes: [{ field: 'assignedSiteEngineer', from: prev, to: siteEngineerId }] });
    await project.save();

    await project.populate('assignedSiteEngineer', 'name email');

    res.json(project);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Allocate supervisors and workers to a project (full-replace semantics)
router.patch('/:id/allocate-team', auth, async (req, res) => {
  try {
    const { supervisorIds, workerIds } = req.body || {};
    const supervisorIdArr = Array.isArray(supervisorIds) ? supervisorIds.filter(Boolean).map(String) : [];
    const workerIdArr = Array.isArray(workerIds) ? workerIds.filter(Boolean).map(String) : [];

    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const userRoles = req.user.roles || [];
    const isAdminOrManager = userRoles.includes('admin') || userRoles.includes('manager');
    const assignedPEs = (project.assignedProjectEngineer || []).map(id => String(id));
    const assignedSupervisors = (project.supervisors || []).map(id => String(id));
    const isAssignedPE = userRoles.includes('project_engineer') && assignedPEs.includes(String(req.user.userId));
    const hasSupervisorRole = userRoles.includes('site_supervisor') || userRoles.includes('supervisor');
    const isAssignedSiteSupervisor = hasSupervisorRole && assignedSupervisors.includes(String(req.user.userId));
    if (!isAdminOrManager && !isAssignedPE && !isAssignedSiteSupervisor) {
      return res.status(403).json({ message: 'Not authorized to allocate team for this project' });
    }

    const prevSupervisors = assignedSupervisors;
    const prevWorkers = (project.workers || []).map(id => String(id));
    const nextSupervisors = Array.from(new Set(supervisorIdArr));
    const nextWorkers = Array.from(new Set(workerIdArr));

    // Site supervisors can only modify the workers list. Any change to supervisors[] is rejected.
    if (isAssignedSiteSupervisor && !isAdminOrManager && !isAssignedPE) {
      const supervisorsChanged =
        prevSupervisors.length !== nextSupervisors.length ||
        prevSupervisors.some(id => !nextSupervisors.includes(id)) ||
        nextSupervisors.some(id => !prevSupervisors.includes(id));
      if (supervisorsChanged) {
        return res.status(403).json({
          message: 'Site supervisors can only manage the workers list for this project.'
        });
      }
    }

    // Accept both canonical supervisor keys - `supervisor` and `site_supervisor`
    // are treated as the same role everywhere in the system.
    const supervisorRoles = await Role.find({ key: { $in: ['site_supervisor', 'supervisor'] } }).select('_id');
    const workerRole = await Role.findOne({ key: 'site_worker' }).select('_id');
    if (supervisorRoles.length === 0 || !workerRole) {
      return res.status(500).json({ message: 'supervisor/site_supervisor/site_worker roles are not seeded' });
    }
    const supervisorRoleIds = supervisorRoles.map(r => r._id);

    // Validate and resolve user details for rich audit entries
    let supervisorDocs = [];
    let workerDocs = [];
    if (supervisorIdArr.length > 0) {
      supervisorDocs = await User.find({
        _id: { $in: supervisorIdArr },
        isActive: true,
        roles: { $in: supervisorRoleIds }
      }).select('_id name email');
      if (supervisorDocs.length !== supervisorIdArr.length) {
        return res.status(400).json({ message: 'One or more supervisor IDs are invalid or do not have the supervisor/site_supervisor role' });
      }
    }
    if (workerIdArr.length > 0) {
      workerDocs = await User.find({
        _id: { $in: workerIdArr },
        isActive: true,
        roles: workerRole._id
      }).select('_id name email');
      if (workerDocs.length !== workerIdArr.length) {
        return res.status(400).json({ message: 'One or more worker IDs are invalid or do not have the site_worker role' });
      }
    }

    // Resolve prev member details for audit entries
    const prevMemberIds = Array.from(new Set([...prevSupervisors, ...prevWorkers]));
    const prevMemberDocs = prevMemberIds.length > 0
      ? await User.find({ _id: { $in: prevMemberIds } }).select('_id name email')
      : [];
    const toBrief = (u) => ({ _id: String(u._id), name: u.name, email: u.email });
    const byId = new Map([...prevMemberDocs, ...supervisorDocs, ...workerDocs].map(u => [String(u._id), toBrief(u)]));
    const fallback = (id) => byId.get(String(id)) || { _id: String(id), name: 'Unknown user', email: '' };

    const removedUserIds = [
      ...prevSupervisors.filter(id => !nextSupervisors.includes(id)),
      ...prevWorkers.filter(id => !nextWorkers.includes(id))
    ];
    const addedUserIds = [
      ...nextSupervisors.filter(id => !prevSupervisors.includes(id)),
      ...nextWorkers.filter(id => !prevWorkers.includes(id))
    ];

    project.supervisors = nextSupervisors;
    project.workers = nextWorkers;

    const changes = [];
    if (prevSupervisors.join(',') !== nextSupervisors.join(',')) {
      changes.push({
        field: 'supervisors',
        from: prevSupervisors.map(fallback),
        to: nextSupervisors.map(fallback)
      });
    }
    if (prevWorkers.join(',') !== nextWorkers.join(',')) {
      changes.push({
        field: 'workers',
        from: prevWorkers.map(fallback),
        to: nextWorkers.map(fallback)
      });
    }
    if (changes.length > 0) {
      project.edits = Array.isArray(project.edits) ? project.edits : [];
      project.edits.push({ editedBy: req.user.userId, editedAt: new Date(), changes });
    }

    await project.save();

    if (addedUserIds.length > 0) {
      await Employee.updateMany(
        { userId: { $in: addedUserIds } },
        { $addToSet: { assignedProjects: project._id } }
      );
    }
    if (removedUserIds.length > 0) {
      await Employee.updateMany(
        { userId: { $in: removedUserIds } },
        { $pull: { assignedProjects: project._id } }
      );
    }

    await project.populate('supervisors', 'name email');
    await project.populate('workers', 'name email');
    res.json(project);
  } catch (error) {
    console.error('Error allocating team:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create revision
router.post('/:id/revisions', auth, async (req, res) => {
  try {
    const { type, description, changes } = req.body;
    const project = await Project.findById(req.params.id);
    
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const canCreateRevision = req.user.roles.includes('manager') || req.user.roles.includes('admin');
    if (!canCreateRevision) {
      return res.status(403).json({ message: 'Only managers can create revisions' });
    }

    const version = project.revisions.length + 1;
    const revision = {
      version,
      type,
      description,
      changes,
      createdBy: req.user.userId
    };

    project.revisions.push(revision);
    await project.save();
    
    await project.populate('revisions.createdBy', 'name');
    res.json(project);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Approve revision
router.patch('/:id/revisions/:revisionId/approve', auth, async (req, res) => {
  try {
    const { status, comments } = req.body;
    const project = await Project.findById(req.params.id);
    
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const canApprove = req.user.roles.includes('manager') || req.user.roles.includes('admin');
    if (!canApprove) {
      return res.status(403).json({ message: 'Not authorized to approve revisions' });
    }

    const revision = project.revisions.id(req.params.revisionId);
    if (!revision) return res.status(404).json({ message: 'Revision not found' });

    revision.status = status;
    revision.approvedBy = req.user.userId;
    revision.approvedAt = new Date();
    revision.comments = comments;

    await project.save();
    res.json(project);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;