const xml2js = require('xml2js');

/** Codepoints legal in XML 1.0: #x9, #xA, #xD, #x20–#xD7FF, #xE000–#xFFFD, #x10000–#x10FFFF. */
function isIllegalXmlChar(n) {
  return !(
    n === 0x9 || n === 0xA || n === 0xD ||
    (n >= 0x20 && n <= 0xD7FF) ||
    (n >= 0xE000 && n <= 0xFFFD) ||
    (n >= 0x10000 && n <= 0x10FFFF)
  );
}

/**
 * Sanitize a raw Tally XML string. Tally Prime injects hidden ASCII control
 * characters (e.g. `&#4;`) into blank/default fields, which makes strict XML
 * parsers throw `xmlParseCharRef: invalid xmlChar value 4`. It also prefixes a
 * Byte Order Mark / encoding garbage before `<ENVELOPE>`, which throws
 * `Non-whitespace before first tag`. This strips:
 *   - numeric character references (decimal `&#4;` and hex `&#x4;`) that resolve
 *     to control chars illegal in XML 1.0 (legal ones like `&#65;` are kept),
 *   - raw control characters in the same illegal range, and
 *   - the BOM / any bytes before the first real `<` tag.
 * Idempotent - safe to run more than once.
 */
function sanitizeTallyXml(xml) {
  if (typeof xml !== 'string') return '';
  let out = xml
    // Explicit belt-and-suspenders for the reported crash: catch EVERY form of
    // the char-4 reference - &#4; &#04; &#x4; &#X4; &#x04; &#X04; (any zero-pad).
    .replace(/&#[xX]?0*4;/g, '')
    // General pass: strip any decimal (&#N;) or hex (&#xN; / &#XN;) numeric ref
    // that resolves to a control char illegal in XML 1.0. Legal refs (&#65; = "A")
    // are kept. The [xX] makes the hex marker case-insensitive.
    .replace(/&#(\d+);/g, (m, d) => (isIllegalXmlChar(parseInt(d, 10)) ? '' : m))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (m, h) => (isIllegalXmlChar(parseInt(h, 16)) ? '' : m))
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  // Strip a UTF-8 BOM and any garbage that precedes the first XML tag.
  const firstTag = out.indexOf('<');
  if (firstTag > 0) out = out.slice(firstTag);
  return out;
}

/** Coerce an xml2js node (string | array | { _: text } | object) to plain text. */
function textOf(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return textOf(v[0]);
  if (typeof v === 'object') return v._ !== undefined ? String(v._) : null;
  return String(v);
}

/** Tally sometimes stores the display name under LANGUAGENAME.LIST > NAME.LIST > NAME. */
function langName(l) {
  try {
    const ln = l['LANGUAGENAME.LIST'];
    const lnNode = Array.isArray(ln) ? ln[0] : ln;
    const nl = lnNode && lnNode['NAME.LIST'];
    const nlNode = Array.isArray(nl) ? nl[0] : nl;
    return textOf(nlNode && nlNode.NAME);
  } catch {
    return null;
  }
}

/** Extract a ledger's name from any of the places Tally can put it. */
function ledgerName(l) {
  if (!l || typeof l !== 'object') return null;
  const inner = textOf(l.NAME);
  if (inner && inner.trim()) return inner.trim();
  const attr = l.$ && (l.$.NAME || l.$.Name);
  if (attr && String(attr).trim()) return String(attr).trim();
  const lang = langName(l);
  if (lang && lang.trim()) return lang.trim();
  return null;
}

function ledgerGuid(l) {
  const g = textOf(l && l.GUID);
  return g ? g.trim() : '';
}

function ledgerParent(l) {
  const p = textOf(l && l.PARENT);
  return p ? p.trim() : '';
}

/** Recursively collect every node stored under `tag` anywhere in the parsed tree. */
function collectByTag(node, tag, out) {
  if (Array.isArray(node)) {
    for (const n of node) collectByTag(n, tag, out);
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const [key, val] of Object.entries(node)) {
    if (key === tag) {
      if (Array.isArray(val)) out.push(...val);
      else out.push(val);
    } else if (val && typeof val === 'object') {
      collectByTag(val, tag, out);
    }
  }
}

/** Recursively collect every <LEDGER> node anywhere in the parsed tree. */
function collectLedgers(node, out) {
  collectByTag(node, 'LEDGER', out);
}

/**
 * Parse a Tally Masters XML string and return the ledgers it contains.
 * Handles both our own export envelope and Tally's native "List of Accounts"
 * export. Returns [{ name, guid, parent }], de-duplicated by name.
 */
async function parseTallyLedgers(xml) {
  const parser = new xml2js.Parser({ explicitArray: false, trim: true, explicitRoot: true });
  // Defensive: sanitize even if the caller forgot to (idempotent).
  const result = await parser.parseStringPromise(sanitizeTallyXml(xml));

  const rawLedgers = [];
  collectLedgers(result, rawLedgers);

  const out = [];
  const seen = new Set();
  for (const l of rawLedgers) {
    const name = ledgerName(l);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue; // Tally names are unique; keep the first
    seen.add(key);
    out.push({ name, guid: ledgerGuid(l), parent: ledgerParent(l) });
  }
  return out;
}

/**
 * Parse a Tally Masters XML string and return the GROUPS (sub-groups) it defines.
 * Returns [{ name, guid, parent }], de-duplicated by name. `parent` is the Tally
 * parent group the sub-group hangs under (used by the allow-list ingest).
 */
async function parseTallyGroups(xml) {
  const parser = new xml2js.Parser({ explicitArray: false, trim: true, explicitRoot: true });
  const result = await parser.parseStringPromise(sanitizeTallyXml(xml));

  const rawGroups = [];
  collectByTag(result, 'GROUP', rawGroups);

  const out = [];
  const seen = new Set();
  for (const g of rawGroups) {
    // GROUP nodes carry NAME / PARENT / GUID exactly like LEDGER nodes, so the
    // same extractors apply.
    const name = ledgerName(g);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue; // Tally names are unique; keep the first
    seen.add(key);
    out.push({ name, guid: ledgerGuid(g), parent: ledgerParent(g) });
  }
  return out;
}

module.exports = { parseTallyLedgers, parseTallyGroups, sanitizeTallyXml, collectByTag, collectLedgers, ledgerName, ledgerGuid, ledgerParent };
