const { escapeXml, tallyDate, buildMultiVoucherEnvelope, checksum } = require('./xmlBuilder');

// Tally auto-infers Dr/Cr nature from the parent group, but ISDEEMEDPOSITIVE
// makes the intent explicit at import time.
const DEBIT_GROUPS = new Set(['Assets', 'Expenses']);

// Rule 2: map our internal primary classification to the EXACT Tally reserved
// primary-group name. Our sub-groups are created UNDER these, so they always
// have a valid parent that already exists in a fresh Tally company.
const tallyPrimaryGroups = {
  Assets: 'Current Assets',
  Liabilities: 'Current Liabilities',
  Income: 'Indirect Incomes',
  Expenses: 'Indirect Expenses',
  Equity: 'Capital Account',
  // Unclassified imports sit under Tally's built-in Suspense A/c.
  Uncategorized: 'Suspense A/c'
};

// Tally ships 28 reserved/built-in system groups. They cannot be created or
// altered (doing so crashes the import with "already a child of this!" /
// "Cannot change parent of Group!"). We must NEVER emit a <GROUP> tag for these
// - but they MAY be referenced in a ledger's <PARENT> (they already exist).
const TALLY_RESERVED_GROUPS = [
  'Primary', 'Capital Account', 'Current Assets', 'Current Liabilities',
  'Fixed Assets', 'Investments', 'Loans (Liability)', 'Suspense A/c',
  'Miscellaneous Expenses (ASSET)', 'Branch / Divisions', 'Sales Accounts',
  'Purchase Accounts', 'Direct Incomes', 'Direct Expenses', 'Indirect Incomes',
  'Indirect Expenses', 'Reserves & Surplus', 'Bank Accounts', 'Cash-in-Hand',
  'Deposits (Asset)', 'Loans & Advances (Asset)', 'Stock-in-Hand',
  'Sundry Debtors', 'Duties & Taxes', 'Provisions', 'Sundry Creditors',
  'Bank OCC A/c', 'Bank OD A/c'
];
const TALLY_RESERVED_GROUPS_SET = new Set(TALLY_RESERVED_GROUPS.map(g => g.toLowerCase()));

/** True if a group name is one of Tally's reserved/built-in system groups. */
function isReservedTallyGroup(name) {
  return TALLY_RESERVED_GROUPS_SET.has(String(name || '').trim().toLowerCase());
}

/**
 * Render one <LEDGER> element. `spec` may contain:
 *   name - required (becomes NAME + LEDGERNAME)
 *   parent - required (Tally parent group, e.g. "Sundry Creditors")
 *   isDebit - optional override; else inferred from accountGroup
 *   accountGroup - 'Assets'|'Liabilities'|'Income'|'Expenses'|'Equity'
 *   openingBalance - default 0
 *   trn - optional UAE TRN (goes into PARTYGSTIN)
 *   contact - optional contact person
 *   phone - optional
 *   email - optional
 *   address - optional string (split to lines)
 *   vatApplicable - optional boolean (sets GSTDETAILS)
 *   vatRate - optional number
 *   alterIfExisting - if true, emits ACTION="Alter" so Tally updates an existing ledger
 *   previousName - optional: the name Tally CURRENTLY holds. When present and
 *                    different from `name`, this is a RENAME - the NAME attribute
 *                    carries the OLD name (so Tally finds the record) and the
 *                    inner <NAME> carries the NEW name. Forces ACTION="Alter".
 *   guid - optional: stable unique id (our DB _id) → <GUID>. Prevents
 *                    duplicates when re-importing into a live Tally company.
 *   code, displayName - optional: used for the Rule 5 auto-name fallback when
 *                    `name` is empty (`${code} - ${displayName}`).
 *
 * Rule 4: OPENINGBALANCE is emitted ONLY for ACTION="Create" - never on Alter,
 * so re-syncing an existing ledger can't overwrite its live balance.
 */
function ledgerXml(spec) {
  const parent = spec.parent || 'Primary';
  const isDebit = typeof spec.isDebit === 'boolean'
    ? spec.isDebit
    : DEBIT_GROUPS.has(spec.accountGroup);
  const opening = spec.openingBalance || 0;
  // Rule 5: fall back to `${code} - ${displayName}` when no explicit name given.
  const ledgerName = (spec.name && String(spec.name).trim())
    || (spec.code && spec.displayName ? `${spec.code} - ${spec.displayName}` : spec.name);
  const isRename = spec.previousName && spec.previousName !== ledgerName;
  // The lookup key Tally uses to find the existing record: OLD name on a rename.
  const findName = isRename ? spec.previousName : ledgerName;
  const action = (isRename || spec.alterIfExisting) ? 'Alter' : 'Create';

  const addressLines = spec.address
    ? String(spec.address).split(/\n|,\s{2,}/).map(s => s.trim()).filter(Boolean).slice(0, 4)
    : [];

  const addressBlock = addressLines.length
    ? `
            <ADDRESS.LIST TYPE="String">${addressLines.map(l => `
              <ADDRESS>${escapeXml(l)}</ADDRESS>`).join('')}
            </ADDRESS.LIST>`
    : '';

  const gstBlock = spec.trn
    ? `
            <COUNTRYOFRESIDENCE>United Arab Emirates</COUNTRYOFRESIDENCE>
            <PARTYGSTIN>${escapeXml(spec.trn)}</PARTYGSTIN>
            <GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>`
    : '';

  const contactBlock = [
    spec.contact && `<LEDGERCONTACT>${escapeXml(spec.contact)}</LEDGERCONTACT>`,
    spec.phone && `<LEDGERMOBILE>${escapeXml(spec.phone)}</LEDGERMOBILE>`,
    spec.phone && `<LEDGERPHONE>${escapeXml(spec.phone)}</LEDGERPHONE>`,
    spec.email && `<EMAIL>${escapeXml(spec.email)}</EMAIL>`
  ].filter(Boolean).map(s => '\n            ' + s).join('');

  const vatBlock = spec.vatApplicable
    ? `
            <ISGSTAPPLICABLE>Applicable</ISGSTAPPLICABLE>
            <GSTAPPLICABLEFROM>${tallyDate(new Date())}</GSTAPPLICABLEFROM>`
    : '';

  // Rule 4: opening balance ONLY on Create.
  const openingBlock = action === 'Create'
    ? `\n            <OPENINGBALANCE>${Number(opening).toFixed(2)}</OPENINGBALANCE>`
    : '';
  // Rule 3: inject the DB _id as the Tally GUID when provided.
  const guidBlock = spec.guid
    ? `\n            <GUID>${escapeXml(String(spec.guid))}</GUID>`
    : '';

  return `          <LEDGER NAME="${escapeXml(findName)}" ACTION="${action}">
            <NAME>${escapeXml(ledgerName)}</NAME>
            <PARENT>${escapeXml(parent)}</PARENT>
            <ISDEEMEDPOSITIVE>${isDebit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>${openingBlock}${guidBlock}${contactBlock}${gstBlock}${vatBlock}${addressBlock}
          </LEDGER>`;
}

/**
 * Render one <GROUP> element. `spec` may contain:
 *   name - required: the name Tally uses to FIND the group (OLD name on a rename)
 *   newName - optional: the NEW name (rename target). Defaults to `name`.
 *   parent - optional: parent group's CURRENT name. Omitted when absent so a
 *                   pure rename via ACTION="Alter" leaves the existing parent intact.
 *   alterIfExisting - if true (and not a rename), emits ACTION="Alter".
 *   guid - optional: stable unique id (our DB _id) → <GUID>.
 */
function groupXml(spec) {
  const isRename = spec.newName && spec.newName !== spec.name;
  const displayName = spec.newName || spec.name;
  const action = (isRename || spec.alterIfExisting) ? 'Alter' : 'Create';
  const parentBlock = spec.parent
    ? `\n            <PARENT>${escapeXml(spec.parent)}</PARENT>`
    : '';
  const guidBlock = spec.guid
    ? `\n            <GUID>${escapeXml(String(spec.guid))}</GUID>`
    : '';
  return `          <GROUP NAME="${escapeXml(spec.name)}" ACTION="${action}">
            <NAME>${escapeXml(displayName)}</NAME>${parentBlock}${guidBlock}
          </GROUP>`;
}

/**
 * Build the Chart-of-Accounts masters envelope for Tally, obeying the strict
 * architectural rules:
 *   Rule 1 - ALL <GROUP> messages are emitted first, then ALL <LEDGER> messages.
 *   Rule 2 - each group's <PARENT> is a mapped Tally reserved primary group.
 *   Rule 3 - every <GROUP> and <LEDGER> carries a <GUID> (our DB _id).
 *   Rule 4 - Alter mode strips <OPENINGBALANCE> (handled in ledgerXml).
 *   Rule 5 - ledger names fall back to `${code} - ${name}` (handled in ledgerXml).
 *
 * @param groups  [{ id, name, group, previousName? }] - our sub-groups
 * @param ledgers [{ guid, name, code, displayName, parent, accountGroup, vatApplicable, openingBalance, previousName? }]
 * @param alter   when true, everything is ACTION="Alter"
 */
function buildChartOfAccountsXml({ groups = [], ledgers = [], alter = false } = {}) {
  // Reserved Group Filter: never emit <GROUP> tags for Tally's built-in system
  // groups - Tally forbids creating/altering them (crashing the import). Only
  // our own custom sub-groups get a <GROUP>. Reserved names are still allowed as
  // ledger <PARENT> references below (they already exist in Tally).
  const emittableGroups = groups.filter(g => !isReservedTallyGroup(g.name));
  const skippedReservedGroups = groups.length - emittableGroups.length;

  // Group renames in this batch (old name -> new name) for parent cascade.
  // Only non-reserved groups can be renamed, so derive the map from those.
  const renameMap = new Map();
  for (const g of emittableGroups) {
    if (g.previousName && g.previousName !== g.name && !renameMap.has(g.previousName)) {
      renameMap.set(g.previousName, g.name);
    }
  }

  // Rule 1: GROUPS first. Rule 2: mapped primary parent. Rule 3: GUID.
  const groupElems = emittableGroups.map(g => groupXml({
    name: (g.previousName && g.previousName !== g.name) ? g.previousName : g.name,
    newName: g.name,
    parent: tallyPrimaryGroups[g.group] || 'Primary',
    guid: g.id,
    alterIfExisting: alter
  }));

  // A ledger cannot sit directly under Tally's root "Primary" group - Tally
  // rejects it with "Group 'Primary' does not exist!". Any ledger without a real
  // sub-group (empty, or the "Primary" placeholder from parent-less imports) is
  // routed to Tally's built-in "Suspense A/c", the standard bucket for
  // unclassified ledgers (a valid, always-present group).
  const resolveLedgerParent = (p) => {
    const resolved = (renameMap.get(p) || p || '').toString().trim();
    return (!resolved || /^primary$/i.test(resolved)) ? 'Suspense A/c' : resolved;
  };

  // Rule 1: LEDGERS second. Parent resolved through the group rename map so a
  // ledger still referencing an old sub-group name points at the new one.
  const ledgerElems = ledgers.map(l => ledgerXml({
    name: l.name,
    code: l.code,
    displayName: l.displayName,
    previousName: l.previousName,
    parent: resolveLedgerParent(l.parent),
    accountGroup: l.accountGroup,
    vatApplicable: l.vatApplicable,
    openingBalance: l.openingBalance,
    guid: l.guid,
    alterIfExisting: alter
  }));

  const xml = buildMultiVoucherEnvelope({
    voucherXmls: [...groupElems, ...ledgerElems],
    requestDesc: 'All Masters'
  });

  const renamedLedgers = ledgers.filter(l => l.previousName && l.previousName !== (l.name || `${l.code} - ${l.displayName}`)).length;
  return {
    xml,
    checksum: checksum(xml),
    groupCount: groupElems.length,
    ledgerCount: ledgerElems.length,
    renamedLedgers,
    renamedGroups: renameMap.size,
    skippedReservedGroups
  };
}

/**
 * Build the full Tally ledger-master XML envelope.
 * `ledgers` is an array of specs.
 */
function buildLedgerMasterXml(ledgers = []) {
  if (!Array.isArray(ledgers) || ledgers.length === 0) {
    throw new Error('buildLedgerMasterXml: no ledgers provided');
  }
  const ledgerElems = ledgers.map(ledgerXml);
  const xml = buildMultiVoucherEnvelope({
    voucherXmls: ledgerElems,
    requestDesc: 'All Masters'
  });
  return { xml, checksum: checksum(xml), ledgerCount: ledgers.length };
}

/**
 * Build a masters envelope that safely handles simultaneous renames of both
 * groups and ledgers.
 *
 * Each ledger spec may carry:
 *   name, previousName - ledger rename (see ledgerXml)
 *   parent, previousParent - the ledger's group + the group's OLD name
 *   accountGroup, vatApplicable, vatRate, alterIfExisting, ...
 *
 * Tally imports strictly top-to-bottom, so we emit ALL <GROUP> messages first
 * (renaming groups) and ALL <LEDGER> messages after. Because groups are renamed
 * earlier in the same file, every ledger's <PARENT> is resolved to the group's
 * CURRENT (new) name - otherwise Tally would report 'Referenced master missing'.
 */
function buildMastersXml(ledgerSpecs = [], _opts = {}) {
  if (!Array.isArray(ledgerSpecs) || ledgerSpecs.length === 0) {
    throw new Error('buildMastersXml: no ledgers provided');
  }

  // Derive the group renames present in this batch (old group name -> new name).
  // A ledger records its group's old name in `previousParent` when the user
  // renamed the group (by changing the ledger's subGroup).
  const renameMap = new Map();
  for (const s of ledgerSpecs) {
    if (s.previousParent && s.previousParent !== s.parent && !renameMap.has(s.previousParent)) {
      renameMap.set(s.previousParent, s.parent);
    }
  }

  // GROUPS first - one <GROUP> Alter per renamed group. If a renamed group's own
  // parent was also renamed in this batch, cascade to the parent's new name.
  const groupElems = [];
  for (const [oldName, newName] of renameMap.entries()) {
    groupElems.push(groupXml({ name: oldName, newName }));
  }

  // LEDGERS after - resolve each ledger's parent through the rename map so a
  // ledger still referencing the old group name is pointed at the new one.
  const ledgerElems = ledgerSpecs.map(s => ledgerXml({
    ...s,
    parent: renameMap.get(s.parent) || s.parent
  }));

  const xml = buildMultiVoucherEnvelope({
    voucherXmls: [...groupElems, ...ledgerElems],
    requestDesc: 'All Masters'
  });

  const renamedLedgers = ledgerSpecs.filter(s => s.previousName && s.previousName !== s.name).length;
  return {
    xml,
    checksum: checksum(xml),
    ledgerCount: ledgerElems.length,
    groupCount: groupElems.length,
    renamedLedgers,
    renamedGroups: renameMap.size
  };
}

module.exports = {
  buildLedgerMasterXml,
  buildMastersXml,
  buildChartOfAccountsXml,
  tallyPrimaryGroups,
  TALLY_RESERVED_GROUPS,
  isReservedTallyGroup,
  ledgerXml,
  groupXml
};
