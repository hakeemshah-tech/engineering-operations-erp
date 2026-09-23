const express = require('express');
const Location = require('../models/Location');
const LocationGroup = require('../models/LocationGroup');
const Employee = require('../models/Employee');
const Project = require('../models/Project');
const GeneralAuditLog = require('../models/GeneralAuditLog');
const auth = require('../middleware/auth');
const { requireAnyRole } = require('../middleware/rbac');
const { effectiveWeight, canOverwrite } = require('../utils/roleWeight');

const router = express.Router();

const WRITE_ROLES = ['admin', 'manager', 'hr', 'project_engineer'];
const DELETE_ROLES = ['admin', 'manager'];

async function audit(action, entityId, userId, details = {}) {
  try {
    await GeneralAuditLog.create({
      action,
      module: 'hr_management',
      entityType: 'location',
      entityId,
      performedBy: userId,
      performedAt: new Date(),
      details,
      success: true
    });
  } catch (err) {
    console.error('[location audit]', err.message);
  }
}

function validateCoordinates(lat, lng) {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
    return 'Latitude must be a number between -90 and 90.';
  }
  if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
    return 'Longitude must be a number between -180 and 180.';
  }
  return null;
}

function validateRadius(r) {
  const n = Number(r);
  if (!Number.isFinite(n) || n < 50 || n > 200000) {
    return 'Geofence radius must be a number between 50 and 200000 meters (200 km). For workers with no fixed location, mark the location as "no geofence" instead.';
  }
  return null;
}

// GET /api/locations
//   Query params:
//     type, status, q          existing filters (status, type, name-search)
//     ids=a,b,c                fetch specific locations by ID - used by
//                              pickers to show "already-selected" rows that
//                              would otherwise be off the current page
//     page, limit              opt-in pagination. When BOTH provided, the
//                              response shape switches to
//                              { items, total, page, limit, pages }.
//                              When absent, returns the legacy raw array
//                              so existing callers keep working.
router.get('/', auth, async (req, res) => {
  try {
    const { type, status, q, ids } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (q) {
      // Name OR address contains the term, case-insensitive
      const safe = String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name:    { $regex: safe, $options: 'i' } },
        { address: { $regex: safe, $options: 'i' } }
      ];
    }
    if (ids) {
      const idList = String(ids).split(',').map(s => s.trim()).filter(Boolean);
      if (idList.length === 0) return res.json([]);
      // ids takes precedence - always returns the exact set requested,
      // ignoring page/limit. Used by pickers to render selected chips.
      const items = await Location.find({ _id: { $in: idList } })
        .populate('createdBy', 'name email')
        .sort({ name: 1 });
      return res.json(items);
    }

    const pageNum  = req.query.page  !== undefined ? Math.max(1, Number(req.query.page))  : null;
    const limitNum = req.query.limit !== undefined ? Math.min(200, Math.max(1, Number(req.query.limit))) : null;

    if (pageNum && limitNum) {
      const [items, total] = await Promise.all([
        Location.find(filter)
          .populate('createdBy', 'name email')
          .sort({ updatedAt: -1 })
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum),
        Location.countDocuments(filter)
      ]);
      return res.json({
        items,
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.max(1, Math.ceil(total / limitNum))
      });
    }

    const locations = await Location.find(filter)
      .populate('createdBy', 'name email')
      .sort({ updatedAt: -1 });
    res.json(locations);
  } catch (err) {
    console.error('Error listing locations:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/locations/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const location = await Location.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('edits.editedBy', 'name email');
    if (!location) return res.status(404).json({ message: 'Location not found.' });
    res.json(location);
  } catch (err) {
    console.error('Error fetching location:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/locations
router.post('/', auth, requireAnyRole(...WRITE_ROLES), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name || !String(body.name).trim()) {
      return res.status(400).json({ message: 'Name is required.' });
    }
    const coordErr = validateCoordinates(body.lat, body.lng);
    if (coordErr) return res.status(400).json({ message: coordErr });
    const radiusErr = validateRadius(body.geofenceRadiusMeters);
    if (radiusErr) return res.status(400).json({ message: radiusErr });

    const location = await Location.create({
      name: String(body.name).trim(),
      type: body.type || 'site',
      address: body.address || '',
      lat: Number(body.lat),
      lng: Number(body.lng),
      geofenceRadiusMeters: Number(body.geofenceRadiusMeters),
      noGeofence: !!body.noGeofence,
      googlePlaceId: body.googlePlaceId || undefined,
      notes: body.notes || '',
      status: body.status || 'active',
      createdBy: req.user.userId,
      lockedByRoleWeight: effectiveWeight(req)
    });

    await audit('location_created', location._id, req.user.userId, {
      name: location.name,
      type: location.type,
      lockedByRoleWeight: location.lockedByRoleWeight
    });

    res.status(201).json(location);
  } catch (err) {
    console.error('Error creating location:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/locations/:id/dependencies
//   Returns a fan-out count of every record that currently references this
//   location, so the UI can show a confirmation modal before saving an edit
//   ("you are about to change a location 14 employees + 3 projects depend on").
//   Cheap pure-aggregation read - no joins, no populate.
router.get('/:id/dependencies', auth, async (req, res) => {
  try {
    const locationId = req.params.id;
    const location = await Location.findById(locationId).select('_id name');
    if (!location) return res.status(404).json({ message: 'Location not found.' });

    // Groups that include this location as a member - used to fan out the
    // "via group" employee count below.
    const groupsWithLocation = await LocationGroup.find({ locationIds: locationId })
      .select('_id name');
    const groupIds = groupsWithLocation.map(g => g._id);

    const [asBaseCount, asAdditionalCount, viaGroupCount, asProjectSiteCount] = await Promise.all([
      Employee.countDocuments({ baseLocationId: locationId }),
      Employee.countDocuments({ additionalLocationIds: locationId }),
      groupIds.length > 0
        ? Employee.countDocuments({ locationGroupId: { $in: groupIds } })
        : Promise.resolve(0),
      Project.countDocuments({ siteLocationId: locationId })
    ]);

    // Distinct employee count - an employee may be linked via more than one
    // path (e.g. base + via group). De-dupe at the ID level so the modal
    // doesn't double-count.
    const linkedEmployeeIds = await Employee.distinct('_id', {
      $or: [
        { baseLocationId: locationId },
        { additionalLocationIds: locationId },
        ...(groupIds.length > 0 ? [{ locationGroupId: { $in: groupIds } }] : [])
      ]
    });

    res.json({
      locationId: String(location._id),
      locationName: location.name,
      employeeCount: linkedEmployeeIds.length,
      projectCount: asProjectSiteCount,
      locationGroupCount: groupIds.length,
      breakdown: {
        asBase: asBaseCount,
        asAdditional: asAdditionalCount,
        viaGroup: viaGroupCount,
        asProjectSite: asProjectSiteCount
      },
      groups: groupsWithLocation.map(g => ({ _id: String(g._id), name: g.name }))
    });
  } catch (err) {
    console.error('Error computing location dependencies:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/locations/:id
router.put('/:id', auth, requireAnyRole(...WRITE_ROLES), async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);
    if (!location) return res.status(404).json({ message: 'Location not found.' });

    if (!canOverwrite(req, location.lockedByRoleWeight)) {
      return res.status(403).json({
        message: 'This location is locked by a higher-ranked editor.',
        code: 'locked',
        lockedByRoleWeight: location.lockedByRoleWeight
      });
    }

    const body = req.body || {};

    if (body.lat !== undefined || body.lng !== undefined) {
      const nextLat = body.lat !== undefined ? body.lat : location.lat;
      const nextLng = body.lng !== undefined ? body.lng : location.lng;
      const coordErr = validateCoordinates(nextLat, nextLng);
      if (coordErr) return res.status(400).json({ message: coordErr });
    }
    if (body.geofenceRadiusMeters !== undefined) {
      const radiusErr = validateRadius(body.geofenceRadiusMeters);
      if (radiusErr) return res.status(400).json({ message: radiusErr });
    }

    const changes = [];
    const simpleFields = ['name', 'type', 'address', 'lat', 'lng', 'geofenceRadiusMeters', 'noGeofence', 'googlePlaceId', 'notes', 'status'];

    for (const f of simpleFields) {
      if (body[f] !== undefined && String(body[f]) !== String(location[f] ?? '')) {
        changes.push({ field: f, from: location[f], to: body[f] });
        location[f] = body[f];
      }
    }

    if (changes.length > 0) {
      location.edits.push({ editedBy: req.user.userId, editedAt: new Date(), changes });
      location.lockedByRoleWeight = effectiveWeight(req);
    }

    await location.save();
    await audit('location_updated', location._id, req.user.userId, { changesCount: changes.length });

    res.json(location);
  } catch (err) {
    console.error('Error updating location:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/locations/:id (soft-delete)
router.delete('/:id', auth, requireAnyRole(...DELETE_ROLES), async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);
    if (!location) return res.status(404).json({ message: 'Location not found.' });

    if (!canOverwrite(req, location.lockedByRoleWeight)) {
      return res.status(403).json({
        message: 'This location is locked by a higher-ranked editor.',
        code: 'locked',
        lockedByRoleWeight: location.lockedByRoleWeight
      });
    }

    if (location.status !== 'inactive') {
      location.edits.push({
        editedBy: req.user.userId,
        editedAt: new Date(),
        changes: [{ field: 'status', from: location.status, to: 'inactive' }]
      });
      location.status = 'inactive';
      location.lockedByRoleWeight = effectiveWeight(req);
      await location.save();
    }

    await audit('location_deleted', location._id, req.user.userId, { name: location.name });
    res.json({ message: 'Location deactivated.', location });
  } catch (err) {
    console.error('Error deleting location:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
