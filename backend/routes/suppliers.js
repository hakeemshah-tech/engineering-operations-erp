const express = require('express');
const jwt = require('jsonwebtoken');
const Supplier = require('../models/Supplier');
const PurchaseRequest = require('../models/PurchaseRequest');
const PurchaseOrder = require('../models/PurchaseOrder');
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

const hasSupplierAccess = (roles) =>
  roles.includes('procurement_engineer') ||
  roles.includes('inventory_manager') ||
  roles.includes('admin') ||
  roles.includes('manager');

// GET all suppliers (with search & status filter)
router.get('/', auth, async (req, res) => {
  try {
    const { search, status } = req.query;
    const filter = {};

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { trn: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } }
      ];
    }

    const suppliers = await Supplier.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.json(suppliers);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET single supplier
router.get('/:id', auth, async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('edits.editedBy', 'name email');

    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found.' });
    }

    res.json(supplier);
  } catch (error) {
    console.error('Error fetching supplier:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create supplier
router.post('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasSupplierAccess(roles)) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    const { name, trn, contactPerson, phone, email, address } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Supplier name is required.' });
    }
    if (!trn || !trn.trim()) {
      return res.status(400).json({ message: 'TRN (Tax Registration Number) is required.' });
    }

    // Check TRN uniqueness
    const existingTrn = await Supplier.findOne({ trn: trn.trim() });
    if (existingTrn) {
      return res.status(400).json({ message: `A supplier with TRN "${trn.trim()}" already exists.` });
    }

    const supplier = await Supplier.create({
      name: name.trim(),
      trn: trn.trim(),
      contactPerson: contactPerson?.trim() || '',
      phone: phone?.trim() || '',
      email: email?.trim() || '',
      address: address?.trim() || '',
      createdBy: req.user.userId
    });

    await supplier.populate('createdBy', 'name email');
    res.status(201).json(supplier);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'A supplier with this TRN already exists.' });
    }
    console.error('Error creating supplier:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update supplier
router.put('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasSupplierAccess(roles)) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found.' });
    }

    const { name, trn, contactPerson, phone, email, address, status } = req.body;

    // Check TRN uniqueness if changed
    if (trn && trn.trim() !== supplier.trn) {
      const existingTrn = await Supplier.findOne({ trn: trn.trim(), _id: { $ne: supplier._id } });
      if (existingTrn) {
        return res.status(400).json({ message: `A supplier with TRN "${trn.trim()}" already exists.` });
      }
    }

    // Track changes
    const changes = [];
    const fields = { name, trn, contactPerson, phone, email, address, status };
    for (const [field, value] of Object.entries(fields)) {
      if (value !== undefined && String(value).trim() !== String(supplier[field] || '')) {
        changes.push({ field, from: supplier[field], to: typeof value === 'string' ? value.trim() : value });
      }
    }

    if (changes.length > 0) {
      supplier.edits.push({
        editedBy: req.user.userId,
        editedAt: new Date(),
        changes
      });
    }

    // Apply updates
    if (name) supplier.name = name.trim();
    if (trn) supplier.trn = trn.trim();
    if (contactPerson !== undefined) supplier.contactPerson = contactPerson.trim();
    if (phone !== undefined) supplier.phone = phone.trim();
    if (email !== undefined) supplier.email = email.trim();
    if (address !== undefined) supplier.address = address.trim();
    if (status) supplier.status = status;

    await supplier.save();
    await supplier.populate('createdBy', 'name email');
    await supplier.populate('edits.editedBy', 'name email');

    res.json(supplier);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'A supplier with this TRN already exists.' });
    }
    console.error('Error updating supplier:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE supplier (only if not linked to any PR/PO)
router.delete('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasSupplierAccess(roles)) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    // Check if supplier is linked to any PR or PO
    const linkedPR = await PurchaseRequest.findOne({ supplierId: req.params.id });
    const linkedPO = await PurchaseOrder.findOne({ supplierId: req.params.id });

    if (linkedPR || linkedPO) {
      return res.status(400).json({
        message: 'Cannot delete supplier. It is linked to existing Purchase Requests or Purchase Orders.'
      });
    }

    const supplier = await Supplier.findByIdAndDelete(req.params.id);
    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found.' });
    }

    res.json({ message: 'Supplier deleted successfully.' });
  } catch (error) {
    console.error('Error deleting supplier:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
