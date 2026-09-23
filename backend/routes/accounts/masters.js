const express = require('express');
const multer = require('multer');
const ChartOfAccounts = require('../../models/ChartOfAccounts');
const AccountGroup = require('../../models/AccountGroup');
const Supplier = require('../../models/Supplier');
const Lead = require('../../models/Lead');
const SalesClaim = require('../../models/SalesClaim');
const auth = require('../../middleware/auth');
const { requireAccountsRole } = require('../../middleware/requireAccountsRole');
const { requirePostingRole } = require('../../middleware/requireAccountsRole');
const { toNumber } = require('../../utils/accounts/decimalHelpers');
const { buildLedgerMasterXml, buildChartOfAccountsXml, isReservedTallyGroup } = require('../../utils/tally/buildLedgerMaster');
const { parseTallyLedgers, parseTallyGroups, sanitizeTallyXml } = require('../../utils/tally/parseTallyMasters');
const { tallyParentToErpPrimary } = require('../../utils/tally/groupMapping');
const { isOperationalAccount, isOperationalGroup, isOperationalTallyParent, refreshOperationalScope } = require('../../utils/accounts/operationalScope');
const { isAllowedTallyParent } = require('../../config/tallyConfig');
const { ensureSeeded } = require('./accountGroups');

const router = express.Router();

// Tally XML uploads are parsed in memory - no need to persist the file.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20 MB is plenty for a masters export
});

const erpEffectiveName = (a) => (a.tallyLedgerName || `${a.code} - ${a.name}`);

/**
 * A Tally target is NOT a valid voucher-posting ledger - and so an ERP ledger
 * must never be linked to it - when it is:
 *   - the root itself or a primary ROOT account (empty parent, or parent
 *     "Primary" - e.g. "Profit & Loss A/c" sits directly under Primary), or
 *   - a reserved primary GROUP name (Current Assets, Sundry Debtors, …).
 * Only real leaf-node transaction ledgers are postable.
 */
function isNonPostableTallyTarget(name, parent) {
  const p = (parent || '').trim();
  const n = (name || '').trim();
  if (!p || /^primary$/i.test(p)) return true;   // root / primary root account
  if (isReservedTallyGroup(n)) return true;       // the target is itself a Group
  return false;
}

function streamXml(res, xml, filename) {
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(xml);
}

/**
 * Tally owns the group hierarchy. During an XML sync we auto-ingest each <GROUP>
 * whose Tally PARENT is whitelisted (config/tallyConfig.js) into our SubGroups
 * (AccountGroup) collection, so it's available for ledger assignment with NO user
 * intervention. Sub-groups under any other parent are dropped. Tally's own
 * reserved built-ins are never ingested (they already exist as fixed groups) and
 * existing sub-groups are never duplicated. Returns the count of NEW sub-groups.
 */
async function ingestAllowedSubGroups(tallyGroups, userId) {
  let created = 0;
  for (const g of (tallyGroups || [])) {
    const name = (g && g.name ? String(g.name) : '').trim();
    if (!name) continue;
    if (isReservedTallyGroup(name)) continue;        // never ingest a built-in group itself
    if (!isAllowedTallyParent(g.parent)) continue;   // only sub-groups under a whitelisted parent
    // Case-insensitive existence check - never duplicate an existing sub-group.
    const exists = await AccountGroup.findOne({
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    }).select('_id').lean();
    if (exists) continue;
    try {
      await AccountGroup.create({
        name,
        group: tallyParentToErpPrimary(g.parent),      // derive ERP primary from the Tally parent
        tallyParent: g.parent,                         // marks it Tally-owned + in operational scope
        isSystem: false,
        isActive: true,
        lastSyncedToTally: new Date(),                 // it already lives in Tally
        createdBy: userId
      });
      created++;
    } catch (e) { /* unique-name race - another request created it; fine */ }
  }
  return created;
}

/**
 * GET /counts - tiny summary for the UI (how many ledgers each export will contain).
 */
router.get('/counts', auth, requireAccountsRole, async (req, res) => {
  try {
    const [coa, suppliers, coaPendingRenames] = await Promise.all([
      ChartOfAccounts.countDocuments({ isActive: true }),
      Supplier.countDocuments({ status: 'active' }),
      ChartOfAccounts.countDocuments({
        isActive: true,
        $or: [
          { previousTallyLedgerName: { $nin: ['', null] } },
          { previousSubGroup: { $nin: ['', null] } }
        ]
      })
    ]);
    // Unique customer names from SalesClaim + Lead
    const claimNames = await SalesClaim.distinct('customerName', { customerName: { $nin: [null, ''] } });
    const leadNames = await Lead.distinct('customerName', { customerName: { $nin: [null, ''] } });
    const allNames = new Set([
      ...claimNames.map(s => s.trim().toLowerCase()),
      ...leadNames.map(s => s.trim().toLowerCase())
    ]);
    res.json({
      coa,
      suppliers,
      customers: allNames.size,
      coaPendingRenames,
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error fetching master counts:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /chart-of-accounts-xml - one-time export of the CoA as Tally ledger masters.
 * Run this ONCE after first setup so the client's Tally company has ledgers
 * matching our system's code/name. Subsequent re-runs use ACTION="Alter" to
 * refresh names without duplicating.
 */
router.get('/chart-of-accounts-xml', auth, requireAccountsRole, async (req, res) => {
  try {
    const alter = req.query.alter === 'true';
    await ensureSeeded();
    await refreshOperationalScope();
    const [allGroups, allAccounts] = await Promise.all([
      AccountGroup.find({ isActive: true }).sort({ group: 1, name: 1 }).lean(),
      ChartOfAccounts.find({ isActive: true }).sort({ group: 1, code: 1 }).lean()
    ]);
    // Bounded sync: only operational ledgers / sub-groups ever leave the ERP.
    // Pure-accounting accounts (Equity, Fixed Assets, …) are excluded so we never
    // overwrite the accountant's independent Tally data.
    const groups = allGroups.filter(isOperationalGroup);
    const accounts = allAccounts.filter(isOperationalAccount);
    if (accounts.length === 0) {
      return res.status(404).json({ message: 'No active operational ledgers in Chart of Accounts' });
    }

    // Rule 1: emit every referenced sub-group first so no ledger's parent is
    // missing. We include all sub-groups actually used by an exported ledger,
    // plus any custom (non-system) groups the AM created intentionally.
    const usedGroupNames = new Set(accounts.map(a => a.subGroup).filter(Boolean));
    const groupSpecs = groups
      // Never re-emit a Tally-owned (ingested) sub-group as a <GROUP> - Tally
      // already has it, under its real parent; re-creating it would clash.
      .filter(g => (usedGroupNames.has(g.name) || !g.isSystem) && !g.tallyParent)
      .map(g => ({
        id: String(g._id),
        name: g.name,
        group: g.group,
        previousName: g.previousName || ''
      }));

    const ledgerSpecs = accounts.map(a => ({
      // Emit <GUID> ONLY when we hold Tally's REAL GUID (captured via
      // reconciliation). Our Mongo _id is NOT a valid Tally GUID - sending it made
      // Tally treat every Alter as an unknown master and CREATE a duplicate. With
      // no GUID, Tally matches by NAME (same as the supplier/customer exports), so
      // Alter correctly updates the existing ledger.
      guid: a.tallyGuid || '',
      name: a.tallyLedgerName || `${a.code} - ${a.name}`,     // Rule 5: auto-name fallback
      code: a.code,
      displayName: a.name,
      previousName: a.previousTallyLedgerName || '',
      parent: a.subGroup,
      accountGroup: a.group,
      vatApplicable: !!a.vatApplicable,
      openingBalance: 0
    }));

    // buildChartOfAccountsXml: ALL groups first (mapped primary parent + GUID),
    // then ALL ledgers (GUID; opening balance only on Create).
    const { xml, ledgerCount, groupCount, renamedLedgers, renamedGroups, skippedReservedGroups } = buildChartOfAccountsXml({
      groups: groupSpecs, ledgers: ledgerSpecs, alter
    });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    res.setHeader('X-Ledger-Count', String(ledgerCount));
    res.setHeader('X-Group-Count', String(groupCount));
    res.setHeader('X-Skipped-Reserved-Groups', String(skippedReservedGroups || 0));
    res.setHeader('X-Renamed-Count', String(renamedLedgers + renamedGroups));
    streamXml(res, xml, `Tally-CoA-Masters-${stamp}.xml`);
  } catch (err) {
    console.error('Error exporting CoA XML:', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

/**
 * GET /chart-of-accounts-summary - a DRY RUN of the CoA masters export. Returns
 * control totals (new vs updated groups/ledgers) and pre-flight validation
 * warnings so the UI can show a summary + guardrail before downloading the XML.
 * Nothing is generated or mutated here.
 */
router.get('/chart-of-accounts-summary', auth, requireAccountsRole, async (req, res) => {
  try {
    await ensureSeeded();
    await refreshOperationalScope();
    const [allGroups, allAccounts] = await Promise.all([
      AccountGroup.find({ isActive: true }).lean(),
      ChartOfAccounts.find({ isActive: true }).lean()
    ]);
    // Bounded sync: the dry-run counts must match the export - operational only.
    const groups = allGroups.filter(isOperationalGroup);
    const accounts = allAccounts.filter(isOperationalAccount);

    // Mirror the export's group-selection EXACTLY: sub-groups referenced by a
    // ledger, plus any custom (non-system) group the AM created - then drop
    // Tally's reserved built-ins (Bank Accounts, Sundry Debtors, …), which the
    // XML generator never emits as <GROUP> tags. Without this the summary
    // over-counts groups (e.g. showing "15" when only the custom few are sent).
    const usedGroupNames = new Set(accounts.map(a => (a.subGroup || '').trim()).filter(Boolean));
    const groupNameSet = new Set(groups.map(g => g.name));
    const emittedGroups = groups.filter(g =>
      (usedGroupNames.has(g.name) || !g.isSystem) && !isReservedTallyGroup(g.name) && !g.tallyParent
    );

    // Count logic - "new" (never synced) vs "updated" (has a lastSyncedToTally).
    const isSynced = (r) => !!r.lastSyncedToTally;
    const newGroups = emittedGroups.filter(g => !isSynced(g)).length;
    const updatedGroups = emittedGroups.filter(isSynced).length;
    const newLedgers = accounts.filter(a => !isSynced(a)).length;
    const updatedLedgers = accounts.filter(isSynced).length;

    // ---- Validation ----
    const warnings = [];

    // CRITICAL: a ledger with no sub-group, or a sub-group that doesn't map to a
    // known Group (so Tally can't resolve its parent → "Referenced master missing").
    // "Primary" is Tally's reserved root group - always valid, never a mapping gap.
    const missingMapping = accounts.filter(a => {
      const sg = (a.subGroup || '').trim();
      if (sg.toLowerCase() === 'primary') return false;
      return !sg || !groupNameSet.has(sg);
    });
    if (missingMapping.length > 0) {
      warnings.push({
        type: 'critical',
        message: `${missingMapping.length} Ledger${missingMapping.length === 1 ? ' is' : 's are'} missing a Primary Group Mapping.`,
        codes: missingMapping.slice(0, 20).map(a => a.code)
      });
    }

    // CRITICAL: duplicate Tally ledger names (Tally requires unique names).
    const nameCounts = new Map();
    for (const a of accounts) {
      const nm = (a.tallyLedgerName || `${a.code} - ${a.name}`).trim().toLowerCase();
      nameCounts.set(nm, (nameCounts.get(nm) || 0) + 1);
    }
    const dupNames = [...nameCounts.values()].filter(c => c > 1).length;
    if (dupNames > 0) {
      warnings.push({
        type: 'critical',
        message: `${dupNames} duplicate Tally ledger name${dupNames === 1 ? '' : 's'} found. Tally requires unique names.`
      });
    }

    // CRITICAL: a ledger whose Tally-facing name IS a reserved group name (e.g.
    // "Sundry Debtors"). Tally can't create a ledger named after a built-in group,
    // so it silently fails to sync (shows "will sync" but never captures a GUID).
    const reservedNameLedgers = accounts.filter(a =>
      isReservedTallyGroup((a.tallyLedgerName || `${a.code} - ${a.name}`).trim())
    );
    if (reservedNameLedgers.length > 0) {
      warnings.push({
        type: 'critical',
        message: `${reservedNameLedgers.length} ledger${reservedNameLedgers.length === 1 ? ' is' : 's are'} named after a reserved Tally group (e.g. "Sundry Debtors"). Tally can't hold a ledger with a group's name, so it won't sync — rename it (e.g. "Trade Debtors (Control)").`,
        codes: reservedNameLedgers.slice(0, 20).map(a => a.code)
      });
    }

    // NOTICE: VAT applicable but no rate set.
    const blankVat = accounts.filter(a => a.vatApplicable && !(toNumber(a.vatRate) > 0));
    if (blankVat.length > 0) {
      warnings.push({
        type: 'notice',
        message: `${blankVat.length} Ledger${blankVat.length === 1 ? ' has' : 's have'} a blank VAT rate.`,
        codes: blankVat.slice(0, 20).map(a => a.code)
      });
    }

    const hasCritical = warnings.some(w => w.type === 'critical');

    res.json({
      status: 'success',
      data: {
        scope: {
          exportType: 'Chart of Accounts (Masters)',
          totalRecords: emittedGroups.length + accounts.length,
          totalGroups: emittedGroups.length,
          totalLedgers: accounts.length
        },
        mastersSummary: { newGroups, updatedGroups, newLedgers, updatedLedgers },
        validation: {
          isReady: !hasCritical,
          warnings
        }
      }
    });
  } catch (err) {
    console.error('Error building CoA export summary:', err);
    res.status(500).json({ status: 'error', message: err.message || 'Server error' });
  }
});

/**
 * GET /suppliers-xml - every active supplier as a Tally party-ledger master
 * under the "Sundry Creditors" group, with TRN mapped to PARTYGSTIN.
 */
router.get('/suppliers-xml', auth, requireAccountsRole, async (req, res) => {
  try {
    const alter = req.query.alter === 'true';
    const suppliers = await Supplier.find({ status: 'active' })
      .sort({ name: 1 })
      .lean();
    if (suppliers.length === 0) {
      return res.status(404).json({ message: 'No active suppliers to export' });
    }

    const specs = suppliers.map(s => ({
      name: s.name,
      parent: 'Sundry Creditors',
      accountGroup: 'Liabilities',
      trn: s.trn,
      contact: s.contactPerson,
      phone: s.phone,
      email: s.email,
      address: s.address,
      alterIfExisting: alter
    }));

    const { xml, ledgerCount } = buildLedgerMasterXml(specs);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    res.setHeader('X-Ledger-Count', String(ledgerCount));
    streamXml(res, xml, `Tally-Supplier-Masters-${stamp}.xml`);
  } catch (err) {
    console.error('Error exporting supplier XML:', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

/**
 * GET /customers-xml - every unique customer (from Lead.customerName +
 * SalesClaim.customerName) as a Tally party-ledger master under
 * "Sundry Debtors". TRN is taken from SalesClaim when available.
 *
 * Dedupe is case-insensitive on customerName.
 */
router.get('/customers-xml', auth, requireAccountsRole, async (req, res) => {
  try {
    const alter = req.query.alter === 'true';

    const claims = await SalesClaim.find({ customerName: { $nin: [null, ''] } })
      .select('customerName customerTRN')
      .sort({ claimDate: -1 })
      .lean();
    const leads = await Lead.find({ customerName: { $nin: [null, ''] } })
      .select('customerName projectTitle')
      .lean();

    const byKey = new Map(); // lowercase name -> { name, trn }
    // Claims first so their TRN wins when there's a conflict
    for (const c of claims) {
      const key = c.customerName.trim().toLowerCase();
      if (!byKey.has(key)) byKey.set(key, { name: c.customerName.trim(), trn: c.customerTRN || '' });
    }
    for (const l of leads) {
      const key = l.customerName.trim().toLowerCase();
      if (!byKey.has(key)) byKey.set(key, { name: l.customerName.trim(), trn: '' });
    }

    if (byKey.size === 0) {
      return res.status(404).json({ message: 'No customers found in Leads or Sales Claims' });
    }

    const specs = Array.from(byKey.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(c => ({
        name: c.name,
        parent: 'Sundry Debtors',
        accountGroup: 'Assets',
        trn: c.trn || undefined,
        alterIfExisting: alter
      }));

    const { xml, ledgerCount } = buildLedgerMasterXml(specs);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    res.setHeader('X-Ledger-Count', String(ledgerCount));
    streamXml(res, xml, `Tally-Customer-Masters-${stamp}.xml`);
  } catch (err) {
    console.error('Error exporting customer XML:', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

/**
 * POST /chart-of-accounts-renames-ack - acknowledge that the CoA masters export
 * was imported into Tally successfully. This:
 *   1. Clears rename markers (re-sending a completed rename is what duplicates), and
 *   2. Stamps lastSyncedToTally on every active group + ledger, so the pre-export
 *      summary can report them as "updated" (already in Tally) rather than "new".
 * Must be called only AFTER a confirmed import.
 */
router.post('/chart-of-accounts-renames-ack', auth, requirePostingRole, async (req, res) => {
  try {
    const now = new Date();
    const [ledResult, grpResult] = await Promise.all([
      ChartOfAccounts.updateMany(
        { isActive: true },
        { $set: { previousTallyLedgerName: '', previousSubGroup: '', lastSyncedToTally: now } }
      ),
      AccountGroup.updateMany(
        { isActive: true },
        { $set: { previousName: '', lastSyncedToTally: now } }
      )
    ]);
    res.json({
      cleared: (ledResult.modifiedCount ?? ledResult.nModified ?? 0),
      ledgersSynced: (ledResult.modifiedCount ?? ledResult.nModified ?? 0),
      groupsSynced: (grpResult.modifiedCount ?? grpResult.nModified ?? 0)
    });
  } catch (err) {
    console.error('Error acknowledging CoA export:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /import-tally-masters - upload a Tally Masters XML export and reconcile it
 * against our Chart of Accounts. Parses every <LEDGER> (name + GUID), then:
 *   - autoMatched:            Tally name === our effective ledger name (exact, ci)
 *   - unmatchedErpRecords:    our ledgers with no Tally counterpart
 *   - unmatchedTallyRecords:  Tally ledgers with no ERP counterpart
 * This is read-only (no DB writes) - the user confirms links via /sync-guids.
 */
router.post('/import-tally-masters', auth, requireAccountsRole, upload.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ status: 'error', message: 'No XML file uploaded (field name must be "file").' });
    }

    // Tally Prime injects hidden control chars (e.g. &#4;) into blank fields, which
    // crashes strict XML parsers. Sanitize the raw string BEFORE parsing, and keep
    // the cleaned copy to return so the accountant can download a fixed file.
    const rawXmlString = req.file.buffer.toString('utf8');
    const cleanXml = sanitizeTallyXml(rawXmlString);

    let tallyLedgers;
    try {
      tallyLedgers = await parseTallyLedgers(cleanXml);
    } catch (e) {
      return res.status(400).json({ status: 'error', message: `Could not parse the XML file: ${e.message}` });
    }
    if (tallyLedgers.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No <LEDGER> records were found in the uploaded file.' });
    }

    // Tally owns the hierarchy: scan <GROUP> tags and silently ingest any
    // sub-group under a whitelisted operational parent (config/tallyConfig.js).
    // Non-fatal - reconciliation of ledgers proceeds even if this fails.
    let subGroupsIngested = 0;
    try {
      const tallyGroups = await parseTallyGroups(cleanXml);
      subGroupsIngested = await ingestAllowedSubGroups(tallyGroups, req.user.userId);
    } catch (e) {
      console.error('Sub-group ingest skipped:', e.message);
    }
    // Refresh the operational-scope set so ledgers under any ingested sub-group
    // (new this sync or from a prior one) count as in-scope below.
    await refreshOperationalScope();

    const accounts = await ChartOfAccounts.find({ isActive: true }).lean();

    // --- GUID Shield -----------------------------------------------------
    // Any Tally ledger whose GUID already lives on an ERP ledger is "already
    // synced" - surfaced read-only and kept OUT of the match/orphan/bulk queues
    // so it can't be accidentally re-mapped or re-imported.
    const erpByGuid = new Map();
    for (const a of accounts) { if (a.tallyGuid) erpByGuid.set(a.tallyGuid, a); }

    const alreadySynced = [];
    const freshTally = [];
    for (const t of tallyLedgers) {
      const erp = t.guid && erpByGuid.get(t.guid);
      if (erp) {
        alreadySynced.push({
          erpId: String(erp._id), code: erp.code, erpName: erpEffectiveName(erp),
          tallyName: t.name, tallyGuid: t.guid, parent: t.parent || 'Primary',
          group: erp.group, subGroup: erp.subGroup, mappedGroup: tallyParentToErpPrimary(t.parent)
        });
      } else {
        freshTally.push(t);
      }
    }
    const syncedErpIds = new Set(alreadySynced.map(x => x.erpId));
    // Only ERP ledgers not already GUID-synced against this file are evaluated.
    const erpPool = accounts.filter(a => !syncedErpIds.has(String(a._id)));

    // Index the FRESH (not-yet-synced) Tally ledgers by name for exact match.
    const tallyByName = new Map();
    for (const t of freshTally) {
      if (!tallyByName.has(t.name.toLowerCase())) tallyByName.set(t.name.toLowerCase(), t);
    }

    const autoMatched = [];
    const unmatchedErpRecords = [];
    const matchedTallyKeys = new Set();

    for (const a of erpPool) {
      const eff = erpEffectiveName(a);
      const hit = tallyByName.get(eff.trim().toLowerCase());
      if (hit) {
        matchedTallyKeys.add(hit.name.toLowerCase());
        autoMatched.push({
          erpId: String(a._id), code: a.code, erpName: eff,
          tallyName: hit.name, tallyGuid: hit.guid || '', parent: hit.parent || 'Primary',
          group: a.group, subGroup: a.subGroup, mappedGroup: tallyParentToErpPrimary(hit.parent),
          postable: !isNonPostableTallyTarget(hit.name, hit.parent),
          alreadyLinked: false
        });
      } else {
        unmatchedErpRecords.push({
          erpId: String(a._id), code: a.code, erpName: eff, name: a.name,
          group: a.group, subGroup: a.subGroup, currentGuid: a.tallyGuid || ''
        });
      }
    }

    const unmatchedTallyRecords = freshTally
      .filter(t => !matchedTallyKeys.has(t.name.toLowerCase()))
      .map(t => ({
        tallyName: t.name, tallyGuid: t.guid || '', parent: t.parent || 'Primary',
        mappedGroup: tallyParentToErpPrimary(t.parent),
        postable: !isNonPostableTallyTarget(t.name, t.parent),
        // Out of ERP scope = a pure-accounting group (Equity, Fixed Assets,
        // Depreciation, …) the ERP never touches. Shown read-only; never linked
        // or bulk-imported, so we don't pull the accountant's data into the ERP.
        outOfScope: !isOperationalTallyParent(t.parent)
      }));
    const outOfScopeCount = unmatchedTallyRecords.filter(t => t.outOfScope).length;

    res.json({
      status: 'success',
      data: {
        summary: {
          tallyTotal: tallyLedgers.length,
          erpTotal: accounts.length,
          alreadySynced: alreadySynced.length,
          autoMatched: autoMatched.length,
          unmatchedErp: unmatchedErpRecords.length,
          unmatchedTally: unmatchedTallyRecords.length,
          outOfScopeTally: outOfScopeCount,
          subGroupsIngested
        },
        alreadySynced,
        autoMatched,
        unmatchedErpRecords,
        unmatchedTallyRecords,
        // The sanitized XML, so the accountant can download a cleaned copy.
        sanitizedXmlString: cleanXml
      }
    });
  } catch (err) {
    console.error('Error importing Tally masters:', err);
    res.status(500).json({ status: 'error', message: err.message || 'Server error' });
  }
});

/**
 * POST /sync-guids - lock in reconciliation. Body: { mappings: [{ erpId, tallyGuid, tallyName? }] }.
 * Stores each Tally GUID on the matching ERP ledger so future exports carry that
 * GUID and Tally updates the existing record in place. When tallyName is provided
 * (a manual link where names differ) we also adopt it as the ledger's Tally name,
 * so the export matches Tally's existing baseline exactly.
 */
router.post('/sync-guids', auth, requirePostingRole, async (req, res) => {
  try {
    const mappings = Array.isArray(req.body?.mappings) ? req.body.mappings : [];
    if (mappings.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No mappings provided.' });
    }
    await refreshOperationalScope();  // recognise ingested sub-groups as in-scope

    // Load the ERP ledgers being mapped, to cross-validate groups + tally distribution.
    const erpIds = mappings.map(m => m && m.erpId).filter(Boolean);
    const erpDocs = await ChartOfAccounts.find({ _id: { $in: erpIds } }).select('group code name').lean();
    const erpById = new Map(erpDocs.map(d => [String(d._id), d]));

    // Type-safety guardrail (hard reject): an ERP ledger may only be linked to a
    // real, postable Tally LEDGER - never to a Tally Group or a primary root
    // account (Primary, Profit & Loss A/c, …). Cross-CATEGORY links (Asset ↔
    // Expense) are deliberately NOT blocked here - the UI filters them by default
    // and warns before saving an Advanced-Override cross-category mapping.
    const invalidTargets = [];
    for (const m of mappings) {
      if (isNonPostableTallyTarget(m && m.tallyName, m && m.tallyParent)) {
        invalidTargets.push({ erpId: m && m.erpId, tallyName: (m && m.tallyName) || '', tallyParent: (m && m.tallyParent) || '' });
      }
    }
    if (invalidTargets.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid Mapping: Cannot link an ERP ledger directly to a Tally group.',
        invalidTargets
      });
    }

    // Scope guardrail (hard reject): never bind an ERP ledger to an out-of-scope
    // Tally ledger (Equity, Fixed Assets, Depreciation, …). Keeps the sync bounded
    // so we don't start round-tripping the accountant's pure-accounting data.
    const outOfScope = mappings.filter(m => m && m.tallyParent && !isOperationalTallyParent(m.tallyParent));
    if (outOfScope.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Out of scope: these Tally ledgers belong to pure-accounting groups the ERP does not manage. They are the accountant\'s to maintain.',
        outOfScope: outOfScope.map(m => ({ erpId: m.erpId, tallyName: m.tallyName || '', tallyParent: m.tallyParent || '' }))
      });
    }

    let updated = 0;
    const errors = [];
    const distribution = {};
    for (const m of mappings) {
      const erpId = m && m.erpId;
      const tallyGuid = m && m.tallyGuid ? String(m.tallyGuid).trim() : '';
      if (!erpId || !tallyGuid) continue;
      const set = { tallyGuid };
      if (m.tallyName && String(m.tallyName).trim()) {
        set.tallyLedgerName = String(m.tallyName).trim();
        set.tallyLedgerNameAuto = false;
      }
      try {
        const r = await ChartOfAccounts.updateOne({ _id: erpId }, { $set: set });
        if (r.matchedCount > 0 || r.n > 0) {
          updated++;
          const g = erpById.get(String(erpId))?.group || 'Uncategorized';
          distribution[g] = (distribution[g] || 0) + 1;
        }
      } catch (e) {
        errors.push({ erpId, message: e.message });
      }
    }

    res.json({
      status: 'success',
      updated,
      summary: { totalProcessed: updated, distribution, errors }
    });
  } catch (err) {
    console.error('Error syncing GUIDs:', err);
    res.status(500).json({ status: 'error', message: err.message || 'Server error' });
  }
});

/**
 * Derive the ERP primary group for a Tally parent. Prefers an existing
 * AccountGroup's classification (keeps consistency with already-known groups),
 * then the shared reverse-mapping dictionary, finally 'Uncategorized'.
 */
function derivePrimaryFromParent(parent, agByName) {
  const key = (parent || '').trim().toLowerCase();
  const ag = key && agByName.get(key);
  if (ag && ag.group) return ag.group;
  return tallyParentToErpPrimary(parent);
}

/** Generate a unique, uppercase ChartOfAccounts code from a name, avoiding collisions. */
function uniqueCode(name, existingCodes) {
  // Trim separators AFTER truncation so a code never ends in a stray hyphen.
  let base = 'TLY-' + String(name || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 36).replace(/^-+|-+$/g, '');
  if (base === 'TLY-' || base === 'TLY') base = 'TLY-LEDGER';
  let code = base;
  let n = 2;
  while (existingCodes.has(code)) { code = `${base}-${n++}`; }
  existingCodes.add(code);
  return code;
}

/**
 * POST /bulk-import-unlinked - create ERP ledgers from orphaned Tally ledgers.
 * Body: { ledgers: [{ name, guid, parent }] }. For each: maps NAME → name +
 * tallyLedgerName, PARENT → subGroup (default 'Primary'), derives the primary
 * group, ensures the sub-group exists, and stores the Tally GUID so the record
 * is permanently synced. Skips names/GUIDs that already exist.
 */
router.post('/bulk-import-unlinked', auth, requirePostingRole, async (req, res) => {
  try {
    const ledgers = Array.isArray(req.body?.ledgers) ? req.body.ledgers : [];
    if (ledgers.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No ledgers provided.' });
    }
    await ensureSeeded();
    await refreshOperationalScope();  // recognise ingested sub-groups as in-scope

    const [existing, groups] = await Promise.all([
      ChartOfAccounts.find({}).select('code tallyLedgerName tallyGuid').lean(),
      AccountGroup.find({}).select('name group').lean()
    ]);
    const existingCodes = new Set(existing.map(a => a.code));
    const existingGuids = new Set(existing.filter(a => a.tallyGuid).map(a => a.tallyGuid));
    // Dedupe against the EFFECTIVE ledger name (same as import-tally-masters matching).
    const existingNames = new Set(existing.map(a => (a.tallyLedgerName || `${a.code} - ${a.name}`).trim().toLowerCase()).filter(Boolean));
    const agByName = new Map(groups.map(g => [g.name.toLowerCase(), g]));

    const toCreate = [];
    const skipped = [];
    const newGroups = new Map(); // parentLower -> { name, group }

    for (const led of ledgers) {
      const name = (led && led.name ? String(led.name) : '').trim();
      const guid = (led && led.guid ? String(led.guid) : '').trim();
      if (!name) { skipped.push({ name, reason: 'missing name' }); continue; }
      if (guid && existingGuids.has(guid)) { skipped.push({ name, reason: 'GUID already exists' }); continue; }
      if (existingNames.has(name.toLowerCase())) { skipped.push({ name, reason: 'name already exists' }); continue; }

      const parent = ((led && led.parent ? String(led.parent) : '').trim()) || 'Primary';
      // Never pull a pure-accounting ledger (Equity, Fixed Assets, Depreciation,
      // …) into the ERP - it stays the accountant's to manage.
      if (!isOperationalTallyParent(parent)) { skipped.push({ name, reason: 'out of scope (non-operational group)' }); continue; }
      const group = derivePrimaryFromParent(parent, agByName);
      const code = uniqueCode(name, existingCodes);

      // Resolve the CANONICAL sub-group name so the stored subGroup matches the
      // AccountGroup name exactly (case-sensitive downstream). Ensure the group
      // exists (skip Tally's reserved root "Primary", which always exists).
      const pKey = parent.toLowerCase();
      let canonicalParent;
      if (pKey === 'primary') {
        canonicalParent = 'Primary';
      } else if (agByName.has(pKey)) {
        canonicalParent = agByName.get(pKey).name;
      } else if (newGroups.has(pKey)) {
        canonicalParent = newGroups.get(pKey).name;
      } else {
        canonicalParent = parent;
        newGroups.set(pKey, { name: parent, group, isSystem: false, createdBy: req.user.userId });
      }

      toCreate.push({
        code, name, tallyLedgerName: name, tallyLedgerNameAuto: false,
        group, subGroup: canonicalParent, tallyGuid: guid, lastSyncedToTally: new Date(),
        currency: 'AED', isActive: true, createdBy: req.user.userId
      });
      existingGuids.add(guid);
      existingNames.add(name.toLowerCase());
    }

    if (newGroups.size > 0) {
      try { await AccountGroup.insertMany([...newGroups.values()], { ordered: false }); } catch (e) { /* dup races ok */ }
    }

    let inserted = [];
    if (toCreate.length > 0) {
      try {
        inserted = await ChartOfAccounts.insertMany(toCreate, { ordered: false });
      } catch (e) {
        // Partial insert - recover whatever made it in by the codes we generated.
        console.error('Bulk import partial error:', e.message);
        inserted = await ChartOfAccounts.find({ code: { $in: toCreate.map(d => d.code) } }).lean();
      }
    }

    const created = inserted.map(d => ({
      erpId: String(d._id),
      code: d.code,
      name: d.name,
      tallyLedgerName: d.tallyLedgerName,
      tallyGuid: d.tallyGuid,
      subGroup: d.subGroup,
      group: d.group
    }));

    // Distribution of created ledgers by ERP primary group (for the result modal).
    const distribution = {};
    for (const c of created) { distribution[c.group] = (distribution[c.group] || 0) + 1; }

    res.json({
      status: 'success',
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped,
      summary: {
        totalProcessed: created.length,
        distribution,
        skipped: skipped.length,
        errors: []
      }
    });
  } catch (err) {
    console.error('Error bulk-importing unlinked ledgers:', err);
    res.status(500).json({ status: 'error', message: err.message || 'Server error' });
  }
});

module.exports = router;
