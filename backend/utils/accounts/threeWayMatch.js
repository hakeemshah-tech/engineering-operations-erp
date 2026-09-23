const { toNumber } = require('./decimalHelpers');

const DEFAULT_TOLERANCE = {
  // See plan O-1: 2% price variance, 0% qty variance by default.
  pricePct: 2,
  qtyAbsolute: 0,
  vatPct: 2
};

function variancePct(expected, actual) {
  const e = toNumber(expected);
  if (e === 0) return toNumber(actual) === 0 ? 0 : Infinity;
  return Math.abs((toNumber(actual) - e) / e) * 100;
}

/**
 * Collect PO-side line info for matching. Handles all three item shapes on PO:
 *   - items[]         (material)
 *   - serviceItems[]  (manpower / subcontracting / machine_rental)
 *   - otherItems[]    (other)
 *
 * Returns [{ description, unitPrice, quantity, materialId }].
 */
function flattenPOLines(po) {
  if (!po) return [];
  if (po.poType === 'material' && Array.isArray(po.items) && po.items.length > 0) {
    return po.items.map(i => ({
      kind: 'material',
      description: i.materialName,
      materialId: i.materialId,
      unitPrice: toNumber(i.unitPrice),
      quantity: toNumber(i.quantity)
    }));
  }
  if (['manpower', 'subcontracting', 'machine_rental'].includes(po.poType) && Array.isArray(po.serviceItems)) {
    return po.serviceItems.map(i => ({
      kind: 'service',
      description: i.description,
      unitPrice: toNumber(i.rate),
      quantity: toNumber(i.quantity) * toNumber(i.duration || 1)
    }));
  }
  if (po.poType === 'other' && Array.isArray(po.otherItems)) {
    return po.otherItems.map(i => ({
      kind: 'other',
      description: i.description,
      unitPrice: toNumber(i.unitPrice),
      quantity: toNumber(i.quantity) * toNumber(i.duration || 1)
    }));
  }
  return [];
}

/**
 * For a material PO, returns the GRN receipt quantity for a given materialId.
 * For non-material POs (no structured GRN), falls back to ordered quantity.
 */
function getGrnQty(po, materialId) {
  if (po.poType !== 'material') return null; // GRN tracked per material only
  if (!Array.isArray(po.receivedItems)) return null;
  const row = po.receivedItems.find(r => String(r.materialId) === String(materialId));
  return row ? toNumber(row.receivedQty) : null;
}

/**
 * Run the 3-way match. Produces a list of exceptions (empty = clean match).
 *
 * @param {Object} po            - Populated PurchaseOrder document
 * @param {Array}  billLines     - [{ description, quantity, unitPrice, materialId?, lineTotal }]
 * @param {Number} billVatAmount - Supplier's stated VAT on the bill
 * @param {Object} tolerance     - Optional overrides for price/qty/vat tolerance
 */
function runThreeWayMatch({ po, billLines, billVatAmount, tolerance = {} }) {
  const tol = { ...DEFAULT_TOLERANCE, ...tolerance };
  const exceptions = [];

  if (!po) {
    return { matched: false, exceptions: [{ kind: 'MISSING_GRN', message: 'No PO to match against' }] };
  }

  if (po.poType === 'material' && !po.grnNumber) {
    exceptions.push({
      kind: 'MISSING_GRN',
      message: `PO ${po.poNumber} has no GRN yet; cannot post an AP bill.`
    });
  }

  const poLines = flattenPOLines(po);

  if (!Array.isArray(billLines) || billLines.length === 0) {
    exceptions.push({ kind: 'MISSING_GRN', message: 'Bill has no lines' });
    return { matched: false, exceptions };
  }

  if (billLines.length !== poLines.length) {
    exceptions.push({
      kind: 'QTY_VARIANCE',
      lineIndex: null,
      expected: poLines.length,
      actual: billLines.length,
      message: `Bill line count (${billLines.length}) does not match PO line count (${poLines.length})`
    });
  }

  const pairCount = Math.min(billLines.length, poLines.length);
  for (let i = 0; i < pairCount; i++) {
    const bill = billLines[i];
    const pol = poLines[i];

    // Price check
    const pVar = variancePct(pol.unitPrice, bill.unitPrice);
    if (pVar > tol.pricePct) {
      exceptions.push({
        lineIndex: i,
        kind: 'PRICE_VARIANCE',
        expected: pol.unitPrice,
        actual: toNumber(bill.unitPrice),
        variancePct: Number(pVar.toFixed(4)),
        message: `Line ${i + 1} "${pol.description}": price ${bill.unitPrice} vs PO ${pol.unitPrice} (${pVar.toFixed(2)}% off)`
      });
    }

    // Qty check: prefer GRN qty for material POs, fall back to ordered qty otherwise
    const grnQty = getGrnQty(po, pol.materialId);
    const expectedQty = grnQty !== null ? grnQty : pol.quantity;
    const qtyDelta = Math.abs(toNumber(bill.quantity) - expectedQty);
    if (qtyDelta > tol.qtyAbsolute) {
      exceptions.push({
        lineIndex: i,
        kind: 'QTY_VARIANCE',
        expected: expectedQty,
        actual: toNumber(bill.quantity),
        variancePct: Number(variancePct(expectedQty, bill.quantity).toFixed(4)),
        message: `Line ${i + 1} "${pol.description}": qty ${bill.quantity} vs ${grnQty !== null ? 'GRN' : 'PO'} ${expectedQty}`
      });
    }
  }

  // VAT check: compare stated bill VAT against expected (subtotal × vatPercentage)
  if (po.vatPercentage && po.vatPercentage > 0) {
    const subtotal = billLines.reduce((s, l) => s + toNumber(l.lineTotal || (toNumber(l.quantity) * toNumber(l.unitPrice))), 0);
    const expectedVat = subtotal * (toNumber(po.vatPercentage) / 100);
    const vVar = variancePct(expectedVat, billVatAmount);
    if (vVar > tol.vatPct) {
      exceptions.push({
        kind: 'VAT_VARIANCE',
        expected: Number(expectedVat.toFixed(2)),
        actual: toNumber(billVatAmount),
        variancePct: Number(vVar.toFixed(4)),
        message: `Bill VAT ${billVatAmount} vs expected ${expectedVat.toFixed(2)} (${vVar.toFixed(2)}% off)`
      });
    }
  }

  return {
    matched: exceptions.filter(e => !e.resolved).length === 0,
    exceptions
  };
}

module.exports = {
  runThreeWayMatch,
  flattenPOLines,
  getGrnQty,
  variancePct,
  DEFAULT_TOLERANCE
};
