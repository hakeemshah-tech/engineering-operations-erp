const mongoose = require('mongoose');

const editSchema = new mongoose.Schema({
  editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  editedAt: { type: Date, default: Date.now },
  changes: [{
    field: { type: String, required: true },
    from: { type: mongoose.Schema.Types.Mixed },
    to: { type: mongoose.Schema.Types.Mixed }
  }]
}, { _id: false });

const locationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ['office', 'site', 'remote', 'other'],
    default: 'site'
  },
  address: { type: String, trim: true },

  // Coordinates. Still required even when noGeofence=true so the location can
  // be displayed on a map and used as an audit anchor for distance reporting.
  lat: {
    type: Number,
    required: true,
    min: -90,
    max: 90
  },
  lng: {
    type: Number,
    required: true,
    min: -180,
    max: 180
  },
  // Larger max so "Remote - Dubai City" / "Remote - UAE" can use a city- or
  // country-scale radius. Default kept at 100 for back-compat with existing
  // site/office locations.
  // Geofence radius. Minimum bumped to 50 m because consumer GPS accuracy
  // bottoms out around ±30–100 m even outdoors (worse indoors), so radii
  // below ~50 m generate constant false-rejections and force workers into
  // "low confidence" punches. If a location genuinely needs zero radius
  // (e.g. travelling staff), set `noGeofence: true` instead.
  geofenceRadiusMeters: {
    type: Number,
    required: true,
    default: 100,
    min: 50,
    max: 200000
  },
  // When true, the geofence check passes regardless of how far the punch is
  // from the coordinates. Used for fully-remote / travelling staff where any
  // GPS-based perimeter is meaningless. Selfie + IP audit still apply.
  noGeofence: { type: Boolean, default: false },

  googlePlaceId: { type: String, trim: true },
  notes: { type: String, trim: true },

  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },

  lockedByRoleWeight: { type: Number, default: 0 },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  edits: [editSchema]
}, { timestamps: true });

locationSchema.index({ status: 1, type: 1 });
locationSchema.index({ name: 1 });

module.exports = mongoose.model('Location', locationSchema);
