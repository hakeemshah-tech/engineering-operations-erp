const express = require('express');
const SupplierBill = require('../../models/SupplierBill');
const JournalEntry = require('../../models/JournalEntry');
const VoucherSyncTrack = require('../../models/VoucherSyncTrack');
const PurchaseOrder = require('../../models/PurchaseOrder');
const Supplier = require('../../models/Supplier');
const auth = require('../../middleware/auth');
const { requireAccountsRole, requirePostingRole } = require('../../middleware/requireAccountsRole');
const { toDecimal128, toNumber } = require('../../utils/accounts/decimalHelpers');
const { nextJournalEntryNumber } = require('../../utils/accounts/entryNumber');
const { runThreeWayMatch, flattenPOLines } = require('../../utils/accounts/threeWayMatch');
const { getAccountsSettings } = require('../../utils/accounts/settingsProvider');
const { resolveProjectForPO } = require('../../utils/accounts/costCenterResolver');
const { resolveExpenseAccount, findSystemAccount } = require('../../utils/accounts/expenseAccountResolver');
const { getCompanyTaxContext } = require('../../utils/accounts/companyContext');
const buildPurchaseVoucher = require('../../utils/tally/buildPurchaseVoucher');

const router = express.Router();

function computeBillTotals(lines = [], vatPercentage = 0) {
  const subtotal = lines.reduce((s, l) => s + toNumber(l.lineTotal || (toNumber(l.quantity) * toNumber(l.unitPrice))), 0);
  const vatAmount = subtotal * (toNumber(vatPercentage) / 100);
  const totalAmount = subtotal + vatAmount;
  return { subtotal, vatAmount, totalAmount };
}

/** POs that already have a GRN and aren't fully billed yet. */
router.get('/pending-match', auth, requireAccountsRole, async (req, res) => {
  try {
    // "billable" = GRN submitted + not yet paid off. Use grnNumber as the gate.
    const pos = await PurchaseOrder.find({
      // $nin, not two $ne keys - a duplicate key in an object literal keeps
      // only the last one, which silently dropped the null check.
      grnNumber: { $exists: true, $nin: [null, ''] },
      status: { $in: ['received', 'confirmed', 'payment_requested', 'payment_completed'] }
    })
      .populate('supplierId', 'name trn address')
      .sort({ receivedAt: -1 })
      .limit(100)
      .lean();

    // Flag which ones already have a journalized bill
    const poIds = pos.map(p => p._id);
    const existing = await SupplierBill.find({
      purchaseOrderId: { $in: poIds },
      status: { $in: ['matched', 'journalized', 'paid'] }
    }).select('purchaseOrderId grnNumber status').lean();
    const billedIdx = new Set(existing.map(b => `${b.purchaseOrderId}_${b.grnNumber || ''}`));

    const decorated = pos.map(po => ({
      _id: po._id,
      poNumber: po.poNumber,
      poType: po.poType,
      vatPercentage: po.vatPercentage,
      grnNumber: po.grnNumber,
      grnDeliveryDate: po.grnDeliveryDate,
      receivedAt: po.receivedAt,
      deliveryDate: po.deliveryDate,
      projectId: po.projectId,
      supplierId: po.supplierId,
      supplierSnapshot: po.supplier,
      items: po.items,
      serviceItems: po.serviceItems,
      otherItems: po.otherItems,
      receivedItems: po.receivedItems,
      alreadyBilled: billedIdx.has(`${po._id}_${po.grnNumber || ''}`)
    }));
    res.json(decorated);
  } catch (err) {
    console.error('Error fetching pending-match POs:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/** Pre-fill data for a new bill from a specific PO + its embedded GRN. */
router.get('/prefill/:poId', auth, requireAccountsRole, async (req, res) => {
  try {
    const po = await PurchaseOrder.findById(req.params.poId)
      .populate('supplierId', 'name trn address phone email');
    if (!po) return res.status(404).json({ message: 'PO not found' });
    if (!po.grnNumber) return res.status(400).json({ message: 'PO has no GRN yet' });

    const lines = flattenPOLines(po);

    // For material POs, override quantity with GRN received qty
    const prefilledLines = lines.map((line, idx) => {
      if (po.poType === 'material' && po.items && po.items[idx]) {
        const item = po.items[idx];
        const grn = (po.receivedItems || []).find(r => String(r.materialId) === String(item.materialId));
        const qty = grn ? toNumber(grn.receivedQty) : line.quantity;
        return { ...line, quantity: qty, lineTotal: qty * line.unitPrice };
      }
      return { ...line, lineTotal: line.quantity * line.unitPrice };
    });

    const totals = computeBillTotals(prefilledLines, po.vatPercentage);

    res.json({
      po: {
        _id: po._id,
        poNumber: po.poNumber,
        poType: po.poType,
        grnNumber: po.grnNumber,
        vatPercentage: po.vatPercentage,
        projectId: po.projectId,
        supplier: po.supplierId || po.supplier || null
      },
      prefilled: {
        supplierId: po.supplierId?._id,
        supplierTRN: po.supplierId?.trn,
        purchaseOrderId: po._id,
        grnNumber: po.grnNumber,
        projectId: po.projectId,
        lines: prefilledLines,
        subtotal: totals.subtotal.toFixed(2),
        vatAmount: totals.vatAmount.toFixed(2),
        totalAmount: totals.totalAmount.toFixed(2)
      }
    });
  } catch (err) {
    console.error('Error pre-filling bill:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/', auth, requireAccountsRole, async (req, res) => {
  try {
    const { status, supplierId, search, limit, skip } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (supplierId) filter.supplierId = supplierId;
    if (search && search.trim()) {
      filter.billNumber = { $regex: search.trim(), $options: 'i' };
    }
    const pageLimit = Math.min(parseInt(limit, 10) || 50, 200);
    const pageSkip = parseInt(skip, 10) || 0;

    const [items, total] = await Promise.all([
      SupplierBill.find(filter)
        .populate('supplierId', 'name trn')
        .populate('purchaseOrderId', 'poNumber')
        .populate('journalEntry', 'entryNumber status tallySyncStatus')
        .sort({ billDate: -1, createdAt: -1 })
        .skip(pageSkip)
        .limit(pageLimit)
        .lean(),
      SupplierBill.countDocuments(filter)
    ]);
    res.json({ items, total, limit: pageLimit, skip: pageSkip });
  } catch (err) {
    console.error('Error listing bills:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id', auth, requireAccountsRole, async (req, res) => {
  try {
    const bill = await SupplierBill.findById(req.params.id)
      .populate('supplierId', 'name trn address phone email')
      .populate('purchaseOrderId')
      .populate('journalEntry', 'entryNumber status tallySyncStatus postedAt')
      .populate('createdBy', 'name email')
      .populate('edits.editedBy', 'name email');
    if (!bill) return res.status(404).json({ message: 'Bill not found' });
    res.json(bill);
  } catch (err) {
    console.error('Error fetching bill:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/** Create a draft SupplierBill and run 3-way match. */
router.post('/', auth, requirePostingRole, async (req, res) => {
  try {
    const {
      billNumber, billDate, dueDate, supplierId, purchaseOrderId, grnNumber,
      projectId, lines, vatPercentage, notes
    } = req.body;

    if (!billNumber?.trim()) return res.status(400).json({ message: 'Bill number is required' });
    if (!billDate) return res.status(400).json({ message: 'Bill date is required' });
    if (!supplierId) return res.status(400).json({ message: 'Supplier is required' });
    if (!Array.isArray(lines) || lines.length === 0) return res.status(400).json({ message: 'Bill must have at least one line' });

    const supplier = await Supplier.findById(supplierId);
    if (!supplier) return res.status(400).json({ message: 'Supplier not found' });

    let po = null;
    if (purchaseOrderId) {
      po = await PurchaseOrder.findById(purchaseOrderId);
      if (!po) return res.status(400).json({ message: 'PO not found' });
      if (po.grnNumber && grnNumber && po.grnNumber !== grnNumber) {
        return res.status(400).json({ message: `PO ${po.poNumber} GRN is ${po.grnNumber}, not ${grnNumber}` });
      }
    }

    // Compute line totals where caller didn't
    const normalizedLines = lines.map(l => {
      const qty = toNumber(l.quantity);
      const price = toNumber(l.unitPrice);
      const lineTotal = l.lineTotal !== undefined && l.lineTotal !== null && l.lineTotal !== ''
        ? toNumber(l.lineTotal)
        : qty * price;
      return {
        description: (l.description || '').trim(),
        materialId: l.materialId || undefined,
        quantity: toDecimal128(qty),
        unitPrice: toDecimal128(price),
        lineTotal: toDecimal128(lineTotal),
        vatCode: l.vatCode || 'STD-5',
        vatRate: toDecimal128(l.vatRate ?? (po?.vatPercentage ?? 5)),
        vatAmount: toDecimal128(lineTotal * toNumber(l.vatRate ?? (po?.vatPercentage ?? 5)) / 100),
        expenseAccount: l.expenseAccount || undefined
      };
    });

    const effectiveVat = toNumber(vatPercentage ?? po?.vatPercentage ?? 5);
    const totals = computeBillTotals(normalizedLines.map(l => ({
      quantity: toNumber(l.quantity),
      unitPrice: toNumber(l.unitPrice),
      lineTotal: toNumber(l.lineTotal)
    })), effectiveVat);

    // Three-way match - pull tolerances from SystemSettings
    const settings = await getAccountsSettings();
    const matchInput = {
      po,
      billLines: normalizedLines.map(l => ({
        description: l.description,
        quantity: toNumber(l.quantity),
        unitPrice: toNumber(l.unitPrice),
        lineTotal: toNumber(l.lineTotal),
        materialId: l.materialId
      })),
      billVatAmount: totals.vatAmount,
      tolerance: {
        pricePct: settings.price3WayTolerancePct,
        qtyAbsolute: settings.qty3WayToleranceAbs,
        vatPct: settings.vat3WayTolerancePct
      }
    };
    const { matched, exceptions } = po ? runThreeWayMatch(matchInput) : { matched: true, exceptions: [] };

    const bill = await SupplierBill.create({
      billNumber: billNumber.trim(),
      billDate: new Date(billDate),
      dueDate: dueDate ? new Date(dueDate) : undefined,
      supplierId,
      supplierTRN: supplier.trn,
      purchaseOrderId: purchaseOrderId || undefined,
      grnNumber: grnNumber || po?.grnNumber,
      projectId: projectId || po?.projectId,
      lines: normalizedLines,
      subtotal: toDecimal128(totals.subtotal),
      vatAmount: toDecimal128(totals.vatAmount),
      totalAmount: toDecimal128(totals.totalAmount),
      vatBreakdown: [{
        vatCode: 'STD-5',
        taxableAmount: toDecimal128(totals.subtotal),
        vatAmount: toDecimal128(totals.vatAmount)
      }],
      matchExceptions: exceptions.map(e => ({
        lineIndex: e.lineIndex,
        kind: e.kind,
        expected: e.expected,
        actual: e.actual,
        variancePct: e.variancePct !== undefined ? toDecimal128(e.variancePct) : undefined
      })),
      status: matched ? 'matched' : 'draft',
      notes: notes?.trim(),
      createdBy: req.user.userId
    });

    await bill.populate('supplierId', 'name trn');
    await bill.populate('purchaseOrderId', 'poNumber');
    res.status(201).json({ bill, matched, exceptions });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Bill number already exists for this supplier' });
    console.error('Error creating supplier bill:', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

/** Resolve a specific match exception (Account_Manager acknowledging a variance). */
router.post('/:id/exceptions/:exceptionId/resolve', auth, requirePostingRole, async (req, res) => {
  try {
    const bill = await SupplierBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Bill not found' });
    const ex = bill.matchExceptions.id(req.params.exceptionId);
    if (!ex) return res.status(404).json({ message: 'Exception not found' });
    ex.resolved = true;
    ex.resolvedBy = req.user.userId;
    ex.resolvedAt = new Date();
    ex.resolutionNote = req.body?.note?.trim();
    if (bill.matchExceptions.every(e => e.resolved)) bill.status = 'matched';
    await bill.save();
    res.json({ bill });
  } catch (err) {
    console.error('Error resolving exception:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/** Post the bill: build a PURCHASE JournalEntry, generate Tally XML, return as download. */
router.post('/:id/post-and-generate-xml', auth, requirePostingRole, async (req, res) => {
  try {
    const bill = await SupplierBill.findById(req.params.id)
      .populate('supplierId')
      .populate('purchaseOrderId');
    if (!bill) return res.status(404).json({ message: 'Bill not found' });
    if (bill.status === 'journalized' || bill.status === 'paid') {
      return res.status(400).json({ message: `Bill is already ${bill.status}` });
    }
    const unresolved = (bill.matchExceptions || []).filter(e => !e.resolved);
    if (unresolved.length > 0) {
      return res.status(400).json({
        message: `${unresolved.length} unresolved match exception(s). Resolve them first.`,
        exceptions: unresolved
      });
    }

    // Resolve ledgers
    const expenseAccount = bill.purchaseOrderId
      ? await resolveExpenseAccount(bill.purchaseOrderId)
      : await findSystemAccount('6900-MISC-EXP');
    if (!expenseAccount) return res.status(500).json({ message: 'No expense ledger resolvable. Check Chart of Accounts.' });

    const inputVat = await findSystemAccount('1500-INPUT-VAT-5');
    if (!inputVat) return res.status(500).json({ message: 'Input VAT 5% ledger missing from Chart of Accounts.' });

    const creditor = await findSystemAccount('2100-AP-TRADE');
    if (!creditor) return res.status(500).json({ message: 'Sundry Creditors ledger missing from Chart of Accounts.' });

    const projectId = bill.projectId
      || (bill.purchaseOrderId ? await resolveProjectForPO(bill.purchaseOrderId) : null);

    const subtotal = toNumber(bill.subtotal);
    const vatAmount = toNumber(bill.vatAmount);
    const totalAmount = toNumber(bill.totalAmount);

    // Duplicate-post guard: check for an existing JE with this PO+GRN+Bill triple
    if (bill.purchaseOrderId && bill.grnNumber) {
      const dup = await JournalEntry.findOne({
        'source.kind': 'SUPPLIER_BILL',
        'source.purchaseOrder': bill.purchaseOrderId._id,
        'source.grnNumber': bill.grnNumber,
        'source.supplierBill': bill._id,
        status: { $in: ['POSTED'] }
      });
      if (dup) return res.status(400).json({ message: `Duplicate: already posted as ${dup.entryNumber}` });
    }

    const entryNumber = await nextJournalEntryNumber(new Date());
    const narration = `Supplier bill ${bill.billNumber} - ${bill.supplierId?.name || 'Supplier'}${bill.purchaseOrderId ? ' - PO ' + bill.purchaseOrderId.poNumber : ''}${bill.grnNumber ? ' - GRN ' + bill.grnNumber : ''}`;

    const journal = new JournalEntry({
      entryNumber,
      entryDate: bill.billDate,
      narration,
      voucherType: 'PURCHASE',
      lines: [
        {
          account: expenseAccount._id,
          debit: toDecimal128(subtotal),
          credit: toDecimal128(0),
          costCenter: projectId || undefined,
          vatCode: bill.vatBreakdown?.[0]?.vatCode || 'STD-5',
          vatAmount: toDecimal128(0),
          description: `Expense: ${expenseAccount.name}`
        },
        {
          account: inputVat._id,
          debit: toDecimal128(vatAmount),
          credit: toDecimal128(0),
          vatCode: 'STD-5',
          vatAmount: toDecimal128(vatAmount),
          description: 'Input VAT 5%'
        },
        {
          account: creditor._id,
          debit: toDecimal128(0),
          credit: toDecimal128(totalAmount),
          description: `AP: ${bill.supplierId?.name || 'Supplier'} (TRN ${bill.supplierId?.trn || bill.supplierTRN || ''})`
        }
      ],
      source: {
        kind: 'SUPPLIER_BILL',
        purchaseOrder: bill.purchaseOrderId?._id,
        grnNumber: bill.grnNumber,
        supplierBill: bill._id,
        project: projectId
      },
      status: 'POSTED',
      postedBy: req.user.userId,
      postedAt: new Date(),
      createdBy: req.user.userId
    });

    await journal.save();

    bill.status = 'journalized';
    bill.journalEntry = journal._id;
    await bill.save();

    // Populate refs needed by the XML builder
    await journal.populate('lines.account', 'code name tallyLedgerName');
    // Populate project for cost-center name
    await journal.populate({ path: 'lines.costCenter', select: 'projectTitle' });

    // The Project model stores title under `projectTitle` - let me be defensive.
    // Actually our Project.js stores... let me not populate an unknown field; read the project separately.
    let costCenterName = null;
    if (projectId) {
      const Project = require('mongoose').model('Project');
      const proj = await Project.findById(projectId).select('projectTitle title name').lean();
      costCenterName = proj?.projectTitle || proj?.title || proj?.name || null;
    }

    const company = await getCompanyTaxContext();

    const { xml, checksum } = buildPurchaseVoucher(journal, {
      supplier: {
        name: bill.supplierId?.name,
        trn: bill.supplierId?.trn || bill.supplierTRN,
        address: bill.supplierId?.address
      },
      purchaseOrder: bill.purchaseOrderId ? {
        poNumber: bill.purchaseOrderId.poNumber,
        grnNumber: bill.grnNumber
      } : {},
      supplierBill: { billNumber: bill.billNumber },
      costCenterName,
      company
    });

    // Log the sync track
    const priorAttempts = await VoucherSyncTrack.countDocuments({ journalEntry: journal._id });
    await VoucherSyncTrack.create({
      journalEntry: journal._id,
      attemptNo: priorAttempts + 1,
      action: 'DOWNLOADED',
      xmlPayload: xml,
      xmlChecksum: checksum,
      performedBy: req.user.userId
    });
    journal.tallySyncStatus = 'DOWNLOADED';
    await journal.save();

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="PV-${journal.entryNumber}.xml"`);
    res.send(xml);
  } catch (err) {
    console.error('Error posting bill:', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

/** Cancel a draft or matched bill. */
router.post('/:id/cancel', auth, requirePostingRole, async (req, res) => {
  try {
    const bill = await SupplierBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Bill not found' });
    if (bill.status === 'journalized' || bill.status === 'paid') {
      return res.status(400).json({ message: `Cannot cancel a ${bill.status} bill. Reverse the journal entry instead.` });
    }
    bill.status = 'cancelled';
    await bill.save();
    res.json({ bill });
  } catch (err) {
    console.error('Error cancelling bill:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
