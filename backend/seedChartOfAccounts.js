const mongoose = require('mongoose');
const ChartOfAccounts = require('./models/ChartOfAccounts');
require('dotenv').config();

// UAE-oriented default chart of accounts.
// `code` is our internal code; `tallyLedgerName` is the exact string that must
// match the ledger in the client's Tally company for XML imports to resolve.
const DEFAULT_CHART = [
  // === Assets ===
  { code: '1100-CASH',            name: 'Cash on Hand',                 group: 'Assets',      subGroup: 'Cash-in-Hand',        tallyLedgerName: 'Cash' },
  { code: '1200-BANK-OPERATING',  name: 'Bank - Operating Account',     group: 'Assets',      subGroup: 'Bank Accounts',       tallyLedgerName: 'Bank - Operating' },
  // Trade control ledgers. Their NAME must NOT equal the reserved Tally group it
  // sits under ("Sundry Debtors"/"Sundry Creditors") - Tally can't hold a ledger
  // named after a built-in group, so such a ledger is un-postable and never syncs.
  { code: '1300-AR-TRADE',        name: 'Trade Debtors (Control)',      group: 'Assets',      subGroup: 'Sundry Debtors',      tallyLedgerName: 'Trade Debtors (Control)' },
  { code: '1310-AR-RETENTION',    name: 'Retention Receivable',         group: 'Assets',      subGroup: 'Current Assets',      tallyLedgerName: 'Retention Receivable' },
  { code: '1400-INVENTORY-STOCK', name: 'Inventory - Site Materials',   group: 'Assets',      subGroup: 'Stock-in-Hand',       tallyLedgerName: 'Inventory - Site Materials' },
  { code: '1500-INPUT-VAT-5',     name: 'Input VAT 5%',                 group: 'Assets',      subGroup: 'Duties & Taxes',      tallyLedgerName: 'Input VAT 5%', vatApplicable: true, vatRate: '5' },
  { code: '1510-INPUT-VAT-RCM',   name: 'Input VAT - Reverse Charge',   group: 'Assets',      subGroup: 'Duties & Taxes',      tallyLedgerName: 'Input VAT RCM', vatApplicable: true, vatRate: '5' },

  // === Liabilities ===
  { code: '2100-AP-TRADE',        name: 'Trade Creditors (Control)',    group: 'Liabilities', subGroup: 'Sundry Creditors',    tallyLedgerName: 'Trade Creditors (Control)' },
  { code: '2200-SALARY-PAYABLE',  name: 'Salary Payable',               group: 'Liabilities', subGroup: 'Current Liabilities', tallyLedgerName: 'Salary Payable' },
  { code: '2210-WPS-PAYABLE',     name: 'WPS Clearing',                 group: 'Liabilities', subGroup: 'Current Liabilities', tallyLedgerName: 'WPS Clearing' },
  { code: '2300-OUTPUT-VAT-5',    name: 'Output VAT 5%',                group: 'Liabilities', subGroup: 'Duties & Taxes',      tallyLedgerName: 'Output VAT 5%', vatApplicable: true, vatRate: '5' },
  { code: '2310-OUTPUT-VAT-RCM',  name: 'Output VAT - Reverse Charge',  group: 'Liabilities', subGroup: 'Duties & Taxes',      tallyLedgerName: 'Output VAT RCM', vatApplicable: true, vatRate: '5' },
  { code: '2400-RETENTION-PAY',   name: 'Retention Payable',            group: 'Liabilities', subGroup: 'Current Liabilities', tallyLedgerName: 'Retention Payable' },

  // === Income ===
  { code: '4100-REV-CONTRACTING', name: 'Revenue - Contracting',        group: 'Income',      subGroup: 'Sales Accounts',      tallyLedgerName: 'Revenue - Contracting', vatApplicable: true, vatRate: '5' },
  { code: '4200-REV-SERVICES',    name: 'Revenue - Services',           group: 'Income',      subGroup: 'Sales Accounts',      tallyLedgerName: 'Revenue - Services', vatApplicable: true, vatRate: '5' },
  { code: '4900-REV-OTHER',       name: 'Other Income',                 group: 'Income',      subGroup: 'Indirect Incomes',    tallyLedgerName: 'Other Income' },

  // === Expenses (Direct) ===
  { code: '5100-COGS-MATERIALS',  name: 'Site Materials',               group: 'Expenses',    subGroup: 'Direct Expenses',     tallyLedgerName: 'Site Materials', vatApplicable: true, vatRate: '5' },
  { code: '5200-DIRECT-LABOUR',   name: 'Direct Labour',                group: 'Expenses',    subGroup: 'Direct Expenses',     tallyLedgerName: 'Direct Labour' },
  { code: '5210-LABOUR-OT',       name: 'Direct Labour - Overtime',     group: 'Expenses',    subGroup: 'Direct Expenses',     tallyLedgerName: 'Direct Labour - OT' },
  { code: '5300-SUBCONTRACTING',  name: 'Subcontracting Charges',       group: 'Expenses',    subGroup: 'Direct Expenses',     tallyLedgerName: 'Subcontracting Charges', vatApplicable: true, vatRate: '5' },
  { code: '5400-MACHINE-RENTAL',  name: 'Machine Rental',               group: 'Expenses',    subGroup: 'Direct Expenses',     tallyLedgerName: 'Machine Rental', vatApplicable: true, vatRate: '5' },

  // === Expenses (Indirect) ===
  { code: '6100-SALARY-WAGES',    name: 'Salaries & Wages - Indirect',  group: 'Expenses',    subGroup: 'Indirect Expenses',   tallyLedgerName: 'Salaries & Wages' },
  { code: '6110-SALARY-HOUSING',  name: 'Housing Allowance',            group: 'Expenses',    subGroup: 'Indirect Expenses',   tallyLedgerName: 'Housing Allowance' },
  { code: '6120-SALARY-TRANSPORT',name: 'Transport Allowance',          group: 'Expenses',    subGroup: 'Indirect Expenses',   tallyLedgerName: 'Transport Allowance' },
  { code: '6130-SALARY-OTHER',    name: 'Other Allowances',             group: 'Expenses',    subGroup: 'Indirect Expenses',   tallyLedgerName: 'Other Allowances' },
  { code: '6200-OFFICE-RENT',     name: 'Office Rent',                  group: 'Expenses',    subGroup: 'Indirect Expenses',   tallyLedgerName: 'Office Rent', vatApplicable: true, vatRate: '5' },
  { code: '6300-UTILITIES',       name: 'Utilities',                    group: 'Expenses',    subGroup: 'Indirect Expenses',   tallyLedgerName: 'Utilities', vatApplicable: true, vatRate: '5' },
  { code: '6400-TELECOM',         name: 'Telephone & Internet',         group: 'Expenses',    subGroup: 'Indirect Expenses',   tallyLedgerName: 'Telephone & Internet', vatApplicable: true, vatRate: '5' },
  { code: '6500-OFFICE-EXP',      name: 'Office & Admin Expenses',      group: 'Expenses',    subGroup: 'Indirect Expenses',   tallyLedgerName: 'Office & Admin Expenses', vatApplicable: true, vatRate: '5' },
  { code: '6900-MISC-EXP',        name: 'Miscellaneous Expenses',       group: 'Expenses',    subGroup: 'Indirect Expenses',   tallyLedgerName: 'Miscellaneous Expenses' }

  // === Equity (INTENTIONALLY NOT SEEDED) ===
  // Share Capital / Retained Earnings and all pure-accounting equity is owned by
  // the client's accountant in Tally. The ERP never posts to Equity, so seeding
  // it would make our sync overwrite the accountant's independent data. Keep it
  // out - see server/utils/accounts/operationalScope.js.
];

async function seedChartOfAccounts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    let inserted = 0;
    let skipped = 0;

    for (const row of DEFAULT_CHART) {
      const existing = await ChartOfAccounts.findOne({ code: row.code });
      if (existing) {
        skipped++;
        continue;
      }
      const doc = {
        code: row.code,
        name: row.name,
        group: row.group,
        subGroup: row.subGroup,
        tallyLedgerName: row.tallyLedgerName,
        vatApplicable: !!row.vatApplicable,
        vatRate: mongoose.Types.Decimal128.fromString(row.vatRate || '0'),
        currency: 'AED',
        isActive: true
      };
      await ChartOfAccounts.create(doc);
      inserted++;
    }

    const total = await ChartOfAccounts.countDocuments({});
    console.log(`[CoA Seed] inserted=${inserted} skipped=${skipped} total=${total}`);
    process.exit(0);
  } catch (error) {
    console.error('[CoA Seed] failed:', error);
    process.exit(1);
  }
}

seedChartOfAccounts();
