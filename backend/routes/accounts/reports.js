const express = require('express');
const JournalEntry = require('../../models/JournalEntry');
const auth = require('../../middleware/auth');
const { requireAccountsRole } = require('../../middleware/requireAccountsRole');
const { toNumber } = require('../../utils/accounts/decimalHelpers');

const router = express.Router();

const OUTPUT_VAT_STD = '2300-OUTPUT-VAT-5';
const OUTPUT_VAT_RCM = '2310-OUTPUT-VAT-RCM';
const INPUT_VAT_STD = '1500-INPUT-VAT-5';
const INPUT_VAT_RCM = '1510-INPUT-VAT-RCM';

/**
 * Compute VAT 201 aggregates for a period. Iterates every POSTED journal entry
 * in the window and classifies each Income / Expenses line against sibling VAT
 * ledgers in the same entry:
 *
 *   Outputs: credit on an Income-group ledger is the taxable base.
 *     - paired with Output VAT 5%   -> Box 1 (standard-rated supplies)
 *     - paired with Output VAT RCM  -> Box 3 (reverse-charge supplies)
 *     - no sibling VAT credit       -> Box 4 (zero-rated; exempt not yet distinguished)
 *   Inputs:  debit on an Expenses-group ledger is the taxable base.
 *     - paired with Input VAT 5%    -> Box 9 (standard-rated recoverable inputs)
 *     - paired with Input VAT RCM   -> Box 10 (reverse-charge recoverable inputs)
 *     - no sibling Input VAT debit  -> excluded (no recoverable VAT)
 */
async function computeVat201(from, to) {
  const journals = await JournalEntry.find({
    status: 'POSTED',
    entryDate: { $gte: from, $lte: to }
  })
    .populate('lines.account', 'code name group tallyLedgerName')
    .lean();

  const boxes = {
    box1: { label: 'Standard-rated supplies (5%)', taxable: 0, vat: 0 },
    box3: { label: 'Supplies subject to reverse charge (output)', taxable: 0, vat: 0 },
    box4: { label: 'Zero-rated supplies', taxable: 0, vat: 0 },
    box5: { label: 'Exempt supplies', taxable: 0, vat: 0 },
    box9: { label: 'Standard-rated expenses (recoverable input VAT)', taxable: 0, vat: 0 },
    box10: { label: 'Supplies subject to reverse charge (recoverable)', taxable: 0, vat: 0 }
  };

  const sourceBreakdown = { SALES_CLAIM: 0, SUPPLIER_BILL: 0, MANUAL: 0, OTHER: 0 };
  let journalsTouched = 0;

  for (const je of journals) {
    let incomeCr = 0;
    let expenseDr = 0;
    let outputStdCr = 0;
    let outputRcmCr = 0;
    let inputStdDr = 0;
    let inputRcmDr = 0;

    for (const line of je.lines || []) {
      const code = line.account?.code;
      const group = line.account?.group;
      const cr = toNumber(line.credit);
      const dr = toNumber(line.debit);

      if (code === OUTPUT_VAT_STD) outputStdCr += cr;
      else if (code === OUTPUT_VAT_RCM) outputRcmCr += cr;
      else if (code === INPUT_VAT_STD) inputStdDr += dr;
      else if (code === INPUT_VAT_RCM) inputRcmDr += dr;
      else if (group === 'Income' && cr > 0) incomeCr += cr;
      else if (group === 'Expenses' && dr > 0) expenseDr += dr;
    }

    let touched = false;

    if (incomeCr > 0 || outputStdCr > 0 || outputRcmCr > 0) {
      touched = true;
      if (outputStdCr > 0) {
        boxes.box1.taxable += incomeCr;
        boxes.box1.vat += outputStdCr;
      } else if (outputRcmCr > 0) {
        boxes.box3.taxable += incomeCr;
        boxes.box3.vat += outputRcmCr;
      } else if (incomeCr > 0) {
        // Classify as zero-rated for Phase 1 (no explicit zero-rated/exempt flag yet).
        boxes.box4.taxable += incomeCr;
      }
    }

    if (expenseDr > 0 || inputStdDr > 0 || inputRcmDr > 0) {
      touched = true;
      if (inputStdDr > 0) {
        boxes.box9.taxable += expenseDr;
        boxes.box9.vat += inputStdDr;
      } else if (inputRcmDr > 0) {
        boxes.box10.taxable += expenseDr;
        boxes.box10.vat += inputRcmDr;
      }
      // else: expense without recoverable VAT (e.g. salary) - not reportable here
    }

    if (touched) {
      journalsTouched++;
      const kind = je.source?.kind;
      if (kind === 'SALES_CLAIM') sourceBreakdown.SALES_CLAIM++;
      else if (kind === 'SUPPLIER_BILL') sourceBreakdown.SUPPLIER_BILL++;
      else if (kind === 'MANUAL') sourceBreakdown.MANUAL++;
      else sourceBreakdown.OTHER++;
    }
  }

  const totalOutputVat = boxes.box1.vat + boxes.box3.vat;
  const totalInputVat = boxes.box9.vat + boxes.box10.vat;
  const totalOutputSupplies = boxes.box1.taxable + boxes.box3.taxable + boxes.box4.taxable + boxes.box5.taxable;
  const totalInputsRecoverable = boxes.box9.taxable + boxes.box10.taxable;
  const netPayable = totalOutputVat - totalInputVat;

  return {
    period: {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      label: `${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`
    },
    boxes,
    summary: {
      totalOutputSupplies,
      totalOutputVat,
      totalInputsRecoverable,
      totalInputVat,
      netPayable,
      interpretation: netPayable >= 0 ? 'payable_to_fta' : 'refundable_from_fta',
      currency: 'AED'
    },
    meta: {
      journalsScanned: journals.length,
      journalsTouched,
      sourceBreakdown,
      generatedAt: new Date().toISOString(),
      note: 'Phase 1: zero-rated vs exempt not yet distinguished. Lines with Income/Expenses group but no sibling VAT ledger roll into Box 4 (zero-rated) or are excluded (non-recoverable).'
    }
  };
}

function toCsv(report) {
  const rows = [
    ['# UAE FTA VAT 201 Report'],
    ['# Period', report.period.from, 'to', report.period.to],
    ['# Currency', report.summary.currency],
    ['# Generated', report.meta.generatedAt],
    [],
    ['Box', 'Label', 'Taxable Amount (AED)', 'VAT Amount (AED)'],
    ['1', report.boxes.box1.label, report.boxes.box1.taxable.toFixed(2), report.boxes.box1.vat.toFixed(2)],
    ['3', report.boxes.box3.label, report.boxes.box3.taxable.toFixed(2), report.boxes.box3.vat.toFixed(2)],
    ['4', report.boxes.box4.label, report.boxes.box4.taxable.toFixed(2), report.boxes.box4.vat.toFixed(2)],
    ['5', report.boxes.box5.label, report.boxes.box5.taxable.toFixed(2), report.boxes.box5.vat.toFixed(2)],
    ['', 'Total Outputs', report.summary.totalOutputSupplies.toFixed(2), report.summary.totalOutputVat.toFixed(2)],
    [],
    ['9', report.boxes.box9.label, report.boxes.box9.taxable.toFixed(2), report.boxes.box9.vat.toFixed(2)],
    ['10', report.boxes.box10.label, report.boxes.box10.taxable.toFixed(2), report.boxes.box10.vat.toFixed(2)],
    ['', 'Total Inputs', report.summary.totalInputsRecoverable.toFixed(2), report.summary.totalInputVat.toFixed(2)],
    [],
    ['', 'Net VAT Due / Refundable', '', report.summary.netPayable.toFixed(2)],
    ['', 'Interpretation', report.summary.interpretation]
  ];
  const escape = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map(r => r.map(escape).join(',')).join('\r\n');
}

router.get('/vat201', auth, requireAccountsRole, async (req, res) => {
  try {
    const { from, to, format } = req.query;
    if (!from || !to) {
      return res.status(400).json({ message: 'from and to (YYYY-MM-DD) are required' });
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return res.status(400).json({ message: 'Invalid from/to dates' });
    }
    // Normalise: include full day for the "to" bound
    toDate.setHours(23, 59, 59, 999);

    const report = await computeVat201(fromDate, toDate);

    if (format === 'csv') {
      const csv = toCsv(report);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="VAT201-${report.period.from}-to-${report.period.to}.csv"`);
      return res.send(csv);
    }

    res.json(report);
  } catch (err) {
    console.error('Error computing VAT 201:', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

module.exports = router;
