/**
 * UAE End-of-Service Benefit (Gratuity) calculator.
 * Federal Decree-Law No. 33 of 2021:
 *   - 21 days basic wage per year for the first 5 years of service
 *   - 30 days basic wage per year for each year beyond 5
 *   - Total gratuity capped at 2 years (24 months) of basic wage
 *   - No gratuity if service less than 1 year
 *
 * @param {Object} params
 * @param {Date|string} params.joiningDate
 * @param {Date|string} params.exitDate
 * @param {number} params.basicWage - Monthly basic wage (AED)
 * @returns {Object}
 */
function calculateGratuity({ joiningDate, exitDate, basicWage }) {
  const join = new Date(joiningDate);
  const exit = new Date(exitDate);
  const basic = Number(basicWage) || 0;

  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const yearsOfService = Math.max(0, (exit.getTime() - join.getTime()) / msPerYear);

  if (yearsOfService < 1 || basic <= 0) {
    return {
      yearsOfService: Number(yearsOfService.toFixed(2)),
      basicWage: basic,
      first5YearsDays: 0,
      after5YearsDays: 0,
      grossGratuity: 0,
      capAmount: basic * 24,
      finalGratuity: 0
    };
  }

  const dailyBasic = basic / 30;
  const yearsFirst5 = Math.min(yearsOfService, 5);
  const yearsAfter5 = Math.max(0, yearsOfService - 5);

  const first5YearsDays = yearsFirst5 * 21;
  const after5YearsDays = yearsAfter5 * 30;

  const grossGratuity = (first5YearsDays + after5YearsDays) * dailyBasic;
  const capAmount = basic * 24;
  const finalGratuity = Math.min(grossGratuity, capAmount);

  return {
    yearsOfService: Number(yearsOfService.toFixed(2)),
    basicWage: basic,
    first5YearsDays: Number(first5YearsDays.toFixed(2)),
    after5YearsDays: Number(after5YearsDays.toFixed(2)),
    grossGratuity: Number(grossGratuity.toFixed(2)),
    capAmount: Number(capAmount.toFixed(2)),
    finalGratuity: Number(finalGratuity.toFixed(2))
  };
}

module.exports = { calculateGratuity };
