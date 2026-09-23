const express = require('express');
const jwt = require('jsonwebtoken');
const Store = require('../models/Store');
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

// Check if user is inventory_manager
const isInventoryManager = (roles) => roles.includes('inventory_manager');

// Check if user is store_keeper
const isStoreKeeper = (roles) => roles.includes('store_keeper');

// Check if user has inventory access. Admin and Manager get read access for
// oversight. Write actions on Store (POST/PUT/DELETE) stay gated separately
// to inventory_manager only - see the isInventoryManager checks below.
const hasInventoryAccess = (roles) =>
  isInventoryManager(roles) ||
  isStoreKeeper(roles) ||
  roles.includes('admin') ||
  roles.includes('manager');

// Get all stores (inventory_manager: all, store_keeper: assigned only)
router.get('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    
    if (!hasInventoryAccess(roles)) {
      return res.status(403).json({ message: 'Access denied. Inventory roles required.' });
    }

    let query = {};
    
    // Store keepers can only see their assigned stores
    if (isStoreKeeper(roles) && !isInventoryManager(roles)) {
      query.assignedStoreKeeper = req.user.userId;
    }

    const stores = await Store.find(query)
      .populate('assignedStoreKeeper', 'name email')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.json(stores);
  } catch (error) {
    console.error('Error fetching stores:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single store
router.get('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    
    if (!hasInventoryAccess(roles)) {
      return res.status(403).json({ message: 'Access denied. Inventory roles required.' });
    }

    const store = await Store.findById(req.params.id)
      .populate('assignedStoreKeeper', 'name email')
      .populate('createdBy', 'name email');

    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    // Store keepers can only view their assigned stores
    if (isStoreKeeper(roles) && !isInventoryManager(roles)) {
      if (store.assignedStoreKeeper?._id?.toString() !== req.user.userId) {
        return res.status(403).json({ message: 'Access denied. Not your assigned store.' });
      }
    }

    res.json(store);
  } catch (error) {
    console.error('Error fetching store:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create store (inventory_manager only)
router.post('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    
    if (!isInventoryManager(roles)) {
      return res.status(403).json({ message: 'Only inventory managers can create stores.' });
    }

    const { name, location, description, assignedStoreKeeper, status } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Store name is required.' });
    }

    const store = await Store.create({
      name,
      location,
      description,
      assignedStoreKeeper: assignedStoreKeeper || null,
      status: status || 'active',
      createdBy: req.user.userId
    });

    await store.populate('assignedStoreKeeper', 'name email');
    await store.populate('createdBy', 'name email');

    res.status(201).json(store);
  } catch (error) {
    console.error('Error creating store:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update store (inventory_manager only)
router.put('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    
    if (!isInventoryManager(roles)) {
      return res.status(403).json({ message: 'Only inventory managers can update stores.' });
    }

    const store = await Store.findById(req.params.id);
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    const updatableFields = ['name', 'location', 'description', 'assignedStoreKeeper', 'status'];
    const changes = [];

    for (const field of updatableFields) {
      if (typeof req.body[field] !== 'undefined') {
        const from = store[field];
        const to = req.body[field];
        
        if (JSON.stringify(from) !== JSON.stringify(to)) {
          changes.push({ field, from, to });
          store[field] = to;
        }
      }
    }

    if (changes.length > 0) {
      store.edits.push({ editedBy: req.user.userId, changes });
    }

    await store.save();
    await store.populate('assignedStoreKeeper', 'name email');
    await store.populate('createdBy', 'name email');

    res.json(store);
  } catch (error) {
    console.error('Error updating store:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete store (inventory_manager only, only if no materials)
router.delete('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    
    if (!isInventoryManager(roles)) {
      return res.status(403).json({ message: 'Only inventory managers can delete stores.' });
    }

    const store = await Store.findById(req.params.id);
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    // Check if store has any materials
    const materialCount = await Material.countDocuments({ storeId: store._id });
    if (materialCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete store. It contains ${materialCount} material(s). Please remove or transfer all materials first.` 
      });
    }

    await Store.findByIdAndDelete(req.params.id);
    res.json({ message: 'Store deleted successfully' });
  } catch (error) {
    console.error('Error deleting store:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get store keepers (inventory_manager only) - for assignment dropdown
router.get('/users/store-keepers', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    
    if (!isInventoryManager(roles)) {
      return res.status(403).json({ message: 'Only inventory managers can view store keepers.' });
    }

    const users = await User.find({ isActive: true }).populate('roles');
    const storeKeepers = users.filter(user => {
      const userRoles = (user.roles || []).map(r => typeof r === 'string' ? r : r.key);
      return userRoles.includes('store_keeper');
    });

    res.json(storeKeepers.map(u => ({ _id: u._id, name: u.name, email: u.email })));
  } catch (error) {
    console.error('Error fetching store keepers:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
