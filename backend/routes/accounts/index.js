const express = require('express');
const auth = require('../../middleware/auth');
const requireAccountsRole = require('../../middleware/requireAccountsRole');

const chartOfAccountsRoutes = require('./chartOfAccounts');
const accountGroupsRoutes = require('./accountGroups');
const journalEntriesRoutes = require('./journalEntries');
const supplierBillsRoutes = require('./supplierBills');
const salesClaimsRoutes = require('./salesClaims');
const salaryRunsRoutes = require('./salaryRuns');
const tallySyncRoutes = require('./tallySync');
const reportsRoutes = require('./reports');
const mastersRoutes = require('./masters');

const router = express.Router();

router.get('/ping', auth, requireAccountsRole, (req, res) => {
  res.json({
    ok: true,
    module: 'accounts',
    user: {
      userId: req.user.userId,
      email: req.user.email,
      roles: req.user.roles
    },
    timestamp: new Date().toISOString()
  });
});

router.use('/chart-of-accounts', chartOfAccountsRoutes);
router.use('/account-groups', accountGroupsRoutes);
router.use('/journal-entries', journalEntriesRoutes);
router.use('/supplier-bills', supplierBillsRoutes);
router.use('/sales-claims', salesClaimsRoutes);
router.use('/salary-runs', salaryRunsRoutes);
router.use('/tally', tallySyncRoutes);
router.use('/reports', reportsRoutes);
router.use('/masters', mastersRoutes);

module.exports = router;
