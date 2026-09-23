const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Small in-process cache so we don't hit Mongo on every authenticated request
// just to re-check user.isActive. 30-second TTL is short enough that a
// deactivation (e.g. offboarding completion) effectively kicks the user out
// inside one minute even if they never reload.
const activeCache = new Map(); // userId -> { isActive, until }
const ACTIVE_TTL_MS = 30 * 1000;

async function isUserActive(userId) {
  const now = Date.now();
  const hit = activeCache.get(userId);
  if (hit && hit.until > now) return hit.isActive;
  const u = await User.findById(userId).select('isActive').lean();
  const isActive = !!(u && u.isActive !== false);
  activeCache.set(userId, { isActive, until: now + ACTIVE_TTL_MS });
  return isActive;
}

function invalidateActiveCache(userId) {
  if (userId) activeCache.delete(String(userId));
}

async function auth(req, res, next) {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Access denied' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Reject tokens belonging to deactivated accounts (terminated/resigned
    // employees, manually disabled users). The client's axios interceptor
    // already routes 401 responses back to the login screen.
    if (decoded?.userId) {
      const ok = await isUserActive(decoded.userId);
      if (!ok) {
        return res.status(401).json({ message: 'Account is no longer active. Please contact HR.' });
      }
    }
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
}

module.exports = auth;
module.exports.invalidateActiveCache = invalidateActiveCache;
