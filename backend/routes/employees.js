const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Employee = require('../models/Employee');
const User = require('../models/User');
const Role = require('../models/Role');
const GeneralAuditLog = require('../models/GeneralAuditLog');
const { syncUserActivationFromEmployee, activateEmployeeUser } = require('../services/employeeBridge');

const router = express.Router();

// Auth middleware (inline, matches existing pattern)
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

const hasHRAccess = (roles) =>
  roles.includes('hr') || roles.includes('manager') || roles.includes('admin');

// Multer config for HR document uploads
const uploadsDir = path.join(__dirname, '..', 'uploads', 'hr-documents');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  if (allowedMimes.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Invalid file type'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Photo-only upload pipeline for employee profile photos.
// Separate from the HR-document pipeline so its file filter is strictly
// image-only and files land in their own folder.
const photoUploadsDir = path.join(__dirname, '..', 'uploads', 'employee-photos');
if (!fs.existsSync(photoUploadsDir)) fs.mkdirSync(photoUploadsDir, { recursive: true });

const photoStorage = multer.diskStorage({
  destination: photoUploadsDir,
  filename: (req, file, cb) => {
    const safeId = String(req.params.id || 'anon').replace(/[^a-z0-9_-]/gi, '');
    const stamp = Date.now();
    cb(null, `${safeId}-${stamp}${path.extname(file.originalname).toLowerCase()}`);
  }
});

const photoFileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Photo must be a JPEG, PNG, or WebP image.'), false);
};

const photoUpload = multer({
  storage: photoStorage,
  fileFilter: photoFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }   // 5 MB cap
});

// Workflow definitions
const WORKFLOW_STAGES = {
  overseas: ['offer', 'mohre', 'visa', 'flight', 'arrival_medical', 'eid_visa_stamping', 'active'],
  uae_transfer: ['offer', 'mohre', 'old_employer_cancellation', 'status_change', 'medical', 'eid_visa_stamping', 'active'],
  emirati: ['offer', 'labour_card', 'gpssa_medical_registration', 'active']
};

// Checklist defaults by category
function defaultChecklist(category) {
  if (category === 'site_mission_visa') return [];
  return ['NDA', 'SIM', 'Email', 'Office Key', 'Laptop', 'Car', 'Mobile'].map(item => ({
    item,
    done: false
  }));
}

// Recursively strip empty strings & empty objects so Mongoose enums/dates don't reject them
function sanitize(input) {
  if (input === null || input === undefined) return undefined;
  if (Array.isArray(input)) {
    const out = input.map(sanitize).filter(v => v !== undefined);
    return out;
  }
  if (input instanceof Date) return input;
  if (typeof input === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(input)) {
      const cleaned = sanitize(v);
      if (cleaned !== undefined && !(typeof cleaned === 'object' && !Array.isArray(cleaned) && Object.keys(cleaned).length === 0)) {
        out[k] = cleaned;
      }
    }
    return out;
  }
  if (typeof input === 'string' && input.trim() === '') return undefined;
  return input;
}

async function audit(action, entityId, userId, details = {}, success = true) {
  try {
    await GeneralAuditLog.create({
      action,
      module: 'hr_management',
      entityType: 'employee',
      entityId,
      performedBy: userId,
      performedAt: new Date(),
      details,
      success
    });
  } catch (err) {
    console.error('[HR audit]', err.message);
  }
}

// GET all employees
router.get('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const { status, category, workflowType, search, role, location, locationGroup } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (category && category !== 'all') filter.category = category;
    if (workflowType && workflowType !== 'all') filter['workflow.type'] = workflowType;
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    // Location filter - matches employees whose Location is referenced
    // via ANY of the three assignment paths:
    //   1. baseLocationId === location
    //   2. additionalLocationIds contains location
    //   3. locationGroupId points to a Group whose locationIds contains location
    // Combined with an OR clause so a "Dubai HQ" filter shows everyone
    // whose direct base, additional set, or assigned group covers it.
    if (location && location !== 'all') {
      const LocationGroup = require('../models/LocationGroup');
      const groupIds = await LocationGroup.find({ locationIds: location }).distinct('_id');
      const locOr = [
        { baseLocationId: location },
        { additionalLocationIds: location }
      ];
      if (groupIds.length > 0) locOr.push({ locationGroupId: { $in: groupIds } });
      // Combine with existing $or (search) using $and to keep both filters live
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: locOr }];
        delete filter.$or;
      } else {
        filter.$or = locOr;
      }
    }
    if (locationGroup && locationGroup !== 'all') {
      filter.locationGroupId = locationGroup;
    }

    // Role-based filter: scope employees to those whose linked User carries the given role key
    if (role && role !== 'all') {
      const roleDoc = await Role.findOne({ key: role }).select('_id');
      if (!roleDoc) return res.json([]);
      const usersWithRole = await User.find({ roles: roleDoc._id }).select('_id');
      const userIds = usersWithRole.map(u => u._id);
      if (userIds.length === 0) return res.json([]);
      filter.userId = { $in: userIds };
    }

    const employees = await Employee.find(filter)
      .populate('createdBy', 'name email')
      .populate('reportingTo', 'name email')
      .populate('assignedProjects', 'name status')
      .populate('baseLocationId', 'name type status')
      .populate('additionalLocationIds', 'name type status')
      .populate('locationGroupId', 'name type status')
      .populate({
        path: 'userId',
        select: 'name email roles isActive',
        populate: { path: 'roles', select: 'key name' }
      })
      .sort({ createdAt: -1 });

    res.json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET expiring documents
router.get('/expiring-documents', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const within = Number(req.query.within) || 30;
    const now = new Date();
    const cutoff = new Date(now.getTime() + within * 24 * 60 * 60 * 1000);

    const employees = await Employee.find({
      status: { $in: ['onboarding', 'active', 'on_leave'] },
      $or: [
        { 'documents.passport.expiryDate': { $lte: cutoff } },
        { 'documents.visa.expiryDate': { $lte: cutoff } },
        { 'documents.labourCard.expiryDate': { $lte: cutoff } },
        { 'documents.emiratesId.expiryDate': { $lte: cutoff } },
        { 'documents.insurance.expiryDate': { $lte: cutoff } },
        { 'documents.medical.expiryDate': { $lte: cutoff } }
      ]
    }).select('employeeId fullName category documents status');

    const results = [];
    const docKeys = ['passport', 'visa', 'labourCard', 'emiratesId', 'insurance', 'medical'];
    for (const emp of employees) {
      for (const key of docKeys) {
        const exp = emp.documents?.[key]?.expiryDate;
        if (!exp) continue;
        const days = Math.floor((new Date(exp).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        if (days <= within) {
          results.push({
            employeeId: emp.employeeId,
            employee: emp._id,
            fullName: emp.fullName,
            document: key,
            expiryDate: exp,
            daysUntilExpiry: days
          });
        }
      }
    }

    res.json(results.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry));
  } catch (error) {
    console.error('Error fetching expiring documents:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET single employee
router.get('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    const employee = await Employee.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('reportingTo', 'name email')
      .populate('assignedProjects', 'name status')
      .populate('baseLocationId', 'name type status address geofenceRadiusMeters noGeofence')
      .populate('additionalLocationIds', 'name type status address geofenceRadiusMeters noGeofence')
      .populate({
        path: 'locationGroupId',
        select: 'name type status description locationIds',
        populate: { path: 'locationIds', select: 'name type status address geofenceRadiusMeters noGeofence' }
      })
      .populate('edits.editedBy', 'name email')
      .populate('onboardingChecklist.doneBy', 'name email')
      .populate('workflow.stagesCompleted.completedBy', 'name email')
      .populate({
        path: 'userId',
        select: 'name email roles isActive',
        populate: { path: 'roles', select: 'key name' }
      });

    if (!employee) return res.status(404).json({ message: 'Employee not found.' });

    const isSelf = employee.userId && employee.userId.toString() === req.user.userId;
    if (!hasHRAccess(roles) && !isSelf) {
      // Project-floor roles can view employees who share a project with
      // them. This unblocks PE/SS/Sup clicking through to an employee
      // detail page from My Projects → Site Team. Edit buttons on the
      // EmployeeDetail page still respect HR-level checks downstream.
      const isProjectFloor = roles.includes('project_engineer')
                           || roles.includes('site_supervisor')
                           || roles.includes('supervisor');
      let allowed = false;
      if (isProjectFloor) {
        const Project = require('../models/Project');
        const myUid = req.user.userId;
        // Projects the caller is on
        const myProjectIds = await Project.find({
          $or: [
            { assignedProjectEngineer: myUid },
            { supervisors: myUid }
          ]
        }).distinct('_id');
        if (myProjectIds.length > 0) {
          // Allow if target Employee has any of these in assignedProjects
          const empProjects = (employee.assignedProjects || []).map(p => String(p?._id || p));
          allowed = empProjects.some(pid => myProjectIds.map(String).includes(pid));
          // Or if target's userId is in any of those projects' workers/supervisors
          if (!allowed && employee.userId) {
            const overlapProject = await Project.findOne({
              _id: { $in: myProjectIds },
              $or: [
                { workers:     employee.userId },
                { supervisors: employee.userId }
              ]
            }).select('_id');
            if (overlapProject) allowed = true;
          }
        }
      }
      if (!allowed) {
        return res.status(403).json({ message: 'Access denied.' });
      }
    }

    res.json(employee);
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create employee
router.post('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const body = sanitize(req.body || {}) || {};
    if (!body.fullName || !body.category) {
      return res.status(400).json({ message: 'fullName and category are required.' });
    }
    if (!body.workflow || !body.workflow.type || !WORKFLOW_STAGES[body.workflow.type]) {
      return res.status(400).json({ message: 'Valid workflow.type is required (overseas | uae_transfer | emirati).' });
    }

    const initialStages = WORKFLOW_STAGES[body.workflow.type];
    const employee = await Employee.create({
      ...body,
      workflow: {
        type: body.workflow.type,
        currentStage: initialStages[0],
        stagesCompleted: []
      },
      onboardingChecklist: body.onboardingChecklist && body.onboardingChecklist.length
        ? body.onboardingChecklist
        : defaultChecklist(body.category),
      status: body.status || 'onboarding',
      createdBy: req.user.userId
    });

    await audit('employee_created', employee._id, req.user.userId, { fullName: employee.fullName, category: employee.category });
    res.status(201).json(employee);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Duplicate key — employeeId may already exist.' });
    }
    console.error('Error creating employee:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// PUT update employee
router.put('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found.' });

    const body = sanitize(req.body || {}) || {};
    const changes = [];
    const simpleFields = ['fullName', 'email', 'phone', 'dob', 'nationality', 'gender',
      'category', 'status', 'otEligible', 'position', 'department',
      'joiningDate', 'probationEndDate', 'reportingTo', 'notes',
      'baseLocationId', 'locationGroupId'];

    const previousStatus = employee.status;

    for (const f of simpleFields) {
      if (body[f] !== undefined && String(body[f]) !== String(employee[f] || '')) {
        changes.push({ field: f, from: employee[f], to: body[f] });
        employee[f] = body[f];
      }
    }

    // Nested updates (offer letter, contract, documents, userId link, assignedProjects)
    if (body.userId !== undefined) employee.userId = body.userId || null;
    if (body.assignedProjects !== undefined) employee.assignedProjects = body.assignedProjects;
    if (body.additionalLocationIds !== undefined) employee.additionalLocationIds = body.additionalLocationIds;
    if (body.offerLetter) Object.assign(employee.offerLetter || {}, body.offerLetter);
    if (body.contract) Object.assign(employee.contract || {}, body.contract);
    if (body.documents) {
      for (const key of Object.keys(body.documents)) {
        employee.documents[key] = { ...(employee.documents[key] || {}), ...body.documents[key] };
      }
    }

    if (changes.length > 0) {
      employee.edits.push({
        editedBy: req.user.userId,
        editedAt: new Date(),
        changes
      });
    }

    await employee.save();
    await audit('employee_updated', employee._id, req.user.userId, { changesCount: changes.length });

    if (previousStatus !== employee.status) {
      await syncUserActivationFromEmployee(employee, req.user.userId);
    }

    // Mirror name / email back to the linked User so the two stay in sync.
    // We only push fields the caller actually changed on the employee form.
    if (employee.userId) {
      try {
        const User = require('../models/User');
        const linkedUser = await User.findById(employee.userId);
        if (linkedUser) {
          const nameChanged  = changes.some(c => c.field === 'fullName');
          const emailChanged = changes.some(c => c.field === 'email');
          let touched = false;
          if (nameChanged && employee.fullName && linkedUser.name !== employee.fullName) {
            linkedUser.name = employee.fullName;
            touched = true;
          }
          if (emailChanged && employee.email
              && (linkedUser.email || '').toLowerCase() !== employee.email.toLowerCase()) {
            linkedUser.email = employee.email.toLowerCase();
            touched = true;
          }
          if (touched) await linkedUser.save();
        }
      } catch (err) {
        console.warn('[employees PUT] mirror to user failed:', err.message);
      }
    }

    res.json(employee);
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// POST activate employee as a user account (HR identity bridge)
router.post('/:id/activate-user', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found.' });

    const { roleKeys, existingUserId } = req.body || {};
    const result = await activateEmployeeUser({
      employee,
      roleKeys,
      existingUserId: existingUserId || null,
      actorUserId: req.user.userId
    });

    const auditAction = result.mode === 'linked' ? 'employee_user_linked' : 'employee_user_provisioned';
    await audit(auditAction, employee._id, req.user.userId, {
      userId: result.user._id,
      roles: result.roleKeys,
      mode: result.mode
    });

    res.status(201).json({
      user: {
        _id: result.user._id,
        name: result.user.name,
        email: result.user.email,
        roles: result.roleKeys,
        mustChangePassword: result.mode === 'created'
      },
      tempPassword: result.tempPassword,
      mode: result.mode,
      message: result.mode === 'linked'
        ? 'Existing user linked. They keep their current password and any prior roles.'
        : 'User provisioned. The temporary password is shown once — copy it now.'
    });
  } catch (error) {
    if (error.status) {
      const payload = { message: error.message };
      if (error.extra) Object.assign(payload, error.extra);
      return res.status(error.status).json(payload);
    }
    console.error('Error activating employee user:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// POST upload document / attachment
router.post('/:id/documents', auth, upload.array('attachments', 10), async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) {
      if (req.files) req.files.forEach(f => fs.existsSync(f.path) && fs.unlinkSync(f.path));
      return res.status(403).json({ message: 'Access denied.' });
    }

    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      if (req.files) req.files.forEach(f => fs.existsSync(f.path) && fs.unlinkSync(f.path));
      return res.status(404).json({ message: 'Employee not found.' });
    }

    const docType = req.body.docType;
    const attachments = (req.files || []).map(f => ({
      filename: f.filename,
      originalName: f.originalname,
      path: `/uploads/hr-documents/${f.filename}`,
      mimetype: f.mimetype,
      size: f.size,
      uploadedAt: new Date(),
      uploadedBy: req.user.userId
    }));

    employee.attachments.push(...attachments);

    // If docType provided, link the attachment ID to that document slot.
    // Top-level slots (offerLetter, contract) live directly on the employee;
    // everything else lives inside employee.documents.
    if (docType && attachments.length > 0) {
      const lastAttachment = employee.attachments[employee.attachments.length - 1];
      if (docType === 'offerLetter' || docType === 'contract') {
        if (!employee[docType]) employee[docType] = {};
        employee[docType].attachmentId = lastAttachment._id.toString();
      } else if (employee.documents[docType]) {
        employee.documents[docType].attachmentId = lastAttachment._id.toString();
      }
    }

    await employee.save();
    await audit('document_uploaded', employee._id, req.user.userId, { docType, count: attachments.length });
    res.json(employee);
  } catch (error) {
    if (req.files) req.files.forEach(f => fs.existsSync(f.path) && fs.unlinkSync(f.path));
    console.error('Error uploading documents:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// DELETE attachment
router.delete('/:id/documents/:attachmentId', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found.' });

    const attachment = employee.attachments.id(req.params.attachmentId);
    if (!attachment) return res.status(404).json({ message: 'Attachment not found.' });

    // Remove file from disk
    const filePath = path.join(__dirname, '..', attachment.path.replace(/^\/+/, ''));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    employee.attachments.pull(req.params.attachmentId);

    // Unlink from any documents.{type}.attachmentId that pointed to this
    for (const key of Object.keys(employee.documents.toObject ? employee.documents.toObject() : employee.documents)) {
      if (employee.documents[key] && employee.documents[key].attachmentId === req.params.attachmentId) {
        employee.documents[key].attachmentId = undefined;
      }
    }
    // Unlink from top-level slots
    for (const key of ['offerLetter', 'contract']) {
      if (employee[key] && employee[key].attachmentId === req.params.attachmentId) {
        employee[key].attachmentId = undefined;
      }
    }

    await employee.save();
    await audit('document_deleted', employee._id, req.user.userId, { attachmentId: req.params.attachmentId });
    res.json(employee);
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST upload / replace the employee profile photo. HR-only.
router.post('/:id/photo', auth, photoUpload.single('photo'), async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({ message: 'Access denied.' });
    }
    if (!req.file) return res.status(400).json({ message: 'No photo file provided.' });

    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: 'Employee not found.' });
    }

    // Best-effort delete of the previously-stored photo to avoid orphaned files.
    if (employee.photoUrl && employee.photoUrl.startsWith('/uploads/employee-photos/')) {
      const oldPath = path.join(__dirname, '..', employee.photoUrl.replace(/^\/+/, ''));
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch {}
      }
    }

    employee.photoUrl = `/uploads/employee-photos/${req.file.filename}`;
    await employee.save();
    await audit('employee_photo_uploaded', employee._id, req.user.userId, { filename: req.file.filename, size: req.file.size });
    res.json({ photoUrl: employee.photoUrl });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    console.error('Error uploading employee photo:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// DELETE the employee profile photo. HR-only.
router.delete('/:id/photo', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found.' });

    if (employee.photoUrl && employee.photoUrl.startsWith('/uploads/employee-photos/')) {
      const oldPath = path.join(__dirname, '..', employee.photoUrl.replace(/^\/+/, ''));
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch {}
      }
    }
    employee.photoUrl = undefined;
    await employee.save();
    await audit('employee_photo_deleted', employee._id, req.user.userId);
    res.json({ photoUrl: null });
  } catch (error) {
    console.error('Error deleting employee photo:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH toggle onboarding checklist item
router.patch('/:id/checklist/:item', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found.' });

    const decodedItem = decodeURIComponent(req.params.item);
    const target = employee.onboardingChecklist.find(c => c.item === decodedItem);
    if (!target) return res.status(404).json({ message: 'Checklist item not found.' });

    target.done = req.body.done !== undefined ? !!req.body.done : !target.done;
    target.doneAt = target.done ? new Date() : null;
    target.doneBy = target.done ? req.user.userId : null;
    if (req.body.notes !== undefined) target.notes = req.body.notes;

    await employee.save();
    await audit('checklist_item_toggled', employee._id, req.user.userId, { item: decodedItem, done: target.done });
    res.json(employee);
  } catch (error) {
    console.error('Error toggling checklist:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST advance onboarding workflow
router.post('/:id/workflow/advance', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found.' });

    const stages = WORKFLOW_STAGES[employee.workflow.type];
    if (!stages) return res.status(400).json({ message: 'Invalid workflow type on employee.' });

    const currentIdx = stages.indexOf(employee.workflow.currentStage);
    if (currentIdx === -1) return res.status(400).json({ message: 'Current stage not recognized.' });
    if (currentIdx >= stages.length - 1) {
      return res.status(400).json({ message: 'Workflow already at terminal stage.' });
    }

    const nextStage = stages[currentIdx + 1];
    const requestedNext = req.body.stage;
    if (requestedNext && requestedNext !== nextStage) {
      return res.status(400).json({ message: `Next stage must be "${nextStage}", got "${requestedNext}".` });
    }

    employee.workflow.stagesCompleted.push({
      stage: employee.workflow.currentStage,
      completedAt: new Date(),
      completedBy: req.user.userId,
      notes: req.body.notes || ''
    });
    employee.workflow.currentStage = nextStage;

    if (nextStage === 'active') {
      employee.status = 'active';
      if (!employee.joiningDate) employee.joiningDate = new Date();
    }

    const previousStatusBeforeAdvance = employee.status;
    await employee.save();
    await audit('workflow_stage_advanced', employee._id, req.user.userId, { to: nextStage, previousStatus: previousStatusBeforeAdvance });
    res.json(employee);
  } catch (error) {
    console.error('Error advancing workflow:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST revert onboarding workflow to previous stage
router.post('/:id/workflow/revert', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found.' });

    const stages = WORKFLOW_STAGES[employee.workflow.type];
    if (!stages) return res.status(400).json({ message: 'Invalid workflow type on employee.' });

    const currentIdx = stages.indexOf(employee.workflow.currentStage);
    if (currentIdx === -1) return res.status(400).json({ message: 'Current stage not recognized.' });
    if (currentIdx === 0 || (employee.workflow.stagesCompleted || []).length === 0) {
      return res.status(400).json({ message: 'Already at the first stage — nothing to revert.' });
    }

    const isCurrentlyActive = employee.workflow.currentStage === 'active';
    if (isCurrentlyActive && employee.userId) {
      return res.status(400).json({
        message: 'Cannot revert from "active" after a user account has been provisioned. Use the offboarding flow instead.'
      });
    }

    const fromStage = employee.workflow.currentStage;
    const lastCompleted = employee.workflow.stagesCompleted[employee.workflow.stagesCompleted.length - 1];
    const targetStage = lastCompleted?.stage || stages[currentIdx - 1];

    employee.workflow.stagesCompleted.pop();
    employee.workflow.currentStage = targetStage;

    if (isCurrentlyActive) {
      employee.status = 'onboarding';
      employee.joiningDate = null;
    }

    await employee.save();
    await audit('workflow_stage_reverted', employee._id, req.user.userId, {
      from: fromStage,
      to: targetStage,
      wasActive: isCurrentlyActive
    });
    res.json(employee);
  } catch (error) {
    console.error('Error reverting workflow:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE employee
router.delete('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!(roles.includes('admin') || roles.includes('manager'))) {
      return res.status(403).json({ message: 'Access denied. Admin or Manager required.' });
    }

    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found.' });

    await audit('employee_deleted', employee._id, req.user.userId, { fullName: employee.fullName });
    res.json({ message: 'Employee deleted.' });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ------------------------------------------------------------------ *
 *  POST /api/employees/bulk-assign-location
 *  Bulk assign baseLocationId, locationGroupId, or both to many
 *  employees in one go.
 *
 *  Body shape:
 *    { rows: [
 *        { employeeId, baseLocationName?, locationGroupName? },
 *        ...
 *    ] }
 *
 *  Names are resolved server-side so admins can paste CSV-style data
 *  without copying ObjectIds. Returns a result row per input row so
 *  the UI can show success / skip / error inline.
 * ------------------------------------------------------------------ */
const Location = require('../models/Location');
const LocationGroup = require('../models/LocationGroup');

router.post('/bulk-assign-location', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) {
      return res.status(403).json({ message: 'Access denied. HR/Manager/Admin only.' });
    }
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (rows.length === 0) {
      return res.status(400).json({ message: 'No rows provided.' });
    }
    if (rows.length > 2000) {
      return res.status(400).json({ message: 'Too many rows (max 2000 per batch).' });
    }

    // Resolve names → ids in one pass (cache hits dominate after first lookup)
    const locationCache = new Map();   // name (lowercase) → Location._id
    const groupCache    = new Map();
    async function resolveLocation(name) {
      if (!name) return null;
      const k = String(name).trim().toLowerCase();
      if (!k) return null;
      if (locationCache.has(k)) return locationCache.get(k);
      const loc = await Location.findOne({ name: new RegExp(`^${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
      const val = loc ? loc._id : null;
      locationCache.set(k, val);
      return val;
    }
    async function resolveGroup(name) {
      if (!name) return null;
      const k = String(name).trim().toLowerCase();
      if (!k) return null;
      if (groupCache.has(k)) return groupCache.get(k);
      const grp = await LocationGroup.findOne({ name: new RegExp(`^${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
      const val = grp ? grp._id : null;
      groupCache.set(k, val);
      return val;
    }

    const results = [];
    let updated = 0, skipped = 0, errored = 0;

    for (const raw of rows) {
      const employeeIdStr = String(raw?.employeeId || '').trim();
      const baseLocName   = String(raw?.baseLocationName || '').trim();
      const groupName     = String(raw?.locationGroupName || '').trim();

      if (!employeeIdStr) {
        results.push({ employeeId: '', status: 'error', reason: 'employeeId is required' });
        errored++;
        continue;
      }
      if (!baseLocName && !groupName) {
        results.push({ employeeId: employeeIdStr, status: 'skipped', reason: 'no baseLocationName or locationGroupName' });
        skipped++;
        continue;
      }

      // Match by employeeId code (EMP-00001) or by Mongo ObjectId
      let emp = null;
      if (/^[a-f0-9]{24}$/i.test(employeeIdStr)) {
        emp = await Employee.findById(employeeIdStr);
      }
      if (!emp) emp = await Employee.findOne({ employeeId: employeeIdStr });
      if (!emp) {
        results.push({ employeeId: employeeIdStr, status: 'error', reason: 'employee not found' });
        errored++;
        continue;
      }

      const changes = [];
      if (baseLocName) {
        const newId = await resolveLocation(baseLocName);
        if (!newId) {
          results.push({ employeeId: employeeIdStr, status: 'error', reason: `location "${baseLocName}" not found` });
          errored++;
          continue;
        }
        if (String(emp.baseLocationId || '') !== String(newId)) {
          changes.push({ field: 'baseLocationId', from: emp.baseLocationId, to: newId });
          emp.baseLocationId = newId;
        }
      }
      if (groupName) {
        const newId = await resolveGroup(groupName);
        if (!newId) {
          results.push({ employeeId: employeeIdStr, status: 'error', reason: `location group "${groupName}" not found` });
          errored++;
          continue;
        }
        if (String(emp.locationGroupId || '') !== String(newId)) {
          changes.push({ field: 'locationGroupId', from: emp.locationGroupId, to: newId });
          emp.locationGroupId = newId;
        }
      }

      if (changes.length === 0) {
        results.push({ employeeId: employeeIdStr, status: 'skipped', reason: 'no change' });
        skipped++;
        continue;
      }

      emp.edits.push({ editedBy: req.user.userId, editedAt: new Date(), changes });
      await emp.save();
      results.push({
        employeeId: employeeIdStr,
        name: emp.fullName,
        status: 'updated',
        changes: changes.map(c => c.field)
      });
      updated++;
    }

    await GeneralAuditLog.create({
      action: 'employee_bulk_location_assigned',
      module: 'hr_management',
      entityType: 'employee',
      performedBy: req.user.userId,
      performedAt: new Date(),
      details: { rowCount: rows.length, updated, skipped, errored },
      success: true
    }).catch(err => console.error('[bulk audit]', err.message));

    res.json({ updated, skipped, errored, totalRows: rows.length, results });
  } catch (err) {
    console.error('Error in bulk-assign-location:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
module.exports.WORKFLOW_STAGES = WORKFLOW_STAGES;
