/**
 * Dependency-free IP / CIDR matcher used by the Office IP Lock.
 * Supports:
 *   - Single IPv4   ("192.168.1.10")
 *   - IPv4 CIDR     ("192.168.1.0/24")
 *   - IPv6-mapped IPv4 input ("::ffff:192.168.1.10") is normalized to IPv4
 *   - Single IPv6 (exact match only - CIDR not supported in this lightweight impl)
 *
 * Designed to be called with req.ip after `app.set('trust proxy', true)` so the
 * real client IP is checked rather than the local proxy address.
 */

function normalizeIp(ip) {
  if (typeof ip !== 'string') return '';
  const trimmed = ip.trim();
  // IPv6-mapped IPv4 → IPv4 ("::ffff:192.168.1.10" → "192.168.1.10")
  const m = trimmed.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (m) return m[1];
  return trimmed;
}

function isIpv4(addr) {
  if (typeof addr !== 'string') return false;
  const parts = addr.split('.');
  if (parts.length !== 4) return false;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return false;
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return false;
  }
  return true;
}

function ipv4ToInt(addr) {
  const [a, b, c, d] = addr.split('.').map(Number);
  // Use unsigned 32-bit; >>> 0 keeps it positive.
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

function matchCidr(ipInt, cidr) {
  const [base, prefixStr] = cidr.split('/');
  if (!isIpv4(base)) return false;
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  if (prefix === 0) return true;          // 0.0.0.0/0 matches everything
  const baseInt = ipv4ToInt(base);
  const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

/**
 * Returns true iff `ip` matches any entry in `allowList`. An empty or absent
 * allowList means "no rule configured" - the caller decides what that means
 * (the punch endpoint treats empty as "IP lock disabled, allow all").
 */
function ipMatchesAny(ip, allowList) {
  if (!Array.isArray(allowList) || allowList.length === 0) return false;
  const normIp = normalizeIp(ip);
  if (!normIp) return false;

  // IPv4 fast path
  if (isIpv4(normIp)) {
    const ipInt = ipv4ToInt(normIp);
    for (const entry of allowList) {
      const raw = String(entry || '').trim();
      if (!raw) continue;
      if (raw.includes('/')) {
        if (matchCidr(ipInt, raw)) return true;
      } else if (isIpv4(raw)) {
        if (ipv4ToInt(raw) === ipInt) return true;
      } else if (normalizeIp(raw) === normIp) {
        // ipv6-mapped or other format → string compare
        return true;
      }
    }
    return false;
  }

  // IPv6 - exact match only.
  for (const entry of allowList) {
    if (normalizeIp(entry) === normIp) return true;
  }
  return false;
}

/**
 * Validate a single allowlist entry. Returns null if valid, error string otherwise.
 * Used by SystemSettings PUT to reject typos before save.
 */
function validateAllowListEntry(entry) {
  const raw = String(entry || '').trim();
  if (!raw) return 'Entry is empty';
  if (raw.includes('/')) {
    const [base, prefixStr] = raw.split('/');
    if (!isIpv4(base)) return `Invalid CIDR base "${base}"`;
    const prefix = Number(prefixStr);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
      return `Invalid CIDR prefix "/${prefixStr}"`;
    }
    return null;
  }
  if (isIpv4(raw)) return null;
  // Accept anything that round-trips through normalizeIp() and isn't empty
  // (lenient IPv6 acceptance for now).
  if (normalizeIp(raw)) return null;
  return `Unrecognized IP/CIDR "${raw}"`;
}

module.exports = {
  ipMatchesAny,
  validateAllowListEntry,
  normalizeIp,
  // Exposed for tests:
  _internals: { isIpv4, ipv4ToInt, matchCidr }
};
