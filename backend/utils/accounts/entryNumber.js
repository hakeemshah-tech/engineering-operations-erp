const JournalEntry = require('../../models/JournalEntry');

async function nextJournalEntryNumber(date = new Date()) {
  const year = date.getFullYear();
  const prefix = `JE-${year}-`;
  const last = await JournalEntry.findOne({ entryNumber: { $regex: `^${prefix}` } })
    .sort({ entryNumber: -1 })
    .select('entryNumber')
    .lean();

  let nextSeq = 1;
  if (last && last.entryNumber) {
    const parts = last.entryNumber.split('-');
    const seq = parseInt(parts[parts.length - 1], 10);
    if (Number.isFinite(seq)) nextSeq = seq + 1;
  }
  return `${prefix}${String(nextSeq).padStart(5, '0')}`;
}

module.exports = { nextJournalEntryNumber };
