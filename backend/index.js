const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

// Fail fast on missing secrets. Route handlers call jwt.verify(token,
// process.env.JWT_SECRET) with no fallback on purpose - a placeholder default
// would silently accept tokens signed with a publicly known key.
for (const key of ['MONGODB_URI', 'JWT_SECRET']) {
  if (!process.env[key]) {
    console.error(`[config] ${key} is not set. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const leadRoutes = require('./routes/leads');
const roleRoutes = require('./routes/roles');
const projectRoutes = require('./routes/projects');
const siteVisitRoutes = require('./routes/siteVisits');
const quotationRoutes = require('./routes/quotations');
const revisionRoutes = require('./routes/revisions');
const projectVariationRoutes = require('./routes/projectVariations');
const auditLogRoutes = require('./routes/auditLogs');
const generalAuditLogRoutes = require('./routes/generalAuditLogs');
const unifiedAuditLogRoutes = require('./routes/unifiedAuditLogs');
const storeRoutes = require('./routes/stores');
const materialRoutes = require('./routes/materials');
const systemSettingsRoutes = require('./routes/systemSettings');
const materialRequestRoutes = require('./routes/materialRequests');
const purchaseRequestRoutes = require('./routes/purchaseRequests');
const purchaseOrderRoutes = require('./routes/purchaseOrders');
const brandRoutes = require('./routes/brands');
const supplierRoutes = require('./routes/suppliers');
const companyRoutes = require('./routes/company');
const companyDocumentRoutes = require('./routes/companyDocuments');
const credentialRoutes = require('./routes/credentials');
const vehicleRoutes = require('./routes/vehicles');
const employeeRoutes = require('./routes/employees');
const attendanceRoutes = require('./routes/attendance');
const locationRoutes = require('./routes/locations');
const locationGroupRoutes = require('./routes/locationGroups');
const holidayRoutes = require('./routes/holidays');
const leaveRequestRoutes = require('./routes/leaveRequests');
const offboardingRoutes = require('./routes/offboarding');
const hrAlertRoutes = require('./routes/hrAlerts');
const accountsRoutes = require('./routes/accounts');

const app = express();
const path = require('path');

app.use(cors());
// Trust the first reverse-proxy hop so req.ip reflects the real client IP.
// Required for the Office IP Lock in /api/attendance/punch - without this,
// every IP would appear as the proxy's address and the whitelist would be useless.
app.set('trust proxy', true);
// Only parse JSON for non-multipart requests
app.use(express.json({
  type: ['application/json', 'text/json'],
  limit: '10mb'
}));
// Serve uploaded files
// Attendance selfies are sensitive (biometric + GPS) - the static mount blocks
// /uploads/attendance/** so those files can only be reached via the gated
// endpoint GET /api/attendance/selfie/:attendanceId/:logId/:which. Everything
// else under /uploads (company docs, signatures, etc.) is served as before.
app.use('/uploads/attendance', (_req, res) => {
  res.status(403).json({
    message: 'Attendance selfies are private. Use the gated endpoint /api/attendance/selfie/...'
  });
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected');
    // Bootstrap HR cron jobs after DB is ready
    try {
      require('./utils/hrCron');
    } catch (err) {
      console.error('[HR Cron] Failed to bootstrap:', err.message);
    }
  })
  .catch(err => console.error('MongoDB connection error:', err));

// Liveness/readiness probe for the container orchestrator. Reports the
// Mongoose connection state so a container with a dead DB link fails its
// healthcheck instead of silently serving 500s.
app.get('/health', (_req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({
    status: dbUp ? 'ok' : 'degraded',
    db: mongoose.STATES[mongoose.connection.readyState],
    uptime: process.uptime()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/site-visits', siteVisitRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/revisions', revisionRoutes);
app.use('/api/project-variations', projectVariationRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/general-audit-logs', generalAuditLogRoutes);
app.use('/api/unified-audit-logs', unifiedAuditLogRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/system-settings', systemSettingsRoutes);
app.use('/api/material-requests', materialRequestRoutes);
app.use('/api/purchase-requests', purchaseRequestRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/company-documents', companyDocumentRoutes);
app.use('/api/credentials', credentialRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/location-groups', locationGroupRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/leave-requests', leaveRequestRoutes);
app.use('/api/offboarding', offboardingRoutes);
app.use('/api/hr-alerts', hrAlertRoutes);
app.use('/api/accounts', accountsRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});