const express = require('express');
const LocationGroup = require('../models/LocationGroup');
const Location = require('../models/Location');
const Employee = require('../models/Employee');
const GeneralAuditLog = require('../models/GeneralAuditLog');
const auth = require('../middleware/auth');
const { requireAnyRole } = require('../middleware/rbac');
const { effectiveWeight, canOverwrite } = require('../utils/roleWeight');

const router = express.Router();

// Same RBAC matrix as /api/locations - admins, managers, HR, and project
// engineers can curate groups; only admin/manager can delete.
const WRITE_ROLES  = ['admin', 'manager', 'hr', 'project_engineer'];
const DELETE_ROLES = ['admin', 'manager'];

async function audit(action, entityId, userId, details = {}) {
  try {
    await GeneralAuditLog.create({
      action,
      module: 'hr_management',
      entityType: 'location_group',
      entityId,
      performedBy: userId,
      performedAt: new Date(),
      details,
      success: true
    });
  } catch (err) {
    console.error('[location-group audit]', err.message);
  }
}

// GET list
router.get('/', auth, async (req, res) => {
  try {
    const { status, type, q } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (type)   filter.type = type;
    if (q)      filter.name = { $regex: q, $options: 'i' };

    const groups = await LocationGroup.find(filter)
      .populate('createdBy', 'name email')
      .populate('locationIds', 'name type status lat lng geofenceRadiusMeters noGeofence')
      .sort({ updatedAt: -1 });
    res.json(groups);
  } catch (err) {
    console.error('Error listing location groups:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET single
router.get('/:id', auth, async (req, res) => {
  try {
    const group = await LocationGroup.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('locationIds')
      .populate('edits.editedBy', 'name email');
    if (!group) return res.status(404).json({ message: 'Location group not found.' });
    res.json(group);
  } catch (err) {
    console.error('Error fetching location group:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create
router.post('/', auth, requireAnyRole(...WRITE_ROLES), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name || !String(body.name).trim()) {
      return res.status(400).json({ message: 'Name is required.' });
    }
    const locationIds = Array.isArray(body.locationIds) ? body.locationIds : [];
    if (locationIds.length > 0) {
      const found = await Location.countDocuments({ _id: { $in: locationIds } });
      if (found !== locationIds.length) {
        return res.status(400).json({ message: 'One or more locationIds reference missing locations.' });
      }
    }

    const group = await LocationGroup.create({
      name: String(body.name).trim(),
      description: body.description || '',
      type: ['office', 'site', 'remote', 'mixed'].includes(body.type) ? body.type : 'mixed',
      locationIds,
      status: body.status === 'inactive' ? 'inactive' : 'active',
      createdBy: req.user.userId,
      lockedByRoleWeight: effectiveWeight(req)
    });

    await audit('location_group_created', group._id, req.user.userId, {
      name: group.name,
      memberCount: locationIds.length
    });

    res.status(201).json(group);
  } catch (err) {
    console.error('Error creating location group:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/location-groups/:id/dependencies
//   Counts every record that depends on this group. Used by the edit modal
//   to warn a curator before they save a change that fans out to a large
//   employee roster.
router.get('/:id/dependencies', auth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const group = await LocationGroup.findById(groupId).select('_id name');
    if (!group) return res.status(404).json({ message: 'Location group not found.' });

    const employeeCount = await Employee.countDocuments({ locationGroupId: groupId });

    res.json({
      locationGroupId: String(group._id),
      locationGroupName: group.name,
      employeeCount,
      breakdown: {
        viaGroup: employeeCount
      }
    });
  } catch (err) {
    console.error('Error computing location-group dependencies:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update - same hierarchy lock as Location PUT
router.put('/:id', auth, requireAnyRole(...WRITE_ROLES), async (req, res) => {
  try {
    const group = await LocationGroup.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Location group not found.' });

    if (!canOverwrite(req, group.lockedByRoleWeight)) {
      return res.status(403).json({
        message: 'This group is locked by a higher-ranked editor.',
        code: 'locked',
        lockedByRoleWeight: group.lockedByRoleWeight
      });
    }

    const body = req.body || {};
    const changes = [];

    const simpleFields = ['name', 'description', 'type', 'status'];
    for (const f of simpleFields) {
      if (body[f] !== undefined && String(body[f]) !== String(group[f] ?? '')) {
        changes.push({ field: f, from: group[f], to: body[f] });
        group[f] = body[f];
      }
    }

    if (body.locationIds !== undefined) {
      if (!Array.isArray(body.locationIds)) {
        return res.status(400).json({ message: 'locationIds must be an array.' });
      }
      if (body.locationIds.length > 0) {
        const found = await Location.countDocuments({ _id: { $in: body.locationIds } });
        if (found !== body.locationIds.length) {
          return res.status(400).json({ message: 'One or more locationIds reference missing locations.' });
        }
      }
      const prev = (group.locationIds || []).map(String);
      const next = body.locationIds.map(String);
      if (prev.sort().join(',') !== next.sort().join(',')) {
        changes.push({ field: 'locationIds', from: `${prev.length} members`, to: `${next.length} members` });
        group.locationIds = body.locationIds;
      }
    }

    if (changes.length > 0) {
      group.edits.push({ editedBy: req.user.userId, editedAt: new Date(), changes });
      group.lockedByRoleWeight = effectiveWeight(req);
    }

    await group.save();
    await audit('location_group_updated', group._id, req.user.userId, { changesCount: changes.length });

    res.json(group);
  } catch (err) {
    console.error('Error updating location group:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE (soft delete) - admin/manager only
router.delete('/:id', auth, requireAnyRole(...DELETE_ROLES), async (req, res) => {
  try {
    const group = await LocationGroup.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Location group not found.' });

    if (!canOverwrite(req, group.lockedByRoleWeight)) {
      return res.status(403).json({
        message: 'This group is locked by a higher-ranked editor.',
        code: 'locked',
        lockedByRoleWeight: group.lockedByRoleWeight
      });
    }

    // Refuse if any employees still reference this group - would silently
    // orphan their location resolution.
    const employeesUsing = await Employee.countDocuments({ locationGroupId: group._id });
    if (employeesUsing > 0) {
      return res.status(409).json({
        code: 'GROUP_IN_USE',
        message: `Cannot delete — ${employeesUsing} employee${employeesUsing === 1 ? '' : 's'} are still assigned to this group. Reassign them first.`,
        employeeCount: employeesUsing
      });
    }

    if (group.status !== 'inactive') {
      group.edits.push({
        editedBy: req.user.userId,
        editedAt: new Date(),
        changes: [{ field: 'status', from: group.status, to: 'inactive' }]
      });
      group.status = 'inactive';
      group.lockedByRoleWeight = effectiveWeight(req);
      await group.save();
    }

    await audit('location_group_deleted', group._id, req.user.userId, { name: group.name });
    res.json({ message: 'Location group deactivated.', group });
  } catch (err) {
    console.error('Error deleting location group:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
