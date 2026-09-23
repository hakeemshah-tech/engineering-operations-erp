const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const PurchaseOrder = require('../models/PurchaseOrder');
const PurchaseRequest = require('../models/PurchaseRequest');
const Material = require('../models/Material');
const Supplier = require('../models/Supplier');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const generatePOPdf = require('../utils/generatePOPdf');
const { getPoTypeDefaultCode } = require('../utils/accounts/expenseAccountResolver');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads (Purchase Orders)
const uploadsDir = path.join(__dirname, '..', 'uploads', 'purchase-orders');
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

// Auth middleware
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

// Helper: check roles
const hasRole = (roles, role) => roles.includes(role);

// Helper: add audit entry
const addAudit = (order, action, userId, notes = '', details = null) => {
  order.auditTrail.push({
    action,
    performedBy: userId,
    performedAt: new Date(),
    notes,
    revision: order.revision,
    details
  });
};

// =========================================
// GET /available-pr-items - PR items not fully allocated to POs
// =========================================
router.get('/available-pr-items', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasRole(roles, 'procurement_engineer') && !hasRole(roles, 'admin') && !hasRole(roles, 'manager')) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get approved PRs
    const prs = await PurchaseRequest.find({ status: { $in: ['approved', 'fulfilled', 'received'] } })
      .populate('projectId', 'name')
      .populate('createdBy', 'name')
      .populate('items.materialId', 'name sku uom quantity');

    // Get all non-cancelled POs to calculate allocated quantities
    // If excludePoId is provided, exclude that PO from allocation calculation (for editing)
    const poFilter = { status: { $nin: ['cancelled'] } };
    if (req.query.excludePoId) {
      poFilter._id = { $ne: req.query.excludePoId };
    }
    const existingPOs = await PurchaseOrder.find(poFilter);

    // Build allocation map: { prId_itemId => allocatedQty }
    const allocationMap = {};
    for (const po of existingPOs) {
      for (const src of po.sourceRequests) {
        for (const srcItem of src.items) {
          const key = `${src.requestId}_${srcItem.requestItemId}`;
          allocationMap[key] = (allocationMap[key] || 0) + (srcItem.allocatedQty || 0);
        }
      }
    }

    // Build available items
    const availablePRs = [];
    for (const pr of prs) {
      const availableItems = [];
      for (const item of pr.items) {
        const key = `${pr._id}_${item._id}`;
        const allocated = allocationMap[key] || 0;
        const remaining = item.quantity - allocated;
        if (remaining > 0) {
          availableItems.push({
            itemId: item._id,
            materialId: item.materialId?._id || item.materialId,
            materialName: item.materialName || item.materialId?.name || 'Unknown',
            sku: item.sku || item.materialId?.sku || '',
            uom: item.uom || item.materialId?.uom || '',
            requestedQty: item.quantity,
            allocatedQty: allocated,
            remainingQty: remaining
          });
        }
      }
      if (availableItems.length > 0) {
        availablePRs.push({
          requestId: pr._id,
          requestNumber: pr.requestNumber,
          project: pr.projectId?.name || 'No Project',
          projectId: pr.projectId?._id,
          createdBy: pr.createdBy?.name || 'Unknown',
          priority: pr.priority,
          createdAt: pr.createdAt,
          items: availableItems
        });
      }
    }

    res.json(availablePRs);
  } catch (error) {
    console.error('Error fetching available PR items:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =========================================
// GET / - List POs
// =========================================
router.get('/', auth, async (req, res) => {
  try {
    const { status, poType, page = 1, limit = 50 } = req.query;
    const roles = req.user.roles || [];
    const isAdmin = hasRole(roles, 'admin');
    const isManager = hasRole(roles, 'manager');
    const isPE = hasRole(roles, 'procurement_engineer');
    const isAM = hasRole(roles, 'account_manager');
    const isIM = hasRole(roles, 'inventory_manager');

    if (!isAdmin && !isManager && !isPE && !isAM && !isIM) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const filter = {};
    if (status) filter.status = status;
    if (poType) filter.poType = poType;

    // PE sees their own or all; IM sees fulfilled+ for GRN (material POs only)
    if (!isAdmin && !isManager && !isAM) {
      if (isPE) {
        filter.createdBy = req.user.userId;
      } else if (isIM) {
        filter.status = { $in: ['fulfilled', 'received', 'confirmed', 'payment_requested', 'payment_completed'] };
        filter.poType = 'material'; // IM only sees material POs (for GRN)
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [orders, total] = await Promise.all([
      PurchaseOrder.find(filter)
        .populate('createdBy', 'name email')
        .populate('projectId', 'name')
        .populate('supplierId', 'name trn contactPerson phone email address')
        .populate('items.materialId', 'name sku')
        .populate('approvals.accountManager.userId', 'name')
        .populate('approvals.generalManager.userId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      PurchaseOrder.countDocuments(filter)
    ]);

    res.json({ orders, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =========================================
// GET /:id/download-pdf - Download PO as PDF
// =========================================
router.get('/:id/download-pdf', auth, async (req, res) => {
  try {
    console.log(`[PDF] Download request from user: ${req.user._id}`);

    const roles = req.user.roles || [];
    const isAdmin = hasRole(roles, 'admin');
    const isManager = hasRole(roles, 'manager');
    const isPE = hasRole(roles, 'procurement_engineer');
    const isAM = hasRole(roles, 'account_manager');
    const isIM = hasRole(roles, 'inventory_manager');

    if (!isAdmin && !isManager && !isPE && !isAM && !isIM) {
      console.warn(`[PDF] Access denied - user roles: ${roles.join(', ')}`);
      return res.status(403).json({ message: 'Access denied' });
    }

    console.log(`[PDF] Fetching PO: ${req.params.id}`);
    const order = await PurchaseOrder.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('projectId', 'name locationDetails')
      .populate('supplierId', 'name trn contactPerson phone email address')
      .populate('items.materialId', 'name sku quantity uom')
      .populate('sourceRequests.requestId', 'requestNumber status')
      .populate('approvals.accountManager.userId', 'name email')
      .populate('approvals.generalManager.userId', 'name email');

    if (!order) {
      console.warn(`[PDF] PO not found: ${req.params.id}`);
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    console.log(`[PDF] Found PO: ${order.poNumber}, generating PDF...`);

    // Set response headers BEFORE any writes
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="PO-${order.poNumber || order._id}.pdf"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Generate PDF as buffer
    try {
      console.log(`[PDF] Generating PDF for PO: ${order.poNumber}`);
      const pdfBuffer = await generatePOPdf(order);

      console.log(`[PDF] Generated PDF size: ${pdfBuffer.length} bytes`);
      console.log(`[PDF] PDF header (first 4 bytes): ${pdfBuffer.slice(0, 4).toString('hex')}`);

      // Set Content-Length header so browser knows the exact file size
      res.setHeader('Content-Length', pdfBuffer.length);

      // Send the complete buffer
      res.end(pdfBuffer);
      console.log(`[PDF] Sent PDF to client for PO: ${order.poNumber}`);
    } catch (pdfError) {
      console.error(`[PDF] PDF generation error: ${pdfError.message}`);
      console.error(`[PDF] Stack:`, pdfError.stack);
      // Only send error if headers haven't been sent
      if (!res.headersSent) {
        res.status(500).json({ message: 'Failed to generate PDF' });
      } else {
        res.end();
      }
    }
  } catch (error) {
    console.error(`[PDF] Endpoint error: ${error.message}`);
    console.error(`[PDF] Stack:`, error.stack);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to generate PDF' });
    }
  }
});

// =========================================
// GET /:id - Single PO
// =========================================
router.get('/:id', auth, async (req, res) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('projectId', 'name locationDetails')
      .populate('supplierId', 'name trn contactPerson phone email address')
      .populate('items.materialId', 'name sku quantity uom')
      .populate('sourceRequests.requestId', 'requestNumber status')
      .populate('approvals.accountManager.userId', 'name email')
      .populate('approvals.generalManager.userId', 'name email')
      .populate('auditTrail.performedBy', 'name')
      .populate('revisionHistory.revisedBy', 'name')
      .populate('receivedBy', 'name email')
      .populate('fulfilledBy', 'name email')
      .populate('confirmedBy', 'name email')
      .populate('paymentRequests.requestedBy', 'name email')
      .populate('paymentRequests.processedBy', 'name email')
      .populate('completionAttachments.uploadedBy', 'name email');

    if (!order) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    res.json(order);
  } catch (error) {
    console.error('Error fetching purchase order:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =========================================
// POST / - Create PO from selected PR items
// =========================================
router.post('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasRole(roles, 'procurement_engineer') && !hasRole(roles, 'admin') && !hasRole(roles, 'manager')) {
      return res.status(403).json({ message: 'Only Procurement Engineers can create purchase orders' });
    }

    const { poType, sourceRequests, items, serviceItems, otherItems, supplierId, supplier, deliveryDate, notes, priority, projectId, submitForApproval, vatPercentage, paymentTerms, annexure, taxType, taxRate, discountType, discountRate, accountingDetails, timelineStart, timelineEnd } = req.body;

    const isServicePO = ['manpower', 'subcontracting', 'machine_rental'].includes(poType);
    const isOtherPO = poType === 'other';

    if (isOtherPO) {
      if (!otherItems || otherItems.length === 0) {
        return res.status(400).json({ message: 'At least one item is required for Other POs' });
      }
      // Auto-calculate lineTotal for each item
      otherItems.forEach(item => {
        const subtotal = item.quantity * item.unitPrice * (item.duration || 1);
        const itemTax = item.taxType === 'percentage'
          ? (subtotal * item.taxRate / 100)
          : item.taxRate;
        const itemDiscount = item.discountType === 'percentage'
          ? (subtotal * item.discountRate / 100)
          : item.discountRate;
        item.lineTotal = subtotal + itemTax - itemDiscount;
      });
    } else if (isServicePO) {
      if (!serviceItems || serviceItems.length === 0) {
        return res.status(400).json({ message: 'At least one service item is required' });
      }
    } else {
      if (!items || items.length === 0) {
        return res.status(400).json({ message: 'At least one item is required' });
      }
    }

    // Auto-fill supplier fields from Supplier entity if supplierId is provided
    let supplierData = supplier || {};
    let resolvedSupplierId = supplierId || null;
    if (supplierId) {
      try {
        const supplierDoc = await Supplier.findById(supplierId);
        if (supplierDoc) {
          supplierData = {
            name: supplierDoc.name,
            contactPerson: supplierDoc.contactPerson,
            phone: supplierDoc.phone,
            email: supplierDoc.email,
            address: supplierDoc.address
          };
        }
      } catch (err) {
        console.log('Error fetching supplier:', err.message);
      }
    }

    // Validate quantity allocation against PRs (material POs only, skip for other POs)
    if (!isServicePO && !isOtherPO && sourceRequests && sourceRequests.length > 0) {
      // Get all non-cancelled POs for qty validation
      const existingPOs = await PurchaseOrder.find({ status: { $nin: ['cancelled'] } });
      const allocationMap = {};
      for (const po of existingPOs) {
        for (const src of po.sourceRequests) {
          for (const srcItem of src.items) {
            const key = `${src.requestId}_${srcItem.requestItemId}`;
            allocationMap[key] = (allocationMap[key] || 0) + (srcItem.allocatedQty || 0);
          }
        }
      }

      // Verify each source item
      for (const src of sourceRequests) {
        const pr = await PurchaseRequest.findById(src.requestId);
        if (!pr) {
          return res.status(400).json({ message: `Purchase request ${src.requestId} not found` });
        }
        for (const srcItem of src.items) {
          const prItem = pr.items.id(srcItem.requestItemId);
          if (!prItem) {
            return res.status(400).json({ message: `PR item ${srcItem.requestItemId} not found in ${pr.requestNumber}` });
          }
          const key = `${src.requestId}_${srcItem.requestItemId}`;
          const existing = allocationMap[key] || 0;
          const newTotal = existing + (srcItem.allocatedQty || 0);
          if (newTotal > prItem.quantity) {
            return res.status(400).json({
              message: `Over-allocation for ${srcItem.materialName || 'item'}: PR has ${prItem.quantity}, already allocated ${existing}, trying to add ${srcItem.allocatedQty}`
            });
          }
        }
      }
    }

    // Auto-set completion doc type for service POs
    let completionDocType;
    if (poType === 'manpower') completionDocType = 'timesheet';
    else if (poType === 'subcontracting') completionDocType = 'work_completion_report';
    else if (poType === 'machine_rental') completionDocType = 'machine_hire_sheet';

    // Account head (Chart of Accounts) resolution:
    //  - 'other' POs carry a per-item accountHead chosen during creation, so the
    //    PO-level head stays as whatever the client passed (usually empty).
    //  - standard POs (material/service) hide the field at creation and instead
    //    auto-select the configured expense ledger for the PO type. The Account
    //    Manager can override this at approval time.
    const resolvedAccountingDetails = { ...(accountingDetails || {}) };
    if (!isOtherPO && !resolvedAccountingDetails.overallAccountHead) {
      resolvedAccountingDetails.overallAccountHead = await getPoTypeDefaultCode(poType || 'material');
    }

    const order = new PurchaseOrder({
      poType: poType || 'material',
      sourceRequests: isServicePO || isOtherPO ? [] : (sourceRequests || []),
      items: isServicePO || isOtherPO ? [] : items,
      serviceItems: isServicePO ? serviceItems : [],
      otherItems: isOtherPO ? otherItems : [],
      supplierId: resolvedSupplierId,
      supplier: supplierData,
      deliveryDate,
      notes,
      priority: priority || 'normal',
      vatPercentage: vatPercentage || 0,
      projectId: projectId || null,
      paymentTerms: paymentTerms || { type: 'full_after_completion' },
      annexure: annexure || '',
      completionDocType,
      accountingDetails: resolvedAccountingDetails,
      // Other PO specific fields
      ...(isOtherPO && {
        taxType: taxType || 'percentage',
        taxRate: taxRate || 0,
        discountType: discountType || 'percentage',
        discountRate: discountRate || 0,
        timelineStart: timelineStart || null,
        timelineEnd: timelineEnd || null
      }),
      status: submitForApproval ? 'pending_am' : 'draft',
      createdBy: req.user.userId
    });

    const poTypeLabels = { material: 'Material', manpower: 'Manpower Hiring', subcontracting: 'Subcontracting', machine_rental: 'Machine Rental' };
    const isIndependent = !sourceRequests || sourceRequests.length === 0;
    const typeLabel = poTypeLabels[poType] || 'Material';
    addAudit(order, 'created', req.user.userId, isServicePO ? `${typeLabel} service PO created` : (isIndependent ? 'Independent PO created (no PR)' : 'Purchase order created'));
    if (submitForApproval) {
      addAudit(order, 'submitted_for_approval', req.user.userId, 'Submitted for Account Manager approval');
    }

    await order.save();

    const populated = await PurchaseOrder.findById(order._id)
      .populate('createdBy', 'name email')
      .populate('projectId', 'name');

    res.status(201).json(populated);
  } catch (error) {
    console.error('Error creating purchase order:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =========================================
// PUT /:id - Edit PO (draft/revised only)
// =========================================
router.put('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasRole(roles, 'procurement_engineer') && !hasRole(roles, 'admin')) {
      return res.status(403).json({ message: 'Only Procurement Engineers can edit purchase orders' });
    }

    const order = await PurchaseOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Purchase order not found' });

    if (!['draft', 'rejected'].includes(order.status)) {
      return res.status(400).json({ message: 'Only draft or rejected POs can be edited' });
    }

    if (order.lockedForEditing) {
      return res.status(400).json({ message: 'This PO is locked for editing' });
    }

    const { sourceRequests, items, serviceItems, otherItems, supplierId, supplier, deliveryDate, notes, priority, projectId, vatPercentage, paymentTerms, annexure, taxType, taxRate, discountType, discountRate, accountingDetails, timelineStart, timelineEnd } = req.body;
    const isServicePO = ['manpower', 'subcontracting', 'machine_rental'].includes(order.poType);
    const isOtherPO = order.poType === 'other';

    // Capture before-state for change tracking
    const before = {
      items: isServicePO || isOtherPO ? [] : (order.items || []).map(i => ({ materialName: i.materialName, sku: i.sku, quantity: i.quantity, unitPrice: i.unitPrice, uom: i.uom })),
      serviceItems: isServicePO ? (order.serviceItems || []).map(i => ({ description: i.description, rate: i.rate, rateType: i.rateType, quantity: i.quantity, duration: i.duration })) : [],
      otherItems: isOtherPO ? (order.otherItems || []).map(i => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, rateType: i.rateType, duration: i.duration, taxRate: i.taxRate, taxType: i.taxType, discountRate: i.discountRate, discountType: i.discountType, lineTotal: i.lineTotal })) : [],
      supplier: order.supplier?.name || '',
      deliveryDate: order.deliveryDate ? new Date(order.deliveryDate).toISOString().split('T')[0] : '',
      notes: order.notes || '',
      priority: order.priority || 'normal',
      vatPercentage: order.vatPercentage || 0,
      sourceRequests: (order.sourceRequests || []).map(s => s.requestId?.toString()),
      paymentTermsType: order.paymentTerms?.type || 'full_after_completion',
      advancePercentage: order.paymentTerms?.advancePercentage || 0,
      paymentTermsNotes: order.paymentTerms?.notes || '',
      annexure: order.annexure || '',
      ...(isOtherPO && {
        taxType: order.taxType || 'percentage',
        taxRate: order.taxRate || 0,
        discountType: order.discountType || 'percentage',
        discountRate: order.discountRate || 0
      })
    };

    // Auto-fill supplier from Supplier entity if supplierId provided
    if (supplierId) {
      try {
        const supplierDoc = await Supplier.findById(supplierId);
        if (supplierDoc) {
          order.supplierId = supplierId;
          order.supplier = {
            name: supplierDoc.name,
            contactPerson: supplierDoc.contactPerson,
            phone: supplierDoc.phone,
            email: supplierDoc.email,
            address: supplierDoc.address
          };
        }
      } catch (err) {
        console.log('Error fetching supplier:', err.message);
      }
    }

    // Quantity validation for source requests
    if (sourceRequests && sourceRequests.length > 0) {
      const existingPOs = await PurchaseOrder.find({
        status: { $nin: ['cancelled'] },
        _id: { $ne: order._id }
      });
      const allocationMap = {};
      for (const po of existingPOs) {
        for (const src of po.sourceRequests) {
          for (const srcItem of src.items) {
            const key = `${src.requestId}_${srcItem.requestItemId}`;
            allocationMap[key] = (allocationMap[key] || 0) + (srcItem.allocatedQty || 0);
          }
        }
      }

      for (const src of sourceRequests) {
        const pr = await PurchaseRequest.findById(src.requestId);
        if (!pr) return res.status(400).json({ message: `PR ${src.requestId} not found` });
        for (const srcItem of src.items) {
          const prItem = pr.items.id(srcItem.requestItemId);
          if (!prItem) return res.status(400).json({ message: `PR item not found` });
          const key = `${src.requestId}_${srcItem.requestItemId}`;
          const existing = allocationMap[key] || 0;
          if (existing + (srcItem.allocatedQty || 0) > prItem.quantity) {
            return res.status(400).json({
              message: `Over-allocation for ${srcItem.materialName}: max ${prItem.quantity - existing} remaining`
            });
          }
        }
      }
      order.sourceRequests = sourceRequests;
    }

    if (isServicePO) {
      if (serviceItems) order.serviceItems = serviceItems;
    } else if (isOtherPO) {
      if (otherItems) {
        // Calculate lineTotal for each item
        otherItems.forEach(item => {
          const subtotal = item.quantity * item.unitPrice * (item.duration || 1);
          const itemTax = item.taxType === 'percentage'
            ? (subtotal * item.taxRate / 100)
            : item.taxRate;
          const itemDiscount = item.discountType === 'percentage'
            ? (subtotal * item.discountRate / 100)
            : item.discountRate;
          item.lineTotal = subtotal + itemTax - itemDiscount;
        });
        order.otherItems = otherItems;
      }
      // Update PO-level tax/discount
      if (taxType !== undefined) order.taxType = taxType;
      if (taxRate !== undefined) order.taxRate = taxRate;
      if (discountType !== undefined) order.discountType = discountType;
      if (discountRate !== undefined) order.discountRate = discountRate;
      if (accountingDetails !== undefined) order.accountingDetails = accountingDetails;
      if (timelineStart !== undefined) order.timelineStart = timelineStart;
      if (timelineEnd !== undefined) order.timelineEnd = timelineEnd;
    } else {
      if (items) order.items = items;
    }
    if (supplier) order.supplier = supplier;
    if (deliveryDate !== undefined) order.deliveryDate = deliveryDate;
    if (notes !== undefined) order.notes = notes;
    if (priority) order.priority = priority;
    if (vatPercentage !== undefined) order.vatPercentage = vatPercentage;
    if (projectId !== undefined) order.projectId = projectId || null;
    if (paymentTerms !== undefined) order.paymentTerms = paymentTerms;
    if (annexure !== undefined) order.annexure = annexure;

    // Build after-state and compute changes
    const after = {
      items: isServicePO || isOtherPO ? [] : (order.items || []).map(i => ({ materialName: i.materialName, sku: i.sku, quantity: i.quantity, unitPrice: i.unitPrice, uom: i.uom })),
      serviceItems: isServicePO ? (order.serviceItems || []).map(i => ({ description: i.description, rate: i.rate, rateType: i.rateType, quantity: i.quantity, duration: i.duration })) : [],
      otherItems: isOtherPO ? (order.otherItems || []).map(i => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, rateType: i.rateType, duration: i.duration, taxRate: i.taxRate, taxType: i.taxType, discountRate: i.discountRate, discountType: i.discountType, lineTotal: i.lineTotal })) : [],
      supplier: order.supplier?.name || '',
      deliveryDate: order.deliveryDate ? new Date(order.deliveryDate).toISOString().split('T')[0] : '',
      notes: order.notes || '',
      priority: order.priority || 'normal',
      vatPercentage: order.vatPercentage || 0,
      sourceRequests: (order.sourceRequests || []).map(s => s.requestId?.toString()),
      paymentTermsType: order.paymentTerms?.type || 'full_after_completion',
      advancePercentage: order.paymentTerms?.advancePercentage || 0,
      paymentTermsNotes: order.paymentTerms?.notes || '',
      annexure: order.annexure || '',
      ...(isOtherPO && {
        taxType: order.taxType || 'percentage',
        taxRate: order.taxRate || 0,
        discountType: order.discountType || 'percentage',
        discountRate: order.discountRate || 0
      })
    };

    const changes = [];
    // Compare supplier
    if (before.supplier !== after.supplier) {
      changes.push({ field: 'Supplier', from: before.supplier || '(none)', to: after.supplier || '(none)' });
    }
    // Compare delivery date
    if (before.deliveryDate !== after.deliveryDate) {
      changes.push({ field: 'Delivery Date', from: before.deliveryDate || '(none)', to: after.deliveryDate || '(none)' });
    }
    // Compare notes
    if (before.notes !== after.notes) {
      changes.push({ field: 'Notes', from: before.notes || '(none)', to: after.notes || '(none)' });
    }
    // Compare priority
    if (before.priority !== after.priority) {
      changes.push({ field: 'Priority', from: before.priority, to: after.priority });
    }
    // Compare VAT
    if (before.vatPercentage !== after.vatPercentage) {
      changes.push({ field: 'VAT %', from: `${before.vatPercentage}%`, to: `${after.vatPercentage}%` });
    }
    // Compare items
    if (isServicePO) {
      const formatServiceItems = (arr) => arr.map(i => `${i.description} (${i.quantity} x ${i.rate} ${i.rateType})`).join(', ');
      const beforeSI = formatServiceItems(before.serviceItems);
      const afterSI = formatServiceItems(after.serviceItems);
      if (beforeSI !== afterSI) {
        changes.push({ field: 'Service Items', from: before.serviceItems, to: after.serviceItems, type: 'items' });
      }
    } else if (isOtherPO) {
      const formatOtherItems = (arr) => arr.map(i => `${i.description} (${i.quantity} x ${i.unitPrice})`).join(', ');
      const beforeOI = formatOtherItems(before.otherItems);
      const afterOI = formatOtherItems(after.otherItems);
      if (beforeOI !== afterOI) {
        changes.push({ field: 'Other Items', from: before.otherItems, to: after.otherItems, type: 'items' });
      }
      // Compare PO-level tax/discount
      if (before.taxRate !== after.taxRate || before.taxType !== after.taxType) {
        changes.push({
          field: 'PO-Level Tax',
          from: `${before.taxRate}${before.taxType === 'percentage' ? '%' : ''}`,
          to: `${after.taxRate}${after.taxType === 'percentage' ? '%' : ''}`
        });
      }
      if (before.discountRate !== after.discountRate || before.discountType !== after.discountType) {
        changes.push({
          field: 'PO-Level Discount',
          from: `${before.discountRate}${before.discountType === 'percentage' ? '%' : ''}`,
          to: `${after.discountRate}${after.discountType === 'percentage' ? '%' : ''}`
        });
      }
    } else {
      const formatItems = (arr) => arr.map(i => `${i.materialName} (${i.quantity} ${i.uom} @ ${i.unitPrice})`).join(', ');
      const beforeItems = formatItems(before.items);
      const afterItems = formatItems(after.items);
      if (beforeItems !== afterItems) {
        changes.push({ field: 'Items', from: before.items, to: after.items, type: 'items' });
      }
    }
    // Compare source PRs
    const beforePRs = before.sourceRequests.sort().join(',');
    const afterPRs = after.sourceRequests.sort().join(',');
    if (beforePRs !== afterPRs) {
      changes.push({ field: 'Source PRs', from: `${before.sourceRequests.length} PR(s)`, to: `${after.sourceRequests.length} PR(s)` });
    }
    // Compare payment terms
    const ptLabels = { full_advance: 'Full Advance', partial_advance: 'Partial Advance', full_after_completion: 'Full After Completion' };
    if (before.paymentTermsType !== after.paymentTermsType) {
      changes.push({ field: 'Payment Terms', from: ptLabels[before.paymentTermsType] || before.paymentTermsType, to: ptLabels[after.paymentTermsType] || after.paymentTermsType });
    }
    if (before.advancePercentage !== after.advancePercentage) {
      changes.push({ field: 'Advance %', from: `${before.advancePercentage}%`, to: `${after.advancePercentage}%` });
    }
    if (before.paymentTermsNotes !== after.paymentTermsNotes) {
      changes.push({ field: 'Payment Notes', from: before.paymentTermsNotes || '(none)', to: after.paymentTermsNotes || '(none)' });
    }
    // Compare annexure
    if (before.annexure !== after.annexure) {
      changes.push({ field: 'Annexure', from: before.annexure ? 'Updated' : '(none)', to: after.annexure ? 'Updated' : '(removed)' });
    }

    const details = changes.length > 0 ? { changes } : null;
    addAudit(order, 'edited', req.user.userId, 'Purchase order updated', details);
    await order.save();

    res.json(order);
  } catch (error) {
    console.error('Error updating purchase order:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =========================================
// PATCH /:id/submit - Submit for approval
// =========================================
router.patch('/:id/submit', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasRole(roles, 'procurement_engineer') && !hasRole(roles, 'admin')) {
      return res.status(403).json({ message: 'Only Procurement Engineers can submit POs for approval' });
    }

    const order = await PurchaseOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Purchase order not found' });

    if (!['draft', 'rejected'].includes(order.status)) {
      return res.status(400).json({ message: 'Only draft or rejected POs can be submitted' });
    }

    const isServicePO = ['manpower', 'subcontracting', 'machine_rental'].includes(order.poType);
    const isOtherPO = order.poType === 'other';
    if (isServicePO) {
      if (!order.serviceItems || order.serviceItems.length === 0) {
        return res.status(400).json({ message: 'PO must have at least one service item' });
      }
    } else if (isOtherPO) {
      if (!order.otherItems || order.otherItems.length === 0) {
        return res.status(400).json({ message: 'PO must have at least one item' });
      }
    } else {
      if (order.items.length === 0) {
        return res.status(400).json({ message: 'PO must have at least one item' });
      }
    }

    // Clear previous rejections/approvals when re-submitting
    order.approvals = {
      accountManager: { userId: null, approvedAt: null, notes: null },
      generalManager: { userId: null, approvedAt: null, notes: null }
    };
    order.status = 'pending_am';
    addAudit(order, 'submitted_for_approval', req.user.userId, req.body?.notes || 'Submitted for Account Manager approval');

    await order.save();
    res.json(order);
  } catch (error) {
    console.error('Error submitting PO:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =========================================
// PATCH /:id/approve/am - Account Manager approval
// =========================================
router.patch('/:id/approve/am', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasRole(roles, 'account_manager') && !hasRole(roles, 'admin')) {
      return res.status(403).json({ message: 'Only Account Managers can perform this approval' });
    }

    const order = await PurchaseOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Purchase order not found' });

    if (order.status !== 'pending_am') {
      return res.status(400).json({ message: 'This PO is not pending Account Manager approval' });
    }

    // Finance has the final say on the expense ledger (Account Head). The AM may
    // override the auto-selected head before approving:
    //   - 'other' POs   -> req.body.otherItemAccountHeads: [code, code, ...] aligned to otherItems by index
    //   - standard POs   -> req.body.overallAccountHead: code (applies to the whole PO)
    // Empty string clears a value. Only codes the AM actually CHANGED are
    // validated against active accounts - re-submitting an unchanged head (e.g.
    // an auto-filled default the AM didn't touch) must never block approval.
    const { overallAccountHead, otherItemAccountHeads } = req.body || {};
    const norm = (s) => (typeof s === 'string' ? s.trim().toUpperCase() : '');
    const changedCodes = [];

    let nextOverall;
    if (typeof overallAccountHead === 'string') {
      nextOverall = norm(overallAccountHead);
      if (nextOverall && nextOverall !== norm(order.accountingDetails?.overallAccountHead)) {
        changedCodes.push(nextOverall);
      }
    }

    let nextOtherHeads = null;
    if (Array.isArray(otherItemAccountHeads) && Array.isArray(order.otherItems)) {
      nextOtherHeads = otherItemAccountHeads;
      otherItemAccountHeads.forEach((code, idx) => {
        if (!order.otherItems[idx]) return;
        const nc = norm(code);
        if (nc && nc !== norm(order.otherItems[idx].accountHead)) changedCodes.push(nc);
      });
    }

    if (changedCodes.length > 0) {
      const unique = [...new Set(changedCodes)];
      const found = await ChartOfAccounts.find({ code: { $in: unique }, isActive: true }).select('code').lean();
      const valid = new Set(found.map(d => d.code));
      const missing = unique.filter(c => !valid.has(c));
      if (missing.length > 0) {
        return res.status(400).json({ message: `Unknown or inactive account code(s): ${missing.join(', ')}` });
      }
    }

    if (nextOverall !== undefined) {
      if (!order.accountingDetails) order.accountingDetails = {};
      order.accountingDetails.overallAccountHead = nextOverall;
    }
    if (nextOtherHeads) {
      nextOtherHeads.forEach((code, idx) => {
        if (order.otherItems[idx]) order.otherItems[idx].accountHead = norm(code);
      });
    }

    order.approvals.accountManager = {
      userId: req.user.userId,
      approvedAt: new Date(),
      notes: req.body?.notes || ''
    };
    order.status = 'pending_gm';
    addAudit(order, 'approved_by_am', req.user.userId, req.body?.notes || 'Approved by Account Manager');

    await order.save();

    const populated = await PurchaseOrder.findById(order._id)
      .populate('approvals.accountManager.userId', 'name email');

    res.json(populated);
  } catch (error) {
    console.error('Error approving PO (AM):', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =========================================
// PATCH /:id/approve/gm - General Manager approval
// =========================================
router.patch('/:id/approve/gm', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasRole(roles, 'manager') && !hasRole(roles, 'admin')) {
      return res.status(403).json({ message: 'Only the General Manager can perform this approval' });
    }

    const order = await PurchaseOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Purchase order not found' });

    if (order.status !== 'pending_gm') {
      return res.status(400).json({ message: 'This PO is not pending General Manager approval' });
    }

    order.approvals.generalManager = {
      userId: req.user.userId,
      approvedAt: new Date(),
      notes: req.body?.notes || ''
    };
    order.status = 'approved';
    addAudit(order, 'approved_by_gm', req.user.userId, req.body?.notes || 'Approved by General Manager');

    await order.save();

    const populated = await PurchaseOrder.findById(order._id)
      .populate('approvals.generalManager.userId', 'name email');

    res.json(populated);
  } catch (error) {
    console.error('Error approving PO (GM):', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =========================================
// PATCH /:id/reject - Reject (AM or GM)
// =========================================
router.patch('/:id/reject', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasRole(roles, 'account_manager') && !hasRole(roles, 'manager') && !hasRole(roles, 'admin')) {
      return res.status(403).json({ message: 'Only Account Manager or General Manager can reject' });
    }

    const order = await PurchaseOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Purchase order not found' });

    if (!['pending_am', 'pending_gm'].includes(order.status)) {
      return res.status(400).json({ message: 'Only pending POs can be rejected' });
    }

    const reason = req.body?.notes || req.body?.reason || '';
    order.status = 'rejected';
    addAudit(order, 'rejected', req.user.userId, reason);

    await order.save();
    res.json(order);
  } catch (error) {
    console.error('Error rejecting PO:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =========================================
// PATCH /:id/revise - Revise rejected PO (PE resets to draft)
// =========================================
router.patch('/:id/revise', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasRole(roles, 'procurement_engineer') && !hasRole(roles, 'admin')) {
      return res.status(403).json({ message: 'Only Procurement Engineers can revise POs' });
    }

    const order = await PurchaseOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Purchase order not found' });

    if (order.status !== 'rejected') {
      return res.status(400).json({ message: 'Only rejected POs can be revised' });
    }

    // Snapshot state before revision
    const snapshot = {
      items: (order.items || []).map(i => ({ materialName: i.materialName, sku: i.sku, quantity: i.quantity, unitPrice: i.unitPrice, uom: i.uom })),
      supplier: order.supplier?.name || '',
      deliveryDate: order.deliveryDate ? new Date(order.deliveryDate).toISOString().split('T')[0] : '',
      notes: order.notes || '',
      priority: order.priority || 'normal',
      vatPercentage: order.vatPercentage || 0,
      status: order.status
    };

    order.revision += 1;
    order.revisionHistory.push({
      revision: order.revision,
      reason: req.body?.reason || 'Revision after rejection',
      revisedBy: req.user.userId,
      revisedAt: new Date()
    });
    order.status = 'draft';
    order.lockedForEditing = false;
    addAudit(order, 'revised', req.user.userId, `Revision ${order.revision}: ${req.body?.reason || ''}`, { snapshot });

    await order.save();
    res.json(order);
  } catch (error) {
    console.error('Error revising PO:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =========================================
// PATCH /:id/send-to-supplier - Lock & send
// =========================================
router.patch('/:id/send-to-supplier', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasRole(roles, 'procurement_engineer') && !hasRole(roles, 'admin')) {
      return res.status(403).json({ message: 'Only Procurement Engineers can send POs to suppliers' });
    }

    const order = await PurchaseOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Purchase order not found' });

    if (order.status !== 'approved') {
      return res.status(400).json({ message: 'Only approved POs can be sent to suppliers' });
    }

    order.status = 'sent_to_supplier';
    order.lockedForEditing = true;
    addAudit(order, 'sent_to_supplier', req.user.userId, 'PO sent to supplier');

    await order.save();
    res.json(order);
  } catch (error) {
    console.error('Error sending PO to supplier:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =========================================
// PATCH /:id/fulfill - PE records supplier delivery
// =========================================
router.patch('/:id/fulfill', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasRole(roles, 'procurement_engineer') && !hasRole(roles, 'admin')) {
      return res.status(403).json({ message: 'Only Procurement Engineers can mark POs as fulfilled' });
    }

    const order = await PurchaseOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Purchase order not found' });

    if (order.status !== 'sent_to_supplier') {
      return res.status(400).json({ message: 'Only sent POs can be fulfilled' });
    }

    const isServicePO = ['manpower', 'subcontracting', 'machine_rental'].includes(order.poType);
    const isOtherPO = order.poType === 'other';
    const { deliveredItems, fulfillmentType } = req.body || {};

    if (isServicePO) {
      // Service PO: no deliveredItems needed, just mark as fulfilled
      order.status = 'fulfilled';
      order.fulfilledBy = req.user.userId;
      order.fulfilledAt = new Date();
      const docTypeLabels = { timesheet: 'Timesheet', work_completion_report: 'Work Completion Report', machine_hire_sheet: 'Machine Hire Sheet' };
      addAudit(order, 'fulfilled', req.user.userId, `Service completed. Required document: ${docTypeLabels[order.completionDocType] || 'Completion Document'}`);
    } else if (isOtherPO) {
      // Other PO: flexible fulfillment - user chooses delivery tracking or direct completion
      const fulfillMode = fulfillmentType || 'completion'; // Default to direct completion

      if (fulfillMode === 'delivery' && deliveredItems) {
        // Track delivery quantities (like material PO)
        const fulfillmentDetails = [];
        for (const item of order.otherItems) {
          const delivered = deliveredItems?.find(d => d.itemIndex === item._id || d.description === item.description);
          fulfillmentDetails.push({
            materialId: item._id, // Use item ID as reference
            orderedQty: item.quantity,
            deliveredQty: delivered ? Number(delivered.deliveredQty) : item.quantity
          });
        }
        order.fulfillmentDetails = fulfillmentDetails;
        order.status = 'fulfilled';
        order.fulfilledBy = req.user.userId;
        order.fulfilledAt = new Date();
        addAudit(order, 'fulfilled', req.user.userId, 'Delivery tracked for other items');
      } else {
        // Direct completion (like service PO)
        order.status = 'fulfilled';
        order.fulfilledBy = req.user.userId;
        order.fulfilledAt = new Date();
        addAudit(order, 'fulfilled', req.user.userId, 'Other PO marked as complete');
      }
    } else {
      // Material PO: existing fulfillment logic
      const fulfillmentDetails = [];

      for (const item of order.items) {
        const delivered = deliveredItems?.find(d => String(d.materialId) === String(item.materialId));
        fulfillmentDetails.push({
          materialId: item.materialId,
          orderedQty: item.quantity,
          deliveredQty: delivered ? Number(delivered.deliveredQty) : item.quantity
        });
      }

      order.status = 'fulfilled';
      order.fulfilledBy = req.user.userId;
      order.fulfilledAt = new Date();
      order.fulfillmentDetails = fulfillmentDetails;
      addAudit(order, 'fulfilled', req.user.userId, 'Supplier delivery recorded');
    }

    await order.save();
    res.json(order);
  } catch (error) {
    console.error('Error fulfilling PO:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =========================================
// PATCH /:id/receive - GRN (Inventory Manager)
// =========================================
router.patch('/:id/receive', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasRole(roles, 'inventory_manager') && !hasRole(roles, 'admin') && !hasRole(roles, 'manager')) {
      return res.status(403).json({ message: 'Only Inventory Managers can submit GRN' });
    }

    const order = await PurchaseOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Purchase order not found' });

    // GRN is not applicable for service POs
    if (['manpower', 'subcontracting', 'machine_rental'].includes(order.poType)) {
      return res.status(400).json({ message: 'GRN is not applicable for service POs' });
    }

    if (order.status !== 'fulfilled') {
      return res.status(400).json({ message: 'Only fulfilled POs can receive GRN' });
    }

    const {
      receivedItems, notes,
      deliveryDate, deliveryPersonName, deliveryPersonContact,
      vehicleNumber, overallCondition, conditionNotes,
      receiverName, acknowledgmentNotes
    } = req.body || {};

    const receivedItemsData = [];

    for (const fulfillItem of order.fulfillmentDetails) {
      const materialId = fulfillItem.materialId;
      const received = receivedItems?.find(r => String(r.materialId) === String(materialId));
      const receivedQty = received ? Number(received.receivedQty) : fulfillItem.deliveredQty;
      const condition = received?.condition || 'good';
      const remarks = received?.remarks || '';

      // Update material inventory
      if (receivedQty > 0) {
        const material = await Material.findById(materialId);
        if (material) {
          material.quantity = (material.quantity || 0) + receivedQty;
          await material.save();
        }
      }

      receivedItemsData.push({
        materialId,
        orderedQty: fulfillItem.orderedQty,
        receivedQty,
        condition,
        remarks
      });
    }

    // Generate GRN number
    const grnCount = await PurchaseOrder.countDocuments({ grnNumber: { $exists: true, $ne: null } });
    const grnNumber = `GRN-PO-${String(grnCount + 1).padStart(5, '0')}`;

    order.status = 'received';
    order.receivedBy = req.user.userId;
    order.receivedAt = new Date();
    order.receivedItems = receivedItemsData;
    order.grnNumber = grnNumber;
    order.grnNotes = notes || '';
    order.grnDeliveryDate = deliveryDate ? new Date(deliveryDate) : new Date();
    order.grnDeliveryPersonName = deliveryPersonName || '';
    order.grnDeliveryPersonContact = deliveryPersonContact || '';
    order.grnVehicleNumber = vehicleNumber || '';
    order.grnOverallCondition = overallCondition || 'good';
    order.grnConditionNotes = conditionNotes || '';
    order.grnReceiverName = receiverName || '';
    order.grnAcknowledgmentNotes = acknowledgmentNotes || '';

    addAudit(order, 'received', req.user.userId, `GRN ${grnNumber} submitted`);

    // Save PO first so it's queryable for PR fulfillment check
    await order.save();

    // Auto-fulfill PR: check if ALL items in each source PR are fully received via POs
    for (const src of order.sourceRequests) {
      try {
        const pr = await PurchaseRequest.findById(src.requestId);
        if (pr && pr.status === 'approved') {
          // Find all POs that reference this PR and are received/confirmed (including current one)
          const receivedPOs = await PurchaseOrder.find({
            'sourceRequests.requestId': src.requestId,
            status: { $in: ['received', 'confirmed'] }
          });

          let allReceived = true;
          for (const prItem of pr.items) {
            let totalReceived = 0;
            for (const po of receivedPOs) {
              for (const poSrc of po.sourceRequests) {
                if (String(poSrc.requestId) === String(src.requestId)) {
                  for (const poSrcItem of poSrc.items) {
                    if (String(poSrcItem.requestItemId) === String(prItem._id)) {
                      totalReceived += (poSrcItem.allocatedQty || 0);
                    }
                  }
                }
              }
            }
            if (totalReceived < prItem.quantity) {
              allReceived = false;
              break;
            }
          }

          if (allReceived) {
            pr.status = 'fulfilled';
            await pr.save();
            console.log(`PR ${pr.requestNumber} auto-fulfilled - all items received via POs`);
          }
        }
      } catch (err) {
        console.error('Error auto-updating PR status:', err);
      }
    }

    const populated = await PurchaseOrder.findById(order._id)
      .populate('createdBy', 'name email')
      .populate('receivedBy', 'name email');

    res.json(populated);
  } catch (error) {
    console.error('Error receiving PO:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =========================================
// PATCH /:id/confirm - PE confirmation after GRN
// =========================================
router.patch('/:id/confirm', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasRole(roles, 'procurement_engineer') && !hasRole(roles, 'admin')) {
      return res.status(403).json({ message: 'Only Procurement Engineers can confirm POs' });
    }

    const order = await PurchaseOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Purchase order not found' });

    if (order.status !== 'received') {
      return res.status(400).json({ message: 'Only received POs can be confirmed' });
    }

    order.status = 'confirmed';
    order.confirmedBy = req.user.userId;
    order.confirmedAt = new Date();
    addAudit(order, 'confirmed', req.user.userId, 'PO confirmed after GRN review');

    await order.save();
    res.json(order);
  } catch (error) {
    console.error('Error confirming PO:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =========================================
// PATCH /:id/cancel
// =========================================
router.patch('/:id/cancel', auth, async (req, res) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Purchase order not found' });

    const roles = req.user.roles || [];
    const isAdmin = hasRole(roles, 'admin');
    const isCreator = String(order.createdBy) === String(req.user.userId);

    if (!isAdmin && !isCreator) {
      return res.status(403).json({ message: 'Only the creator or admin can cancel this PO' });
    }

    if (!['draft', 'rejected', 'pending_am', 'pending_gm'].includes(order.status)) {
      return res.status(400).json({ message: 'Cannot cancel PO in current status' });
    }

    order.status = 'cancelled';
    addAudit(order, 'cancelled', req.user.userId, req.body?.reason || 'PO cancelled');

    await order.save();
    res.json(order);
  } catch (error) {
    console.error('Error cancelling PO:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =========================================
// PATCH /:id/request-revision - Unlock sent PO
// =========================================
router.patch('/:id/request-revision', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasRole(roles, 'account_manager') && !hasRole(roles, 'manager') && !hasRole(roles, 'admin')) {
      return res.status(403).json({ message: 'Only Account Manager or General Manager can request revisions' });
    }

    const order = await PurchaseOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Purchase order not found' });

    if (order.status !== 'sent_to_supplier') {
      return res.status(400).json({ message: 'Only sent POs can be revised' });
    }

    order.revision += 1;
    order.revisionHistory.push({
      revision: order.revision,
      reason: req.body?.reason || 'Revision requested',
      revisedBy: req.user.userId,
      revisedAt: new Date()
    });
    order.status = 'draft';
    order.lockedForEditing = false;
    addAudit(order, 'revision_requested', req.user.userId, `Revision ${order.revision}: ${req.body?.reason || ''}`);

    await order.save();
    res.json(order);
  } catch (error) {
    console.error('Error requesting revision:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =========================================
// POST /:id/attachments - Upload attachments to PO
// =========================================
router.post('/:id/attachments', auth, upload.array('attachments', 10), async (req, res) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id);
    if (!order) {
      // Clean up temp files if PO not found
      if (req.files) {
        req.files.forEach(file => {
          const filePath = path.join(uploadsDir, file.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
      }
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    // Anyone can upload attachments (no status restriction)
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files provided' });
    }

    // Process new attachments
    const newAttachments = req.files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      path: `/uploads/purchase-orders/${file.filename}`,
      mimetype: file.mimetype,
      size: file.size,
      uploadedBy: req.user.userId
    }));

    order.attachments = [...(order.attachments || []), ...newAttachments];

    // Record changes in edits array
    order.edits.push({
      editedBy: req.user.userId,
      changes: [{
        field: 'attachments',
        from: order.attachments.length - newAttachments.length,
        to: order.attachments.length
      }]
    });

    addAudit(order, 'attachments_added', req.user.userId, `Added ${newAttachments.length} attachment(s)`);

    await order.save();
    await order.populate('edits.editedBy', 'name email');
    await order.populate('auditTrail.performedBy', 'name email');

    res.json({
      message: 'Attachments uploaded successfully',
      attachments: order.attachments,
      edits: order.edits
    });
  } catch (error) {
    console.error('Error uploading attachments:', error);
    // Clean up temp files on error
    if (req.files) {
      req.files.forEach(file => {
        const filePath = path.join(uploadsDir, file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// =========================================
// DELETE /:id/attachments/:attachmentIndex - Remove attachment from PO
// =========================================
router.delete('/:id/attachments/:attachmentIndex', auth, async (req, res) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Purchase order not found' });

    const attachmentIndex = parseInt(req.params.attachmentIndex, 10);
    if (isNaN(attachmentIndex) || attachmentIndex < 0 || attachmentIndex >= order.attachments.length) {
      return res.status(400).json({ message: 'Invalid attachment index' });
    }

    const attachmentToDelete = order.attachments[attachmentIndex];

    // Delete file from disk
    if (attachmentToDelete && attachmentToDelete.filename) {
      const filePath = path.join(uploadsDir, attachmentToDelete.filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.error(`Error deleting file ${filePath}:`, err);
        }
      }
    }

    // Remove from attachments array
    order.attachments.splice(attachmentIndex, 1);

    // Record changes in edits array
    order.edits.push({
      editedBy: req.user.userId,
      changes: [{
        field: 'attachments',
        from: order.attachments.length + 1,
        to: order.attachments.length
      }]
    });

    addAudit(order, 'attachment_removed', req.user.userId, `Removed attachment: ${attachmentToDelete.originalName}`);

    await order.save();
    await order.populate('edits.editedBy', 'name email');
    await order.populate('auditTrail.performedBy', 'name email');

    res.json({
      message: 'Attachment removed successfully',
      attachments: order.attachments,
      edits: order.edits
    });
  } catch (error) {
    console.error('Error removing attachment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =========================================
// PATCH /:id/request-payment - PE sends payment request to accounts
// =========================================
router.patch('/:id/request-payment', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasRole(roles, 'procurement_engineer') && !hasRole(roles, 'admin')) {
      return res.status(403).json({ message: 'Only Procurement Engineers can request payment' });
    }

    const order = await PurchaseOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Purchase order not found' });

    const isServicePO = ['manpower', 'subcontracting', 'machine_rental'].includes(order.poType);
    const { amount, paymentType, notes } = req.body;

    if (!paymentType) {
      return res.status(400).json({ message: 'Payment type is required' });
    }

    // Validate allowed statuses based on payment type
    if (paymentType === 'advance') {
      if (!['approved', 'sent_to_supplier'].includes(order.status)) {
        return res.status(400).json({ message: 'Advance payment can only be requested for approved or sent POs' });
      }
    } else {
      // final or full payment
      const allowedStatuses = isServicePO ? ['fulfilled'] : ['confirmed'];
      if (!allowedStatuses.includes(order.status)) {
        return res.status(400).json({
          message: isServicePO
            ? 'Final payment can only be requested after service completion'
            : 'Final payment can only be requested after PO confirmation'
        });
      }
    }

    // Push payment request to array
    order.paymentRequests.push({
      requestedBy: req.user.userId,
      requestedAt: new Date(),
      amount: amount || 0,
      paymentType,
      notes: notes || ''
    });

    // Only change PO status for final/full payment
    if (paymentType !== 'advance') {
      order.status = 'payment_requested';
    }

    addAudit(order, 'payment_requested', req.user.userId, `${paymentType} payment request submitted — Amount: ${amount || 0}`);
    await order.save();

    const populated = await PurchaseOrder.findById(order._id)
      .populate('paymentRequests.requestedBy', 'name email');

    res.json(populated);
  } catch (error) {
    console.error('Error requesting payment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =========================================
// PATCH /:id/process-payment/:paymentId - Accounts processes payment
// =========================================
router.patch('/:id/process-payment/:paymentId', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasRole(roles, 'account_manager') && !hasRole(roles, 'admin')) {
      return res.status(403).json({ message: 'Only Account Managers can process payments' });
    }

    const order = await PurchaseOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Purchase order not found' });

    const paymentRequest = order.paymentRequests.id(req.params.paymentId);
    if (!paymentRequest) {
      return res.status(404).json({ message: 'Payment request not found' });
    }

    if (paymentRequest.status === 'processed') {
      return res.status(400).json({ message: 'Payment already processed' });
    }

    paymentRequest.status = 'processed';
    paymentRequest.processedBy = req.user.userId;
    paymentRequest.processedAt = new Date();
    paymentRequest.processNotes = req.body?.notes || '';

    // If this was a final/full payment, change PO status to payment_completed
    if (paymentRequest.paymentType !== 'advance' && order.status === 'payment_requested') {
      order.status = 'payment_completed';
    }

    addAudit(order, 'payment_processed', req.user.userId, `${paymentRequest.paymentType} payment processed — Amount: ${paymentRequest.amount}`);
    await order.save();

    const populated = await PurchaseOrder.findById(order._id)
      .populate('paymentRequests.requestedBy', 'name email')
      .populate('paymentRequests.processedBy', 'name email');

    res.json(populated);
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =========================================
// POST /:id/completion-attachments - Upload service completion docs
// =========================================
router.post('/:id/completion-attachments', auth, upload.array('completionAttachments', 10), async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasRole(roles, 'procurement_engineer') && !hasRole(roles, 'admin')) {
      return res.status(403).json({ message: 'Only Procurement Engineers can upload completion documents' });
    }

    const order = await PurchaseOrder.findById(req.params.id);
    if (!order) {
      if (req.files) {
        req.files.forEach(file => {
          const filePath = path.join(uploadsDir, file.filename);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        });
      }
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    if (!['manpower', 'subcontracting', 'machine_rental'].includes(order.poType)) {
      if (req.files) {
        req.files.forEach(file => {
          const filePath = path.join(uploadsDir, file.filename);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        });
      }
      return res.status(400).json({ message: 'Completion documents are only for service POs' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files provided' });
    }

    const newAttachments = req.files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      path: `/uploads/purchase-orders/${file.filename}`,
      mimetype: file.mimetype,
      size: file.size,
      uploadedBy: req.user.userId
    }));

    order.completionAttachments = [...(order.completionAttachments || []), ...newAttachments];

    const docTypeLabels = { timesheet: 'Timesheet', work_completion_report: 'Work Completion Report', machine_hire_sheet: 'Machine Hire Sheet' };
    addAudit(order, 'completion_doc_uploaded', req.user.userId, `${docTypeLabels[order.completionDocType] || 'Completion document'} uploaded (${newAttachments.length} file(s))`);

    await order.save();
    res.json({
      message: 'Completion documents uploaded successfully',
      completionAttachments: order.completionAttachments
    });
  } catch (error) {
    console.error('Error uploading completion documents:', error);
    if (req.files) {
      req.files.forEach(file => {
        const filePath = path.join(uploadsDir, file.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// =========================================
// DELETE /:id/completion-attachments/:attachmentIndex - Remove completion doc
// =========================================
router.delete('/:id/completion-attachments/:attachmentIndex', auth, async (req, res) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Purchase order not found' });

    const attachmentIndex = parseInt(req.params.attachmentIndex, 10);
    if (isNaN(attachmentIndex) || attachmentIndex < 0 || attachmentIndex >= (order.completionAttachments || []).length) {
      return res.status(400).json({ message: 'Invalid attachment index' });
    }

    const attachmentToDelete = order.completionAttachments[attachmentIndex];

    if (attachmentToDelete && attachmentToDelete.filename) {
      const filePath = path.join(uploadsDir, attachmentToDelete.filename);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (err) { console.error(`Error deleting file:`, err); }
      }
    }

    order.completionAttachments.splice(attachmentIndex, 1);
    addAudit(order, 'completion_doc_removed', req.user.userId, `Removed completion document: ${attachmentToDelete.originalName}`);

    await order.save();
    res.json({
      message: 'Completion document removed successfully',
      completionAttachments: order.completionAttachments
    });
  } catch (error) {
    console.error('Error removing completion document:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
