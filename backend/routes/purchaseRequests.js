const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const PurchaseRequest = require('../models/PurchaseRequest');
const PurchaseOrder = require('../models/PurchaseOrder');
const User = require('../models/User');
const Supplier = require('../models/Supplier');

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

// GET all purchase requests
router.get('/', auth, async (req, res) => {
  try {
    const { status, projectId, page = 1, limit = 50 } = req.query;
    const filter = {};
    
    if (status) filter.status = status;
    if (projectId) filter.projectId = projectId;
    
    // Role-based filtering
    const roles = req.user.roles || [];
    const isAdmin = roles.includes('admin');
    const isManager = roles.includes('manager');
    const isIM = roles.includes('inventory_manager');
    const isPE = roles.includes('procurement_engineer');
    
    // IM sees their own requests, PE sees all requests (to process), Admin/Manager see all
    if (!isAdmin && !isManager && !isPE) {
      if (isIM) {
        filter.createdBy = req.user.userId;
      } else {
        return res.status(403).json({ message: 'Access denied' });
      }
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [requests, total] = await Promise.all([
      PurchaseRequest.find(filter)
        .populate('projectId', 'name')
        .populate('createdBy', 'name email')
        .populate('assignedTo', 'name email')
        .populate('supplierId', 'name trn contactPerson phone email address')
        .populate('items.materialId', 'name sku')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      PurchaseRequest.countDocuments(filter)
    ]);
    
    res.json({ requests, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error('Error fetching purchase requests:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET single purchase request
router.get('/:id', auth, async (req, res) => {
  try {
    const request = await PurchaseRequest.findById(req.params.id)
      .populate('projectId', 'name locationDetails')
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('reviewedBy', 'name email')
      .populate('fulfilledBy', 'name email')
      .populate('supplierId', 'name trn contactPerson phone email address')
      .populate('items.materialId', 'name sku quantity uom');
    
    if (!request) {
      return res.status(404).json({ message: 'Purchase request not found' });
    }
    
    res.json(request);
  } catch (error) {
    console.error('Error fetching purchase request:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET linked purchase orders for a PR
router.get('/:id/linked-pos', auth, async (req, res) => {
  try {
    const linkedPOs = await PurchaseOrder.find({
      'sourceRequests.requestId': req.params.id,
      status: { $nin: ['cancelled'] }
    })
      .select('poNumber status supplier.name sourceRequests items deliveryDate grnNumber receivedItems createdAt')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    // Flatten: for each PO, include only the items allocated from this PR
    const result = linkedPOs.map(po => {
      const src = po.sourceRequests.find(s => String(s.requestId) === String(req.params.id));
      return {
        _id: po._id,
        poNumber: po.poNumber,
        status: po.status,
        supplierName: po.supplier?.name || '-',
        deliveryDate: po.deliveryDate,
        grnNumber: po.grnNumber || null,
        createdBy: po.createdBy?.name || '-',
        createdAt: po.createdAt,
        allocatedItems: (src?.items || []).map(si => ({
          requestItemId: si.requestItemId,
          materialId: si.materialId,
          materialName: si.materialName,
          allocatedQty: si.allocatedQty
        })),
        receivedItems: (po.receivedItems || []).map(ri => ({
          materialId: ri.materialId,
          receivedQty: ri.receivedQty,
          condition: ri.condition,
          remarks: ri.remarks
        }))
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching linked POs:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create purchase request (Inventory Manager only)
router.post('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    const isAdmin = roles.includes('admin');
    const isManager = roles.includes('manager');
    const isIM = roles.includes('inventory_manager');
    
    if (!isAdmin && !isManager && !isIM) {
      return res.status(403).json({ message: 'Only Inventory Managers can create purchase requests' });
    }
    
    const { projectId, supplierId, supplier, items, deliveryDate, notes, priority } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'At least one item is required' });
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

    // Find a procurement engineer to assign
    let assignedTo = null;
    try {
      const procurementEngineer = await User.findOne({
        roles: 'procurement_engineer',
        status: { $ne: 'inactive' }
      });
      if (procurementEngineer) {
        assignedTo = procurementEngineer._id;
      }
    } catch (err) {
      console.log('No procurement engineer found, request will be unassigned');
    }

    const request = new PurchaseRequest({
      projectId: projectId || null,
      supplierId: resolvedSupplierId,
      supplier: supplierData,
      items,
      deliveryDate,
      notes,
      priority: priority || 'normal',
      status: 'pending',
      createdBy: req.user.userId,
      assignedTo
    });
    
    await request.save();
    
    const populated = await PurchaseRequest.findById(request._id)
      .populate('projectId', 'name')
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email');
    
    res.status(201).json(populated);
  } catch (error) {
    console.error('Error creating purchase request:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH approve purchase request (Procurement Engineer)
router.patch('/:id/approve', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    const isAdmin = roles.includes('admin');
    const isManager = roles.includes('manager');
    const isPE = roles.includes('procurement_engineer');
    
    if (!isAdmin && !isManager && !isPE) {
      return res.status(403).json({ message: 'Only Procurement Engineers can approve requests' });
    }
    
    const request = await PurchaseRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Purchase request not found' });
    }
    
    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending requests can be approved' });
    }
    
    request.status = 'approved';
    request.reviewedBy = req.user.userId;
    request.reviewedAt = new Date();
    request.reviewNotes = req.body?.notes || '';
    
    await request.save();
    
    const populated = await PurchaseRequest.findById(request._id)
      .populate('projectId', 'name')
      .populate('createdBy', 'name email')
      .populate('reviewedBy', 'name email');
    
    res.json(populated);
  } catch (error) {
    console.error('Error approving purchase request:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH reject purchase request (Procurement Engineer)
router.patch('/:id/reject', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    const isAdmin = roles.includes('admin');
    const isManager = roles.includes('manager');
    const isPE = roles.includes('procurement_engineer');
    
    if (!isAdmin && !isManager && !isPE) {
      return res.status(403).json({ message: 'Only Procurement Engineers can reject requests' });
    }
    
    const request = await PurchaseRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Purchase request not found' });
    }
    
    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending requests can be rejected' });
    }
    
    request.status = 'rejected';
    request.reviewedBy = req.user.userId;
    request.reviewedAt = new Date();
    request.reviewNotes = req.body.notes || req.body.reason || '';
    
    await request.save();
    
    res.json(request);
  } catch (error) {
    console.error('Error rejecting purchase request:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH cancel purchase request (Creator only, if pending)
router.patch('/:id/cancel', auth, async (req, res) => {
  try {
    const request = await PurchaseRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Purchase request not found' });
    }
    
    const roles = req.user.roles || [];
    const isAdmin = roles.includes('admin');
    const isCreator = String(request.createdBy) === String(req.user.userId);
    
    if (!isAdmin && !isCreator) {
      return res.status(403).json({ message: 'Only the creator can cancel this request' });
    }
    
    if (!['pending', 'draft'].includes(request.status)) {
      return res.status(400).json({ message: 'Only pending or draft requests can be cancelled' });
    }
    
    request.status = 'cancelled';
    await request.save();
    
    res.json(request);
  } catch (error) {
    console.error('Error cancelling purchase request:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
