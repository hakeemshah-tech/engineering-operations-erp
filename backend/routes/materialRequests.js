const express = require('express');
const jwt = require('jsonwebtoken');
const MaterialRequest = require('../models/MaterialRequest');
const Project = require('../models/Project');
const Material = require('../models/Material');
const User = require('../models/User');
const router = express.Router();

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

// Role checks
const canAccessMaterialRequests = (roles) => {
  return roles.some(r => ['admin', 'manager', 'inventory_manager', 'project_engineer'].includes(r));
};

const canCreateMaterialRequest = (roles) => {
  return roles.some(r => ['admin', 'manager', 'project_engineer'].includes(r));
};

const canReviewMaterialRequest = (roles) => {
  return roles.some(r => ['admin', 'manager', 'inventory_manager'].includes(r));
};

// Get all material requests (with filters)
router.get('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    
    if (!canAccessMaterialRequests(roles)) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    let query = {};

    // Filter by project
    if (req.query.projectId) {
      query.projectId = req.query.projectId;
    }

    // Filter by status
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Filter by priority
    if (req.query.priority) {
      query.priority = req.query.priority;
    }

    // Filter by requestType
    if (req.query.requestType) {
      query.requestType = req.query.requestType;
    }

    // Project engineers can only see requests for projects they're involved in
    // If querying by projectId, show all requests for that project (needed for return flow)
    // Otherwise, only show their own requests
    if (roles.includes('project_engineer') && !roles.some(r => ['admin', 'manager', 'inventory_manager'].includes(r))) {
      if (!req.query.projectId) {
        // If not filtering by project, only show their own requests
        query.requestedBy = req.user.userId;
      }
      // If filtering by projectId, show all requests for that project
      // This allows Project Engineers to see return requests created by Inventory Manager
    }

    // Search
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query.$or = [
        { requestNumber: searchRegex },
        { requesterName: searchRegex },
        { purpose: searchRegex }
      ];
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [requests, total] = await Promise.all([
      MaterialRequest.find(query)
        .populate('projectId', 'name')
        .populate('requestedBy', 'name email')
        .populate('reviewedBy', 'name email')
        .populate('items.materialId', 'name sku')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      MaterialRequest.countDocuments(query)
    ]);

    res.json({
      requests,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching material requests:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get material requests for a project
router.get('/project/:projectId', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    
    if (!canAccessMaterialRequests(roles)) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const requests = await MaterialRequest.find({ projectId: req.params.projectId })
      .populate('requestedBy', 'name email')
      .populate('reviewedBy', 'name email')
      .populate('items.materialId', 'name sku')
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    console.error('Error fetching project material requests:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single material request
router.get('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    
    if (!canAccessMaterialRequests(roles)) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const request = await MaterialRequest.findById(req.params.id)
      .populate('projectId', 'name locationDetails')
      .populate('requestedBy', 'name email')
      .populate('reviewedBy', 'name email')
      .populate('fulfilledBy', 'name email')
      .populate('receivedBy', 'name email')
      .populate('items.materialId', 'name sku uom');

    if (!request) {
      return res.status(404).json({ message: 'Material request not found' });
    }

    res.json(request);
  } catch (error) {
    console.error('Error fetching material request:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create material request
router.post('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    
    const { projectId, items, priority, requiredDate, purpose, notes, requesterPhone, requestType } = req.body;
    
    // Role-based validation for request type
    // Role-based validation for request type
    const isReturnRequest = requestType === 'return';
    const isRemainingReturn = requestType === 'remaining_return';
    
    if (isReturnRequest) {
      // Only inventory_manager, admin, manager can create standard return requests (Inventory -> Project)
      if (!roles.some(r => ['admin', 'manager', 'inventory_manager'].includes(r))) {
        return res.status(403).json({ message: 'Only inventory managers can create material return requests.' });
      }
    } else if (isRemainingReturn) {
      // Only project_engineer, admin, manager can create remaining return requests (Project -> Inventory)
      if (!roles.some(r => ['admin', 'manager', 'project_engineer'].includes(r))) {
        return res.status(403).json({ message: 'Only project engineers can create remaining material return requests.' });
      }
    } else {
      // Regular material request - project engineers, managers, admins
      if (!canCreateMaterialRequest(roles)) {
        return res.status(403).json({ message: 'Only project engineers, managers, and admins can create material requests.' });
      }
    }

    if (!projectId || !items || items.length === 0) {
      return res.status(400).json({ message: 'Project and at least one item are required.' });
    }

    // Verify project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found.' });
    }

    // Get requester info
    const requester = await User.findById(req.user.userId);
    
    const request = await MaterialRequest.create({
      projectId,
      items,
      priority: priority || 'normal',
      requiredDate,
      purpose,
      notes,
      requestType: requestType || 'request',
      requestedBy: req.user.userId,
      requesterName: requester?.name || '',
      requesterEmail: requester?.email || '',
      requesterPhone: requesterPhone || ''
    });

    await request.populate('projectId', 'name');
    await request.populate('requestedBy', 'name email');

    res.status(201).json(request);
  } catch (error) {
    console.error('Error creating material request:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update material request (before approval)
router.put('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    
    const request = await MaterialRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Material request not found' });
    }

    // Only requester or admin/manager can update pending requests
    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending requests can be updated.' });
    }

    if (request.requestedBy.toString() !== req.user.userId && !roles.some(r => ['admin', 'manager'].includes(r))) {
      return res.status(403).json({ message: 'You can only edit your own requests.' });
    }

    const { items, priority, requiredDate, purpose, notes, requesterPhone } = req.body;

    if (items) request.items = items;
    if (priority) request.priority = priority;
    if (requiredDate !== undefined) request.requiredDate = requiredDate;
    if (purpose !== undefined) request.purpose = purpose;
    if (notes !== undefined) request.notes = notes;
    if (requesterPhone !== undefined) request.requesterPhone = requesterPhone;

    await request.save();
    await request.populate('projectId', 'name');
    await request.populate('requestedBy', 'name email');

    res.json(request);
  } catch (error) {
    console.error('Error updating material request:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Review material request (approve/reject)
router.patch('/:id/review', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];

    const request = await MaterialRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Material request not found' });
    }

    // Role check based on request type
    // Role check based on request type
    const isReturnRequest = request.requestType === 'return';
    const isRemainingReturn = request.requestType === 'remaining_return';
    
    if (isReturnRequest) {
      // Return requests can be reviewed by Project Engineers (requester of original project), admin, manager
      const isProjectEngineer = roles.includes('project_engineer');
      const isAdminOrManager = roles.some(r => ['admin', 'manager'].includes(r));
      if (!isProjectEngineer && !isAdminOrManager) {
        return res.status(403).json({ message: 'Only project engineers can review return requests.' });
      }
    } else if (isRemainingReturn) {
      // Remaining return requests are reviewed by Inventory Manager
      const isInventoryManager = roles.includes('inventory_manager');
      const isAdminOrManager = roles.some(r => ['admin', 'manager'].includes(r));
      if (!isInventoryManager && !isAdminOrManager) {
        return res.status(403).json({ message: 'Only inventory managers can review remaining return requests.' });
      }
    } else {
      // Regular requests reviewed by inventory managers
      if (!canReviewMaterialRequest(roles)) {
        return res.status(403).json({ message: 'Only inventory managers, managers, and admins can review requests.' });
      }
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending requests can be reviewed.' });
    }

    const { status, reviewNotes } = req.body;

    if (!['approved', 'partially_approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid review status.' });
    }

    request.status = status;
    request.reviewedBy = req.user.userId;
    request.reviewedAt = new Date();
    request.reviewNotes = reviewNotes || '';

    await request.save();
    await request.populate('projectId', 'name');
    await request.populate('requestedBy', 'name email');
    await request.populate('reviewedBy', 'name email');

    res.json(request);
  } catch (error) {
    console.error('Error reviewing material request:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark as fulfilled with assigned quantities
router.patch('/:id/fulfill', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];

    const request = await MaterialRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Material request not found' });
    }

    // Role-based validation based on request type
    // Role-based validation based on request type
    // For return requests: Project Engineer fulfills
    // For remaining returns: Inventory Manager fulfills
    // For regular requests: Inventory Manager fulfills
    const isReturnRequest = request.requestType === 'return';
    const isRemainingReturn = request.requestType === 'remaining_return';
    
    const canFulfillRegular = roles.some(r => ['admin', 'manager', 'inventory_manager', 'store_keeper'].includes(r));
    const canFulfillReturn = roles.some(r => ['admin', 'manager', 'project_engineer'].includes(r));
    
    if (isReturnRequest && !canFulfillReturn) {
      return res.status(403).json({ message: 'Only Project Engineers can fulfill return requests.' });
    }
    if ((isRemainingReturn || !isReturnRequest) && !canFulfillRegular) {
      return res.status(403).json({ message: 'Only inventory staff can mark requests as fulfilled.' });
    }
    if (!isReturnRequest && !canFulfillRegular) {
      return res.status(403).json({ message: 'Only inventory staff can mark requests as fulfilled.' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending requests can be fulfilled.' });
    }

    const { assignedItems, fulfillmentNotes } = req.body;

    // Process assigned quantities and update inventory
    if (assignedItems && Array.isArray(assignedItems)) {
      for (const assigned of assignedItems) {
        // Find the item in the request
        const itemIndex = request.items.findIndex(item => 
          item._id.toString() === assigned.itemId || 
          (item.materialId && item.materialId.toString() === assigned.materialId)
        );
        
        if (itemIndex !== -1 && assigned.assignedQuantity > 0) {
          // Validate: assigned quantity must be <= requested quantity
          if (assigned.assignedQuantity > request.items[itemIndex].quantity) {
            return res.status(400).json({ 
              message: `Assigned quantity (${assigned.assignedQuantity}) exceeds requested quantity (${request.items[itemIndex].quantity}) for ${request.items[itemIndex].materialName}.` 
            });
          }
          // Update assigned quantity on the request item
          request.items[itemIndex].assignedQuantity = assigned.assignedQuantity;
          
          // For Standard Requests ('request'):
          // Moves Inventory -> Project, so we DEDUCT from Inventory.
          // For Returns ('return') and Remaining Returns ('remaining_return'):
          // Moves Project -> Inventory, so we SKIP deduction here (will add on receive).
          
          const shouldDeductInventory = !isRemainingReturn && !isReturnRequest;

          if (shouldDeductInventory && request.items[itemIndex].materialId) {
            const material = await Material.findById(request.items[itemIndex].materialId);
            if (material) {
              if (material.quantity < assigned.assignedQuantity) {
                return res.status(400).json({ 
                  message: `Insufficient stock for ${material.name}. Available: ${material.quantity}, Requested: ${assigned.assignedQuantity}` 
                });
              }
              material.quantity -= assigned.assignedQuantity;
              // Add edit history
              material.edits.push({
                editedBy: req.user.userId,
                changes: [{
                  field: 'quantity',
                  from: material.quantity + assigned.assignedQuantity,
                  to: material.quantity
                }]
              });
              await material.save();
            }
          }
        }
      }
    }

    request.status = 'fulfilled';
    request.fulfilledBy = req.user.userId;
    request.fulfilledAt = new Date();
    request.fulfillmentNotes = fulfillmentNotes || '';

    await request.save();
    await request.populate('projectId', 'name');
    await request.populate('requestedBy', 'name email');
    await request.populate('fulfilledBy', 'name email');

    res.json(request);
  } catch (error) {
    console.error('Error fulfilling material request:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Cancel request
router.patch('/:id/cancel', auth, async (req, res) => {
  try {
    const request = await MaterialRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Material request not found' });
    }

    // Only requester or admin/manager can cancel
    const roles = req.user.roles || [];
    if (request.requestedBy.toString() !== req.user.userId && !roles.some(r => ['admin', 'manager'].includes(r))) {
      return res.status(403).json({ message: 'You can only cancel your own requests.' });
    }

    if (!['pending', 'approved'].includes(request.status)) {
      return res.status(400).json({ message: 'This request cannot be cancelled.' });
    }

    request.status = 'cancelled';
    await request.save();

    res.json(request);
  } catch (error) {
    console.error('Error cancelling material request:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete request (admin only, pending only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    
    if (!roles.includes('admin')) {
      return res.status(403).json({ message: 'Only admins can delete requests.' });
    }

    const request = await MaterialRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Material request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending requests can be deleted.' });
    }

    await MaterialRequest.findByIdAndDelete(req.params.id);
    res.json({ message: 'Material request deleted successfully' });
  } catch (error) {
    console.error('Error deleting material request:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark as received (by requester/project engineer)
router.patch('/:id/receive', auth, async (req, res) => {
  try {
    const request = await MaterialRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Material request not found' });
    }

    // Role-based check for who can mark as received
    const roles = req.user.roles || [];
    const isRemainingReturn = request.requestType === 'remaining_return';
    const isReturnRequest = request.requestType === 'return';
    
    // Returns (Both types): Project -> Inventory. Received by Inventory Manager.
    if (isRemainingReturn || isReturnRequest) {
      if (!roles.some(r => ['admin', 'manager', 'inventory_manager'].includes(r))) {
        return res.status(403).json({ message: 'Only inventory managers can mark return requests as received.' });
      }
    } else {
      // Regular requests: Inventory -> Project. Received by Requester (PE).
      if (request.requestedBy.toString() !== req.user.userId && !roles.some(r => ['admin', 'manager'].includes(r))) {
        return res.status(403).json({ message: 'Only the requester can mark materials as received.' });
      }
    }

    // For remaining_return: allow receiving directly from 'pending' (skip fulfill step)
    // For return and regular requests: must be 'fulfilled' first
    const allowedStatuses = isRemainingReturn ? ['pending', 'fulfilled'] : ['fulfilled'];
    if (!allowedStatuses.includes(request.status)) {
      return res.status(400).json({ message: isRemainingReturn ? 'Only pending or fulfilled remaining return requests can be received.' : 'Only fulfilled requests can be marked as received.' });
    }

    const { receivedNotes, deliveryNote } = req.body;

    // Validate delivery note (mandatory)
    if (!deliveryNote || !deliveryNote.deliveryDate || !deliveryNote.receiverSignatureName) {
      return res.status(400).json({ message: 'Delivery date and receiver signature are required.' });
    }

    // For ALL Return requests (Project -> Inventory), ADD quantities back to inventory
    // (Both 'remaining_return' and 'return' flow back to inventory)
    if ((isRemainingReturn || isReturnRequest) && deliveryNote.receivedItems && deliveryNote.receivedItems.length > 0) {
      console.log('Processing return request receive, items:', deliveryNote.receivedItems.length);
      
      for (let i = 0; i < deliveryNote.receivedItems.length; i++) {
        const receivedItem = deliveryNote.receivedItems[i];
        if (receivedItem.receivedQuantity > 0) {
          // Try to find matching item by index first (most reliable), then by name
          let requestItem = request.items[i];
          
          // If index doesn't match by name, search by materialName
          if (!requestItem || requestItem.materialName !== receivedItem.materialName) {
            requestItem = request.items.find(item => item.materialName === receivedItem.materialName);
          }
          
          console.log(`Processing item ${i}: ${receivedItem.materialName}, qty: ${receivedItem.receivedQuantity}`);
          console.log(`Found request item:`, requestItem ? { name: requestItem.materialName, materialId: requestItem.materialId } : 'NOT FOUND');
          
          if (requestItem && requestItem.materialId) {
            // Handle both ObjectId and string
            const matId = requestItem.materialId._id || requestItem.materialId;
            const material = await Material.findById(matId);
            
            if (material) {
              const oldQuantity = material.quantity;
              const newQuantity = oldQuantity + receivedItem.receivedQuantity;
              
              console.log(`Updating material ${material.name}: ${oldQuantity} -> ${newQuantity}`);
              
              // Update quantity
              material.quantity = newQuantity;
              
              // Add edit history
              material.edits.push({
                editedBy: req.user.userId,
                changes: [{
                  field: 'quantity',
                  from: oldQuantity,
                  to: newQuantity
                }]
              });
              
              await material.save();
              console.log(`Material ${material.name} saved successfully`);
            } else {
              console.log(`Material not found for ID: ${matId}`);
            }
          } else {
            console.log(`No materialId found for item: ${receivedItem.materialName}`);
          }
        }
      }
    }

    request.status = 'received';
    request.receivedBy = req.user.userId;
    request.receivedAt = new Date();
    request.receivedNotes = receivedNotes || '';
    request.deliveryNote = {
      deliveryDate: deliveryNote.deliveryDate,
      deliveryPersonName: deliveryNote.deliveryPersonName || '',
      deliveryPersonContact: deliveryNote.deliveryPersonContact || '',
      vehicleNumber: deliveryNote.vehicleNumber || '',
      materialCondition: deliveryNote.materialCondition || 'good',
      conditionNotes: deliveryNote.conditionNotes || '',
      receivedItems: deliveryNote.receivedItems || [],
      receiverSignatureName: deliveryNote.receiverSignatureName,
      acknowledgmentNotes: deliveryNote.acknowledgmentNotes || ''
    };

    await request.save();
    await request.populate('projectId', 'name');
    await request.populate('requestedBy', 'name email');
    await request.populate('receivedBy', 'name email');

    res.json(request);
  } catch (error) {
    console.error('Error marking request as received:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
