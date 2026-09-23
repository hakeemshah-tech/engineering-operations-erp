const mongoose = require('mongoose');
const Role = require('./models/Role');
require('dotenv').config();

async function seedRoles() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const defaultRoles = [
      { key: 'admin', name: 'Admin' },
      { key: 'manager', name: 'Manager' },
      { key: 'account_manager', name: 'Account Manager' },
      { key: 'hr', name: 'HR' },
      { key: 'inventory_manager', name: 'Inventory Manager' },
      { key: 'store_keeper', name: 'Store Keeper' },
      { key: 'supervisor', name: 'Supervisor' },
      { key: 'site_supervisor', name: 'Site Supervisor' },
      { key: 'site_worker', name: 'Site Worker' },
      { key: 'site_engineer', name: 'Site Engineer' },
      { key: 'sales_engineer', name: 'Sales Engineer' },
      { key: 'project_engineer', name: 'Project Engineer' },
      { key: 'estimation_engineer', name: 'Estimation Engineer' },
      { key: 'procurement_engineer', name: 'Procurement Engineer' },
      { key: 'vendor', name: 'Vendor' },
      { key: 'employee', name: 'Employee' },
      { key: 'tally_agent', name: 'Tally Sync Agent' }
    ];

    for (const role of defaultRoles) {
      await Role.updateOne({ key: role.key }, { $setOnInsert: role }, { upsert: true });
    }

    const roles = await Role.find({}).sort({ key: 1 });
    console.log(`Seeded roles (${roles.length}):`);
    for (const r of roles) {
      console.log(`- ${r.name} (${r.key}) -> ${r._id}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error seeding roles:', error);
    process.exit(1);
  }
}

seedRoles();


