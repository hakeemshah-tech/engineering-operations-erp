const express = require('express');
const jwt = require('jsonwebtoken');
const OffboardingCase = require('../models/OffboardingCase');
const Employee = require('../models/Employee');
const Company = require('../models/Company');
const GeneralAuditLog = require('../models/GeneralAuditLog');
const { calculateGratuity } = require('../utils/gratuityCalculator');
const generateExperienceCertificatePdf = require('../utils/generateExperienceCertificatePdf');
const { syncUserActivationFromEmployee } = require('../services/employeeBridge');

const router = express.Router();

const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const hasHRAccess = (roles) =>
  roles.includes('hr') || roles.includes('manager') || roles.includes('admin');

const canFinalize = (roles) =>
  roles.includes('manager') || roles.includes('admin');

const canCalculateGratuity = (roles) =>
  hasHRAccess(roles) || roles.includes('account_manager');

function defaultClearance() {
  return ['NDA', 'SIM', 'Email', 'Office Key', 'Laptop', 'Car', 'Mobile', 'Final Settlement', 'Dues Paid']
    .map(item => ({ item, returned: false }));
}

async function audit(action, entityId, userId, details = {}) {
  try {
    await GeneralAuditLog.create({
      action,
      module: 'hr_management',
      entityType: 'offboarding_case',
      entityId,
      performedBy: userId,
      performedAt: new Date(),
      details,
      success: true
    });
  } catch (err) {
    console.error('[offboarding audit]', err.message);
  }
}

// GET list
router.get('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const filter = {};
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;

    const cases = await OffboardingCase.find(filter)
      .populate('employee', 'employeeId fullName category position joiningDate')
      .sort({ createdAt: -1 });
    res.json(cases);
  } catch (error) {
    console.error('Error fetching offboarding cases:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET single
router.get('/:id', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const kase = await OffboardingCase.findById(req.params.id)
      .populate('employee', 'employeeId fullName category position joiningDate offerLetter contract')
      .populate('createdBy', 'name email')
      .populate('gratuityCalc.calculatedBy', 'name email')
      .populate('clearanceChecklist.verifiedBy', 'name email')
      .populate('experienceCertificate.generatedBy', 'name email')
      .populate('cancellation.cancelledBy', 'name email');
    if (!kase) return res.status(404).json({ message: 'Not found.' });
    res.json(kase);
  } catch (error) {
    console.error('Error fetching offboarding case:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create
router.post('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const { employee, exitType, noticePeriodDays, noticeStartDate, lastWorkingDate, reason } = req.body || {};
    if (!employee || !exitType) {
      return res.status(400).json({ message: 'employee and exitType are required.' });
    }

    const emp = await Employee.findById(employee);
    if (!emp) return res.status(400).json({ message: 'Employee not found.' });

    const kase = await OffboardingCase.create({
      employee,
      exitType,
      noticePeriodDays: noticePeriodDays || 30,
      noticeStartDate: noticeStartDate || new Date(),
      lastWorkingDate,
      reason,
      status: 'initiated',
      clearanceChecklist: defaultClearance(),
      createdBy: req.user.userId
    });

    emp.status = 'offboarding';
    await emp.save();

    await audit('offboarding_initiated', kase._id, req.user.userId, { employee, exitType });
    res.status(201).json(kase);
  } catch (error) {
    console.error('Error creating offboarding:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// POST calculate gratuity
router.post('/:id/calculate-gratuity', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!canCalculateGratuity(roles)) return res.status(403).json({ message: 'Access denied.' });

    const kase = await OffboardingCase.findById(req.params.id).populate('employee', 'joiningDate offerLetter');
    if (!kase) return res.status(404).json({ message: 'Not found.' });

    const joiningDate = req.body.joiningDate || kase.employee?.joiningDate;
    const exitDate = req.body.exitDate || kase.lastWorkingDate || kase.actualExitDate || new Date();
    const basicWage = Number(req.body.basicWage ?? kase.employee?.offerLetter?.basicSalary) || 0;

    if (!joiningDate) {
      return res.status(400).json({ message: 'joiningDate required (missing on employee).' });
    }

    const result = calculateGratuity({ joiningDate, exitDate, basicWage });
    kase.gratuityCalc = {
      ...result,
      overrideAmount: req.body.overrideAmount ?? kase.gratuityCalc?.overrideAmount,
      calculatedAt: new Date(),
      calculatedBy: req.user.userId
    };

    await kase.save();
    await audit('gratuity_calculated', kase._id, req.user.userId, { finalGratuity: result.finalGratuity });
    res.json(kase);
  } catch (error) {
    console.error('Error calculating gratuity:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// PATCH clearance item
router.patch('/:id/clearance/:item', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const kase = await OffboardingCase.findById(req.params.id);
    if (!kase) return res.status(404).json({ message: 'Not found.' });

    const decodedItem = decodeURIComponent(req.params.item);
    const target = kase.clearanceChecklist.find(c => c.item === decodedItem);
    if (!target) return res.status(404).json({ message: 'Clearance item not found.' });

    if (kase.status === 'initiated') {
      return res.status(400).json({
        message: 'Start clearance before ticking items — the case is still in the Initiated stage.',
        code: 'STAGE_INITIATED'
      });
    }
    if (kase.status === 'completed' || kase.status === 'cancelled') {
      return res.status(400).json({ message: `Clearance items cannot be changed once the case is ${kase.status}.` });
    }

    target.returned = req.body.returned !== undefined ? !!req.body.returned : !target.returned;
    target.returnedAt = target.returned ? new Date() : null;
    target.verifiedBy = target.returned ? req.user.userId : null;
    if (req.body.notes !== undefined) target.notes = req.body.notes;

    await kase.save();
    await audit('clearance_item_toggled', kase._id, req.user.userId, { item: decodedItem, returned: target.returned });
    res.json(kase);
  } catch (error) {
    console.error('Error toggling clearance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST start clearance
//   Moves an Initiated case into the In Clearance stage explicitly. This
//   surfaces the transition as a deliberate HR action rather than something
//   that fires implicitly the first time someone toggles a checklist item.
router.post('/:id/start-clearance', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const kase = await OffboardingCase.findById(req.params.id);
    if (!kase) return res.status(404).json({ message: 'Not found.' });

    if (kase.status === 'cancelled' || kase.status === 'completed') {
      return res.status(400).json({ message: `Cannot start clearance on a ${kase.status} case.` });
    }
    if (kase.status === 'in_clearance') {
      return res.status(400).json({ message: 'Clearance is already in progress.' });
    }

    kase.status = 'in_clearance';
    await kase.save();
    await audit('clearance_started', kase._id, req.user.userId, {});
    res.json(kase);
  } catch (error) {
    console.error('Error starting clearance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST finalize
router.post('/:id/finalize', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!canFinalize(roles)) return res.status(403).json({ message: 'Access denied. Manager or Admin required.' });

    const kase = await OffboardingCase.findById(req.params.id).populate('employee');
    if (!kase) return res.status(404).json({ message: 'Not found.' });

    // Stage gate - make HR walk through Initiated → In Clearance → Completed
    // instead of jumping straight from Initiated to Completed. This is the
    // most common source of "where did the In Clearance step go?" confusion.
    if (kase.status === 'initiated') {
      return res.status(400).json({
        message: 'Start clearance first — a case must move through the In Clearance stage before it can be finalised.',
        code: 'STAGE_INITIATED'
      });
    }
    if (kase.status === 'completed') {
      return res.status(400).json({ message: 'Case is already completed.' });
    }
    if (kase.status === 'cancelled') {
      return res.status(400).json({ message: 'A cancelled case cannot be finalised.' });
    }

    const allCleared = kase.clearanceChecklist.length > 0
      && kase.clearanceChecklist.every(c => c.returned);
    if (!allCleared) {
      return res.status(400).json({ message: 'Cannot finalize — clearance checklist has outstanding items.' });
    }

    if (!kase.gratuityCalc || !kase.gratuityCalc.calculatedAt) {
      return res.status(400).json({
        message: 'Calculate gratuity before finalising — final settlement needs the EOSB figure on record.',
        code: 'GRATUITY_MISSING'
      });
    }

    kase.status = 'completed';
    kase.actualExitDate = req.body.actualExitDate || kase.lastWorkingDate || new Date();

    if (req.body.finalSettlement) {
      Object.assign(kase.finalSettlement, req.body.finalSettlement);
      kase.finalSettlement.total =
        (Number(kase.finalSettlement.unpaidSalary) || 0) +
        (Number(kase.finalSettlement.unusedLeaveAmount) || 0) +
        (Number(kase.gratuityCalc?.overrideAmount ?? kase.gratuityCalc?.finalGratuity) || 0) -
        (Number(kase.finalSettlement.deductions) || 0);
    }

    await kase.save();

    if (kase.employee) {
      const exitType = kase.exitType;
      kase.employee.status = exitType === 'resignation' ? 'resigned'
        : exitType === 'termination' ? 'terminated'
          : 'resigned';
      await kase.employee.save();
      await syncUserActivationFromEmployee(kase.employee, req.user.userId);
    }

    await audit('offboarding_finalized', kase._id, req.user.userId, { exitType: kase.exitType });
    res.json(kase);
  } catch (error) {
    console.error('Error finalizing offboarding:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// POST cancel offboarding
//   Lets an authorised user stop an Initiated or In Clearance case before it
//   reaches Completed. The case moves to status='cancelled' with a reason on
//   record. The employee.status is reverted from 'offboarding' back to
//   'active' so they keep their access. Completed cases cannot be cancelled
//   from here - they need a separate "rehire" workflow.
router.post('/:id/cancel', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const kase = await OffboardingCase.findById(req.params.id).populate('employee');
    if (!kase) return res.status(404).json({ message: 'Not found.' });

    if (kase.status === 'completed') {
      return res.status(400).json({
        message: 'Completed cases cannot be cancelled — they need a separate rehire/reinstatement flow.',
        code: 'ALREADY_COMPLETED'
      });
    }
    if (kase.status === 'cancelled') {
      return res.status(400).json({ message: 'Case is already cancelled.' });
    }

    const reason = (req.body?.reason || '').trim();
    if (!reason) {
      return res.status(400).json({
        message: 'A reason is required to cancel the offboarding case.',
        code: 'REASON_REQUIRED'
      });
    }

    kase.status = 'cancelled';
    kase.cancellation = {
      reason,
      cancelledBy: req.user.userId,
      cancelledAt: new Date()
    };
    await kase.save();

    // Restore the employee - if they were in 'offboarding' status (set by the
    // POST / create endpoint) put them back to 'active'. Other terminal
    // statuses (already terminated/resigned) are left alone defensively.
    if (kase.employee && kase.employee.status === 'offboarding') {
      kase.employee.status = 'active';
      await kase.employee.save();
    }

    await audit('offboarding_cancelled', kase._id, req.user.userId, { reason });
    res.json(kase);
  } catch (error) {
    console.error('Error cancelling offboarding:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// GET experience certificate PDF
router.get('/:id/experience-certificate', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!hasHRAccess(roles)) return res.status(403).json({ message: 'Access denied.' });

    const kase = await OffboardingCase.findById(req.params.id).populate('employee');
    if (!kase) return res.status(404).json({ message: 'Not found.' });

    const company = await Company.findOne();

    const pdfBuffer = await generateExperienceCertificatePdf({
      employee: kase.employee,
      offboardingCase: kase,
      company
    });

    kase.experienceCertificate = {
      generatedAt: new Date(),
      generatedBy: req.user.userId,
      path: null
    };
    await kase.save();
    await audit('experience_certificate_generated', kase._id, req.user.userId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Experience-Certificate-${kase.employee?.employeeId || kase.caseNumber}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (error) {
    console.error('Error generating experience certificate:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

module.exports = router;
