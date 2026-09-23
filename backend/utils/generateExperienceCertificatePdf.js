const PDFDocument = require('pdfkit');
const { PassThrough } = require('stream');
const path = require('path');
const fs = require('fs');

/**
 * Generate an Experience Certificate PDF for an offboarding employee.
 * @param {Object} data
 * @param {Object} data.employee - Populated employee document
 * @param {Object} data.offboardingCase - Populated offboarding case
 * @param {Object} [data.company] - Company profile (optional)
 * @returns {Promise<Buffer>}
 */
function generateExperienceCertificatePdf(data) {
  return new Promise((resolve, reject) => {
    try {
      const { employee, offboardingCase, company } = data;

      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        bufferPages: false
      });

      const bufferStream = new PassThrough();
      const chunks = [];

      bufferStream.on('data', chunk => chunks.push(chunk));
      bufferStream.on('end', () => resolve(Buffer.concat(chunks)));
      bufferStream.on('error', reject);
      doc.on('error', reject);

      doc.pipe(bufferStream);

      const PRIMARY_BLUE = '#1F4788';
      const SECONDARY_BLUE = '#4A90E2';
      const DARK_TEXT = '#333333';
      const GRAY = '#6B7280';

      const PAGE_WIDTH = doc.page.width;
      const CONTENT_WIDTH = PAGE_WIDTH - 100;
      let y = 50;

      // Header - logo placeholder + company name
      try {
        const logoPath = path.join(__dirname, '../../frontend/src/assets/logo/app-logo.png');
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, 50, y, { width: 60, height: 60 });
        } else {
          doc.fillColor(PRIMARY_BLUE).rect(50, y, 60, 60).fill();
          doc.fillColor('white').fontSize(14).font('Helvetica-Bold').text('HR', 60, y + 20, { width: 40, align: 'center' });
        }
      } catch {
        doc.fillColor(PRIMARY_BLUE).rect(50, y, 60, 60).fill();
      }

      const companyName = company?.name || 'Company Name';
      const companyAddress = [company?.address?.street, company?.address?.city, company?.address?.country]
        .filter(Boolean).join(', ');

      doc.fillColor(PRIMARY_BLUE).fontSize(18).font('Helvetica-Bold')
        .text(companyName, 130, y + 10, { width: CONTENT_WIDTH - 80 });
      doc.fillColor(GRAY).fontSize(10).font('Helvetica')
        .text(companyAddress || '', 130, y + 35, { width: CONTENT_WIDTH - 80 });
      if (company?.phone) {
        doc.text(`Tel: ${company.phone}`, 130, y + 48);
      }

      y += 90;
      doc.moveTo(50, y).lineTo(PAGE_WIDTH - 50, y).strokeColor(SECONDARY_BLUE).lineWidth(2).stroke();
      y += 30;

      // Title
      doc.fillColor(PRIMARY_BLUE).fontSize(22).font('Helvetica-Bold')
        .text('EXPERIENCE CERTIFICATE', 50, y, { width: CONTENT_WIDTH, align: 'center' });
      y += 50;

      // Date + reference
      doc.fillColor(DARK_TEXT).fontSize(10).font('Helvetica')
        .text(`Date: ${new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}`, 50, y)
        .text(`Ref: ${offboardingCase.caseNumber || ''}`, PAGE_WIDTH - 200, y, { width: 150, align: 'right' });
      y += 40;

      doc.fillColor(DARK_TEXT).fontSize(12).font('Helvetica-Bold')
        .text('TO WHOM IT MAY CONCERN', 50, y, { width: CONTENT_WIDTH });
      y += 30;

      // Body
      const fullName = employee.fullName || 'Employee';
      const position = employee.position || 'Employee';
      const joining = employee.joiningDate
        ? new Date(employee.joiningDate).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
        : 'N/A';
      const exit = offboardingCase.actualExitDate
        ? new Date(offboardingCase.actualExitDate).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
        : (offboardingCase.lastWorkingDate
          ? new Date(offboardingCase.lastWorkingDate).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
          : 'N/A');

      const bodyText =
        `This is to certify that Mr./Ms. ${fullName} (Employee ID: ${employee.employeeId || 'N/A'}) ` +
        `was employed with ${companyName} as ${position} from ${joining} to ${exit}.\n\n` +
        `During the period of employment, ${fullName.split(' ')[0]} demonstrated professionalism, dedication, ` +
        `and commitment to assigned responsibilities. We found ${fullName.split(' ')[0]} to be ` +
        `a diligent and sincere employee.\n\n` +
        `We wish ${fullName.split(' ')[0]} all the best in future endeavors.`;

      doc.fillColor(DARK_TEXT).fontSize(11).font('Helvetica')
        .text(bodyText, 50, y, { width: CONTENT_WIDTH, align: 'justify', lineGap: 6 });

      y = doc.y + 60;

      // Signature block
      doc.fontSize(11).font('Helvetica-Bold').text('For ' + companyName, 50, y);
      y += 50;
      doc.moveTo(50, y).lineTo(230, y).strokeColor(DARK_TEXT).lineWidth(1).stroke();
      y += 5;
      doc.fontSize(10).font('Helvetica').text('Authorized Signatory', 50, y);
      y += 15;
      doc.fillColor(GRAY).fontSize(9).text('Human Resources Department', 50, y);

      // Footer
      const footerY = doc.page.height - 60;
      doc.fillColor(GRAY).fontSize(8).font('Helvetica')
        .text(
          `This is a system-generated document. Generated on ${new Date().toLocaleString()}`,
          50,
          footerY,
          { width: CONTENT_WIDTH, align: 'center' }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = generateExperienceCertificatePdf;
