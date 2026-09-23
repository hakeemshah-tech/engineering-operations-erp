/**
 * Monthly salary-run number: SR-YYYY-MM (one per calendar month).
 * Guaranteed unique by the compound index on SalaryRun.period.
 */
function formatRunNumber(year, month) {
  return `SR-${year}-${String(month).padStart(2, '0')}`;
}

module.exports = { formatRunNumber };
