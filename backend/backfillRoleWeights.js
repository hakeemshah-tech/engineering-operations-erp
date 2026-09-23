const mongoose = require('mongoose');
const Role = require('./models/Role');
require('dotenv').config();

const ROLE_WEIGHTS = {
  admin: 100,
  manager: 80,
  hr: 70,
  account_manager: 60,
  project_engineer: 50,
  site_engineer: 40,
  sales_engineer: 40,
  estimation_engineer: 40,
  supervisor: 30,
  site_supervisor: 30,
  inventory_manager: 30,
  procurement_engineer: 30,
  store_keeper: 20,
  tally_agent: 20,
  employee: 10,
  site_worker: 10,
  vendor: 5
};

async function backfill() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const roles = await Role.find({});
    let updated = 0;
    for (const role of roles) {
      const target = ROLE_WEIGHTS[role.key];
      if (target === undefined) continue;
      if (role.weight === target) continue;
      await Role.updateOne({ _id: role._id }, { $set: { weight: target } });
      updated += 1;
    }

    const fresh = await Role.find({}).sort({ weight: -1, key: 1 });
    console.log(`Backfilled weights on ${updated} role(s). Current roles:`);
    for (const r of fresh) {
      console.log(`- ${r.name} (${r.key}) -> weight ${r.weight}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error backfilling role weights:', error);
    process.exit(1);
  }
}

backfill();
