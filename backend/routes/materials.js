const express = require('express');
const jwt = require('jsonwebtoken');
const Material = require('../models/Material');
const Store = require('../models/Store');
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

// Check if user has inventory access. Admin and Manager get full read/write
// for oversight; store-level scoping (assignedStoreKeeper) still applies to
// store_keepers via the inline checks below.
const hasInventoryAccess = (roles) =>
  isInventoryManager(roles) ||
  isStoreKeeper(roles) ||
  roles.includes('admin') ||
  roles.includes('manager');

// Check if user can read materials (for material requests and purchase orders)
const canReadMaterials = (roles) => hasInventoryAccess(roles) || 
  roles.includes('project_engineer') || 
  roles.includes('procurement_engineer') ||
  roles.includes('manager') || 
  roles.includes('admin');

// Get stores assigned to store_keeper
const getAssignedStoreIds = async (userId) => {
  const stores = await Store.find({ assignedStoreKeeper: userId });
  return stores.map(s => s._id);
};

// Get all materials (filtered by role)
router.get('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    
    // Allow project engineers, managers, and admins to read materials (for material requests)
    if (!canReadMaterials(roles)) {
      return res.status(403).json({ message: 'Access denied. Inventory roles required.' });
    }

    let query = {};
    
    // Store keepers can only see materials in their assigned stores
    if (isStoreKeeper(roles) && !isInventoryManager(roles)) {
      const assignedStoreIds = await getAssignedStoreIds(req.user.userId);
      query.storeId = { $in: assignedStoreIds };
    }

    // Apply filters from query params
    if (req.query.storeId) {
      query.storeId = req.query.storeId;
    }
    if (req.query.category) {
      query.category = req.query.category;
    }
    if (req.query.brand) {
      query.brand = req.query.brand;
    }
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query.$or = [
        { name: searchRegex },
        { sku: searchRegex },
        { description: searchRegex }
      ];
    }

    const materials = await Material.find(query)
      .populate('storeId', 'name location')
      .populate('createdBy', 'name email')
      .populate('brand', 'name')
      .sort({ createdAt: -1 });

    res.json(materials);
  } catch (error) {
    console.error('Error fetching materials:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single material
router.get('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    
    if (!hasInventoryAccess(roles)) {
      return res.status(403).json({ message: 'Access denied. Inventory roles required.' });
    }

    const material = await Material.findById(req.params.id)
      .populate('storeId', 'name location assignedStoreKeeper')
      .populate('createdBy', 'name email');

    if (!material) {
      return res.status(404).json({ message: 'Material not found' });
    }

    // Store keepers can only view materials in their assigned stores
    if (isStoreKeeper(roles) && !isInventoryManager(roles)) {
      const assignedStoreIds = await getAssignedStoreIds(req.user.userId);
      if (!assignedStoreIds.some(id => id.toString() === material.storeId._id.toString())) {
        return res.status(403).json({ message: 'Access denied. Material not in your assigned store.' });
      }
    }

    res.json(material);
  } catch (error) {
    console.error('Error fetching material:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create material
router.post('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    
    if (!hasInventoryAccess(roles)) {
      return res.status(403).json({ message: 'Access denied. Inventory roles required.' });
    }

    const { name, sku, uom, category, storeId, quantity, minStockLevel, description, brand } = req.body;

    if (!name || !sku || !uom || !category || !storeId) {
      return res.status(400).json({ message: 'Name, SKU, UOM, Category, and Store are required.' });
    }

    // Verify store exists
    const store = await Store.findById(storeId);
    if (!store) {
      return res.status(404).json({ message: 'Store not found.' });
    }

    // Store keepers can only add materials to their assigned stores
    if (isStoreKeeper(roles) && !isInventoryManager(roles)) {
      if (store.assignedStoreKeeper?.toString() !== req.user.userId) {
        return res.status(403).json({ message: 'You can only add materials to your assigned store.' });
      }
    }

    // Check SKU uniqueness within store
    const existingSku = await Material.findOne({ sku: sku.toUpperCase(), storeId });
    if (existingSku) {
      return res.status(400).json({ message: `SKU "${sku}" already exists in this store.` });
    }

    // Check brand+name uniqueness (only when brand is provided)
    if (brand) {
      const existingBrandName = await Material.findOne({ name: new RegExp(`^${name.trim()}$`, 'i'), brand });
      if (existingBrandName) {
        return res.status(400).json({ message: `A material named "${name}" already exists for this brand.` });
      }
    }

    const material = await Material.create({
      name,
      sku: sku.toUpperCase(),
      uom,
      category,
      storeId,
      quantity: quantity || 0,
      minStockLevel: minStockLevel || 0,
      description,
      brand: brand || undefined,
      createdBy: req.user.userId
    });

    await material.populate('storeId', 'name location');
    await material.populate('createdBy', 'name email');
    await material.populate('brand', 'name');

    res.status(201).json(material);
  } catch (error) {
    console.error('Error creating material:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'SKU already exists in this store.' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Update material
router.put('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    
    if (!hasInventoryAccess(roles)) {
      return res.status(403).json({ message: 'Access denied. Inventory roles required.' });
    }

    const material = await Material.findById(req.params.id).populate('storeId');
    if (!material) {
      return res.status(404).json({ message: 'Material not found' });
    }

    // Store keepers can only update materials in their assigned stores
    if (isStoreKeeper(roles) && !isInventoryManager(roles)) {
      if (material.storeId.assignedStoreKeeper?.toString() !== req.user.userId) {
        return res.status(403).json({ message: 'You can only update materials in your assigned store.' });
      }
    }

    const updatableFields = ['name', 'sku', 'uom', 'category', 'quantity', 'minStockLevel', 'description', 'brand'];
    const changes = [];

    for (const field of updatableFields) {
      if (typeof req.body[field] !== 'undefined') {
        let from = material[field];
        let to = req.body[field];
        
        // Uppercase SKU
        if (field === 'sku') {
          to = to.toUpperCase();
        }
        
        if (JSON.stringify(from) !== JSON.stringify(to)) {
          changes.push({ field, from, to });
          material[field] = to;
        }
      }
    }

    // Check SKU uniqueness if changed
    if (req.body.sku && req.body.sku.toUpperCase() !== material.sku) {
      const existingSku = await Material.findOne({ 
        sku: req.body.sku.toUpperCase(), 
        storeId: material.storeId._id,
        _id: { $ne: material._id }
      });
      if (existingSku) {
        return res.status(400).json({ message: `SKU "${req.body.sku}" already exists in this store.` });
      }
    }

    // Check brand+name uniqueness if name or brand changed
    const newName = req.body.name || material.name;
    const newBrand = req.body.brand || material.brand;
    if (newBrand) {
      const existingBrandName = await Material.findOne({
        name: new RegExp(`^${newName.trim()}$`, 'i'),
        brand: newBrand,
        _id: { $ne: material._id }
      });
      if (existingBrandName) {
        return res.status(400).json({ message: `A material named "${newName}" already exists for this brand.` });
      }
    }

    if (changes.length > 0) {
      material.edits.push({ editedBy: req.user.userId, changes });
    }

    await material.save();
    await material.populate('storeId', 'name location');
    await material.populate('createdBy', 'name email');
    await material.populate('brand', 'name');

    res.json(material);
  } catch (error) {
    console.error('Error updating material:', error);
    if (error.code === 11000) {
      const key = error.keyPattern || {};
      if (key.name && key.brand) {
        return res.status(400).json({ message: 'A material with this name already exists for the selected brand.' });
      }
      return res.status(400).json({ message: 'SKU already exists in this store.' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete material
router.delete('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    
    if (!hasInventoryAccess(roles)) {
      return res.status(403).json({ message: 'Access denied. Inventory roles required.' });
    }

    const material = await Material.findById(req.params.id).populate('storeId');
    if (!material) {
      return res.status(404).json({ message: 'Material not found' });
    }

    // Store keepers can only delete materials in their assigned stores
    if (isStoreKeeper(roles) && !isInventoryManager(roles)) {
      if (material.storeId.assignedStoreKeeper?.toString() !== req.user.userId) {
        return res.status(403).json({ message: 'You can only delete materials in your assigned store.' });
      }
    }

    await Material.findByIdAndDelete(req.params.id);
    res.json({ message: 'Material deleted successfully' });
  } catch (error) {
    console.error('Error deleting material:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get materials by store (for quick lookup)
router.get('/store/:storeId', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    
    if (!hasInventoryAccess(roles)) {
      return res.status(403).json({ message: 'Access denied. Inventory roles required.' });
    }

    // Store keepers can only view materials in their assigned stores
    if (isStoreKeeper(roles) && !isInventoryManager(roles)) {
      const store = await Store.findById(req.params.storeId);
      if (!store || store.assignedStoreKeeper?.toString() !== req.user.userId) {
        return res.status(403).json({ message: 'Access denied. Not your assigned store.' });
      }
    }

    const materials = await Material.find({ storeId: req.params.storeId })
      .populate('storeId', 'name location')
      .populate('createdBy', 'name email')
      .sort({ name: 1 });

    res.json(materials);
  } catch (error) {
    console.error('Error fetching materials by store:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
