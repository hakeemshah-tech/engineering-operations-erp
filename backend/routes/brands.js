const express = require('express');
const jwt = require('jsonwebtoken');
const Brand = require('../models/Brand');
const router = express.Router();

// Auth middleware
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

const isInventoryManager = (roles) => roles.includes('inventory_manager') || roles.includes('admin');

// GET all brands (anyone authenticated can read)
router.get('/', auth, async (req, res) => {
  try {
    const brands = await Brand.find()
      .populate('createdBy', 'name')
      .sort({ name: 1 });
    res.json(brands);
  } catch (error) {
    console.error('Error fetching brands:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create brand (inventory_manager or admin only)
router.post('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!isInventoryManager(roles)) {
      return res.status(403).json({ message: 'Only Inventory Managers can add brands.' });
    }

    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Brand name is required.' });
    }

    const existing = await Brand.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } });
    if (existing) {
      return res.status(400).json({ message: `Brand "${name}" already exists.` });
    }

    const brand = await Brand.create({
      name: name.trim(),
      createdBy: req.user.userId
    });

    await brand.populate('createdBy', 'name');
    res.status(201).json(brand);
  } catch (error) {
    console.error('Error creating brand:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE brand (inventory_manager or admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!isInventoryManager(roles)) {
      return res.status(403).json({ message: 'Only Inventory Managers can delete brands.' });
    }

    const brand = await Brand.findByIdAndDelete(req.params.id);
    if (!brand) {
      return res.status(404).json({ message: 'Brand not found.' });
    }

    res.json({ message: 'Brand deleted successfully.' });
  } catch (error) {
    console.error('Error deleting brand:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
