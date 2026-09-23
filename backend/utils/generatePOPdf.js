const PDFDocument = require('pdfkit');
const { PassThrough } = require('stream');
const path = require('path');
const fs = require('fs');

/**
 * Generate a professional Purchase Order PDF
 * @param {Object} poData - The purchase order data (fully populated)
 * @returns {Promise<Buffer>} - PDF as a buffer
 */
function generatePOPdf(poData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        bufferPages: false
      });

      // Create a PassThrough stream to collect data
      const bufferStream = new PassThrough();
      const chunks = [];

      // Collect all chunks from the stream
      bufferStream.on('data', (chunk) => {
        chunks.push(chunk);
      });

      // When stream ends, resolve with buffer
      bufferStream.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        resolve(pdfBuffer);
      });

      // Handle errors
      bufferStream.on('error', (err) => {
        console.error('Stream error:', err);
        reject(err);
      });

      doc.on('error', (err) => {
        console.error('PDF document error:', err);
        reject(err);
      });

      // Pipe document to our buffer stream
      doc.pipe(bufferStream);

      // Colors
      const PRIMARY_BLUE = '#1F4788';
      const SECONDARY_BLUE = '#4A90E2';
      const DARK_TEXT = '#333333';
      const LIGHT_BG = '#F5F5F5';
      const LIGHT_ROWS = '#F9F9F9';
      const GREEN = '#2ECC71';
      const GRAY = '#6B7280';

      const PAGE_WIDTH = doc.page.width;
      const PAGE_HEIGHT = doc.page.height;
      const CONTENT_WIDTH = PAGE_WIDTH - 80;
      let yPosition = 40;

      // Helper: Draw header with logo
      const drawHeader = () => {
        try {
          // Try to load and embed logo
          const logoPath = path.join(__dirname, '../../frontend/src/assets/logo/app-logo.png');
          if (fs.existsSync(logoPath)) {
            doc.image(logoPath, 40, yPosition, { width: 60, height: 60 });
            console.log('[PDF] Logo embedded successfully');
          } else {
            // Fallback: Draw colored box if logo not found
            doc.fillColor(PRIMARY_BLUE);
            doc.rect(40, yPosition, 60, 60).fill();
            doc.fillColor('white');
            doc.fontSize(18);
            doc.font('Helvetica-Bold');
            doc.text('PO', 45, yPosition + 12, { width: 50, align: 'center' });
          }
        } catch (err) {
          console.error('[PDF] Logo error:', err.message);
          // Fallback: Draw colored box
          doc.fillColor(PRIMARY_BLUE);
          doc.rect(40, yPosition, 60, 60).fill();
        }

        // Title
        doc.fillColor(DARK_TEXT);
        doc.fontSize(24);
        doc.font('Helvetica-Bold');
        doc.text('PURCHASE ORDER', 120, yPosition + 10, { width: CONTENT_WIDTH - 60 });

        // PO Number and Date on right
        doc.fontSize(10);
        doc.font('Helvetica');
        const createdDate = new Date(poData.createdAt).toLocaleDateString();
        const deliveryDate = poData.deliveryDate ? new Date(poData.deliveryDate).toLocaleDateString() : 'N/A';

        const poTypeLabels = { material: 'Material', manpower: 'Manpower Hiring', subcontracting: 'Subcontracting', machine_rental: 'Machine Rental' };
        doc.text(`PO #: ${poData.poNumber || 'N/A'}`, 420, yPosition + 10);
        doc.text(`Type: ${poTypeLabels[poData.poType] || 'Material'}`, 420, yPosition + 25);
        doc.text(`Date: ${createdDate}`, 420, yPosition + 40);
        doc.text(`Delivery: ${deliveryDate}`, 420, yPosition + 55);

        // Divider line
        doc.strokeColor(PRIMARY_BLUE);
        doc.lineWidth(2);
        doc.moveTo(40, yPosition + 75).lineTo(PAGE_WIDTH - 40, yPosition + 75).stroke();

        yPosition += 95;
      };

      // Helper: Draw Bill To / Ship To section
      const drawAddressSection = () => {
        const sectionHeight = 90;
        const colWidth = (CONTENT_WIDTH - 20) / 2;

        // Background
        doc.fillColor(LIGHT_BG);
        doc.rect(40, yPosition, CONTENT_WIDTH, sectionHeight).fill();

        // Left Column - Bill To
        doc.fillColor(DARK_TEXT);
        doc.fontSize(11);
        doc.font('Helvetica-Bold');
        doc.text('BILL TO:', 50, yPosition + 10);

        doc.fontSize(9);
        doc.font('Helvetica');
        doc.text('Company Address, City, Country', 50, yPosition + 25, { width: colWidth - 20 });

        // Right Column - Ship To
        const shipToX = 40 + colWidth + 10;
        doc.fillColor(DARK_TEXT);
        doc.fontSize(11);
        doc.font('Helvetica-Bold');
        doc.text('SHIP TO:', shipToX, yPosition + 10);

        doc.fontSize(9);
        doc.font('Helvetica');
        let shipToText = '';
        if (poData.supplier) {
          // Ensure text is properly encoded
          const supplierName = String(poData.supplier.name || 'N/A');
          shipToText = supplierName + '\n';
          if (poData.supplier.contactPerson) {
            shipToText += `Contact: ${String(poData.supplier.contactPerson)}\n`;
          }
          if (poData.supplier.address) {
            shipToText += `${String(poData.supplier.address)}\n`;
          }
          if (poData.supplier.phone) {
            shipToText += `Phone: ${String(poData.supplier.phone)}\n`;
          }
          if (poData.supplier.email) {
            shipToText += `Email: ${String(poData.supplier.email)}`;
          }
        }
        doc.text(shipToText, shipToX, yPosition + 25, { width: colWidth - 20 });

        yPosition += sectionHeight + 10;
      };

      // Helper: Draw VAT and Grand Total rows (shared between material and service)
      const drawTotalsRows = (currentY, subtotal, colWidths, totalColOffset) => {
        const rowHeight = 20;
        let xPos;

        // Subtotal row
        doc.fillColor(SECONDARY_BLUE);
        doc.rect(40, currentY, CONTENT_WIDTH, rowHeight).fill();
        doc.fillColor('white');
        doc.fontSize(9);
        doc.font('Helvetica-Bold');
        xPos = totalColOffset;
        doc.text('Subtotal:', xPos, currentY + 5, { align: 'center', width: colWidths.rate || colWidths.unitPrice });
        xPos += (colWidths.rate || colWidths.unitPrice);
        doc.text(`${subtotal.toFixed(2)}`, xPos, currentY + 5, { align: 'center', width: colWidths.totalPrice });
        currentY += rowHeight;

        // VAT row (if applicable)
        const vatPercentage = poData.vatPercentage || 0;
        if (vatPercentage > 0) {
          const vatAmount = subtotal * vatPercentage / 100;
          doc.fillColor('#f0f4f8');
          doc.rect(40, currentY, CONTENT_WIDTH, rowHeight).fill();
          doc.fillColor(PRIMARY_BLUE);
          doc.fontSize(9);
          doc.font('Helvetica');
          xPos = totalColOffset;
          doc.text(`VAT (${vatPercentage}%):`, xPos, currentY + 5, { align: 'center', width: colWidths.rate || colWidths.unitPrice });
          xPos += (colWidths.rate || colWidths.unitPrice);
          doc.text(`${vatAmount.toFixed(2)}`, xPos, currentY + 5, { align: 'center', width: colWidths.totalPrice });
          currentY += rowHeight;

          // Grand Total row
          doc.fillColor(PRIMARY_BLUE);
          doc.rect(40, currentY, CONTENT_WIDTH, rowHeight).fill();
          doc.fillColor('white');
          doc.fontSize(9);
          doc.font('Helvetica-Bold');
          xPos = totalColOffset;
          doc.text('Grand Total:', xPos, currentY + 5, { align: 'center', width: colWidths.rate || colWidths.unitPrice });
          xPos += (colWidths.rate || colWidths.unitPrice);
          doc.text(`${(subtotal + vatAmount).toFixed(2)}`, xPos, currentY + 5, { align: 'center', width: colWidths.totalPrice });
          currentY += rowHeight;
        }

        return currentY;
      };

      // Helper: Draw service items table
      const drawServiceItemsTable = () => {
        const tableTop = yPosition;
        const rowHeight = 20;
        const isMachineRental = poData.poType === 'machine_rental';
        const colWidths = isMachineRental
          ? { num: 20, description: 120, machineType: 70, rateType: 55, rate: 55, qty: 35, duration: 45, totalPrice: 75 }
          : { num: 20, description: 160, rateType: 60, rate: 60, qty: 45, duration: 50, totalPrice: 80 };

        // Header
        doc.fillColor(PRIMARY_BLUE);
        doc.rect(40, tableTop, CONTENT_WIDTH, rowHeight).fill();
        doc.fillColor('white');
        doc.fontSize(9);
        doc.font('Helvetica-Bold');

        let xPos = 45;
        doc.text('#', xPos, tableTop + 5, { align: 'center', width: colWidths.num });
        xPos += colWidths.num;
        doc.text('Description', xPos, tableTop + 5, { width: colWidths.description });
        xPos += colWidths.description;
        if (isMachineRental) {
          doc.text('Machine', xPos, tableTop + 5, { width: colWidths.machineType });
          xPos += colWidths.machineType;
        }
        doc.text('Rate Type', xPos, tableTop + 5, { align: 'center', width: colWidths.rateType });
        xPos += colWidths.rateType;
        doc.text('Rate', xPos, tableTop + 5, { align: 'center', width: colWidths.rate });
        xPos += colWidths.rate;
        doc.text('Qty', xPos, tableTop + 5, { align: 'center', width: colWidths.qty });
        xPos += colWidths.qty;
        doc.text('Duration', xPos, tableTop + 5, { align: 'center', width: colWidths.duration });
        xPos += colWidths.duration;
        doc.text('Total', xPos, tableTop + 5, { align: 'center', width: colWidths.totalPrice });

        // Data rows
        let currentY = tableTop + rowHeight;
        let rowNum = 1;
        let subtotal = 0;

        const rateTypeLabels = { hourly: 'Hourly', daily: 'Daily', monthly: 'Monthly', per_item: 'Per Item', lump_sum: 'Lump Sum' };

        (poData.serviceItems || []).forEach((item, idx) => {
          const rowBg = idx % 2 === 0 ? 'white' : LIGHT_ROWS;
          doc.fillColor(rowBg);
          doc.rect(40, currentY, CONTENT_WIDTH, rowHeight).fill();
          doc.fillColor(DARK_TEXT);
          doc.fontSize(8);
          doc.font('Helvetica');

          xPos = 45;
          doc.text(String(rowNum++), xPos, currentY + 5, { align: 'center', width: colWidths.num });
          xPos += colWidths.num;
          doc.text(String(item.description || '-'), xPos, currentY + 5, { width: colWidths.description, truncate: true });
          xPos += colWidths.description;
          if (isMachineRental) {
            doc.text(String(item.machineType || '-'), xPos, currentY + 5, { width: colWidths.machineType, truncate: true });
            xPos += colWidths.machineType;
          }
          doc.text(rateTypeLabels[item.rateType] || item.rateType || '-', xPos, currentY + 5, { align: 'center', width: colWidths.rateType });
          xPos += colWidths.rateType;
          doc.text(`${(item.rate || 0).toFixed(2)}`, xPos, currentY + 5, { align: 'center', width: colWidths.rate });
          xPos += colWidths.rate;
          doc.text(item.rateType === 'lump_sum' ? '-' : String(item.quantity || 1), xPos, currentY + 5, { align: 'center', width: colWidths.qty });
          xPos += colWidths.qty;
          doc.text(item.rateType === 'lump_sum' ? '-' : String(item.duration || 1), xPos, currentY + 5, { align: 'center', width: colWidths.duration });
          xPos += colWidths.duration;
          doc.text(`${(item.totalPrice || 0).toFixed(2)}`, xPos, currentY + 5, { align: 'center', width: colWidths.totalPrice });

          subtotal += (item.totalPrice || 0);
          currentY += rowHeight;
        });

        // Calculate offset for totals
        const totalColOffset = 45 + colWidths.num + colWidths.description + (isMachineRental ? colWidths.machineType : 0) + colWidths.rateType + colWidths.qty + colWidths.duration;
        currentY = drawTotalsRows(currentY, subtotal, colWidths, totalColOffset);

        yPosition = currentY + 10;
      };

      // Helper: Draw material order items table
      const drawItemsTable = () => {
        const tableTop = yPosition;
        const rowHeight = 20;
        const colWidths = {
          num: 25,
          material: 150,
          sku: 70,
          uom: 45,
          qty: 55,
          unitPrice: 65,
          totalPrice: 65
        };

        // Header
        doc.fillColor(PRIMARY_BLUE);
        doc.rect(40, tableTop, CONTENT_WIDTH, rowHeight).fill();
        doc.fillColor('white');
        doc.fontSize(9);
        doc.font('Helvetica-Bold');

        let xPos = 45;
        doc.text('#', xPos, tableTop + 5, { align: 'center', width: colWidths.num });
        xPos += colWidths.num;
        doc.text('Material Name', xPos, tableTop + 5, { width: colWidths.material });
        xPos += colWidths.material;
        doc.text('SKU', xPos, tableTop + 5, { align: 'center', width: colWidths.sku });
        xPos += colWidths.sku;
        doc.text('UOM', xPos, tableTop + 5, { align: 'center', width: colWidths.uom });
        xPos += colWidths.uom;
        doc.text('Qty', xPos, tableTop + 5, { align: 'center', width: colWidths.qty });
        xPos += colWidths.qty;
        doc.text('Unit Price', xPos, tableTop + 5, { align: 'center', width: colWidths.unitPrice });
        xPos += colWidths.unitPrice;
        doc.text('Total Price', xPos, tableTop + 5, { align: 'center', width: colWidths.totalPrice });

        // Data rows
        let currentY = tableTop + rowHeight;
        let rowNum = 1;
        let subtotal = 0;

        (poData.items || []).forEach((item, idx) => {
          const rowBg = idx % 2 === 0 ? 'white' : LIGHT_ROWS;
          doc.fillColor(rowBg);
          doc.rect(40, currentY, CONTENT_WIDTH, rowHeight).fill();
          doc.fillColor(DARK_TEXT);
          doc.fontSize(8);
          doc.font('Helvetica');

          xPos = 45;
          doc.text(String(rowNum++), xPos, currentY + 5, { align: 'center', width: colWidths.num });
          xPos += colWidths.num;
          doc.text(String(item.materialName || '-'), xPos, currentY + 5, { width: colWidths.material, truncate: true });
          xPos += colWidths.material;
          doc.text(String(item.sku || '-'), xPos, currentY + 5, { align: 'center', width: colWidths.sku });
          xPos += colWidths.sku;
          doc.text(String(item.uom || '-'), xPos, currentY + 5, { align: 'center', width: colWidths.uom });
          xPos += colWidths.uom;
          doc.text(String(item.quantity || 0), xPos, currentY + 5, { align: 'center', width: colWidths.qty });
          xPos += colWidths.qty;
          doc.text(`${(item.unitPrice || 0).toFixed(2)}`, xPos, currentY + 5, { align: 'center', width: colWidths.unitPrice });
          xPos += colWidths.unitPrice;
          const itemTotal = (item.quantity || 0) * (item.unitPrice || 0);
          doc.text(`${itemTotal.toFixed(2)}`, xPos, currentY + 5, { align: 'center', width: colWidths.totalPrice });

          subtotal += itemTotal;
          currentY += rowHeight;
        });

        // Totals
        const totalColOffset = 45 + colWidths.num + colWidths.material + colWidths.sku + colWidths.uom + colWidths.qty;
        currentY = drawTotalsRows(currentY, subtotal, colWidths, totalColOffset);

        yPosition = currentY + 10;
      };

      // Helper: Draw approvals section
      const drawApprovalsSection = () => {
        // Only add page if content truly won't fit (need more than remaining space)
        const APPROVALS_HEIGHT = 70;
        const FOOTER_SPACE = 60;
        const minRequiredSpace = APPROVALS_HEIGHT + FOOTER_SPACE;

        if (yPosition > PAGE_HEIGHT - minRequiredSpace) {
          doc.addPage();
          yPosition = 40;
        }

        // Section header
        doc.fillColor(SECONDARY_BLUE);
        doc.rect(40, yPosition, CONTENT_WIDTH, 20).fill();

        doc.fillColor('white');
        doc.fontSize(10);
        doc.font('Helvetica-Bold');
        doc.text('APPROVALS', 50, yPosition + 5);

        yPosition += 25;

        const colWidth = CONTENT_WIDTH / 2;

        // Account Manager
        doc.fillColor(LIGHT_BG);
        doc.rect(40, yPosition, colWidth, 50).fill();

        doc.fillColor(DARK_TEXT);
        doc.fontSize(9);
        doc.font('Helvetica-Bold');
        doc.text('Account Manager', 50, yPosition + 10);

        doc.fontSize(8);
        doc.font('Helvetica');
        if (poData.approvals?.accountManager?.userId && poData.approvals?.accountManager?.approvedAt) {
          doc.fillColor(GREEN);
          doc.text('Approved', 50, yPosition + 25);
          doc.fillColor(GRAY);
          doc.fontSize(7);
          const approvalDate = new Date(poData.approvals.accountManager.approvedAt).toLocaleDateString();
          doc.text(`Date: ${approvalDate}`, 50, yPosition + 35);
        } else {
          doc.fillColor(GRAY);
          doc.text('Pending', 50, yPosition + 25);
        }

        // General Manager
        const gmX = 40 + colWidth;
        doc.fillColor(LIGHT_BG);
        doc.rect(gmX, yPosition, colWidth, 50).fill();

        doc.fillColor(DARK_TEXT);
        doc.fontSize(9);
        doc.font('Helvetica-Bold');
        doc.text('General Manager', gmX + 10, yPosition + 10);

        doc.fontSize(8);
        doc.font('Helvetica');
        if (poData.approvals?.generalManager?.userId && poData.approvals?.generalManager?.approvedAt) {
          doc.fillColor(GREEN);
          doc.text('Approved', gmX + 10, yPosition + 25);
          doc.fillColor(GRAY);
          doc.fontSize(7);
          const approvalDate = new Date(poData.approvals.generalManager.approvedAt).toLocaleDateString();
          doc.text(`Date: ${approvalDate}`, gmX + 10, yPosition + 35);
        } else {
          doc.fillColor(GRAY);
          doc.text('Pending', gmX + 10, yPosition + 25);
        }

        yPosition += 60;
      };

      // Helper: Draw footer
      const drawFooter = () => {
        // Skip footer if this is a blank page (just created)
        // Only draw footer if substantial content has been added to this page
        if (yPosition < 120) {
          return;
        }

        // Position footer safely within content bounds (leave 40px bottom margin)
        const footerY = PAGE_HEIGHT - 60;

        // Border line
        doc.strokeColor(PRIMARY_BLUE);
        doc.lineWidth(1);
        doc.moveTo(40, footerY - 10).lineTo(PAGE_WIDTH - 40, footerY - 10).stroke();

        doc.fillColor(GRAY);
        doc.fontSize(8);
        doc.font('Helvetica');

        doc.text('Company Contact: support@company.com', 40, footerY);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 40, footerY + 10);
      };

      // Helper: Draw payment terms section
      const drawPaymentTerms = () => {
        if (!poData.paymentTerms || !poData.paymentTerms.type) return;

        if (yPosition > PAGE_HEIGHT - 120) {
          doc.addPage();
          yPosition = 40;
        }

        doc.fillColor(SECONDARY_BLUE);
        doc.rect(40, yPosition, CONTENT_WIDTH, 20).fill();
        doc.fillColor('white');
        doc.fontSize(10);
        doc.font('Helvetica-Bold');
        doc.text('PAYMENT TERMS', 50, yPosition + 5);
        yPosition += 25;

        doc.fillColor(DARK_TEXT);
        doc.fontSize(9);
        doc.font('Helvetica');

        const ptLabels = { full_advance: 'Full Advance Payment', partial_advance: 'Partial Advance', full_after_completion: 'Full Payment After Delivery/Completion' };
        doc.text(`Type: ${ptLabels[poData.paymentTerms.type] || poData.paymentTerms.type}`, 50, yPosition);
        yPosition += 14;

        if (poData.paymentTerms.type === 'partial_advance' && poData.paymentTerms.advancePercentage) {
          doc.text(`Advance: ${poData.paymentTerms.advancePercentage}%`, 50, yPosition);
          yPosition += 14;
        }

        if (poData.paymentTerms.notes) {
          doc.text(`Notes: ${poData.paymentTerms.notes}`, 50, yPosition, { width: CONTENT_WIDTH - 20 });
          yPosition = doc.y + 5;
        }

        yPosition += 10;
      };

      // Helper: Draw annexure section
      const drawAnnexure = () => {
        if (!poData.annexure || !poData.annexure.trim()) return;

        if (yPosition > PAGE_HEIGHT - 120) {
          doc.addPage();
          yPosition = 40;
        }

        doc.fillColor(SECONDARY_BLUE);
        doc.rect(40, yPosition, CONTENT_WIDTH, 20).fill();
        doc.fillColor('white');
        doc.fontSize(10);
        doc.font('Helvetica-Bold');
        doc.text('ANNEXURE', 50, yPosition + 5);
        yPosition += 25;

        // Strip HTML tags for PDF rendering
        const plainText = poData.annexure
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n')
          .replace(/<\/li>/gi, '\n')
          .replace(/<li>/gi, '  - ')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/&quot;/gi, '"')
          .trim();

        doc.fillColor(DARK_TEXT);
        doc.fontSize(9);
        doc.font('Helvetica');
        doc.text(plainText, 50, yPosition, { width: CONTENT_WIDTH - 20 });
        yPosition = doc.y + 10;
      };

      // Build PDF
      const isServicePO = ['manpower', 'subcontracting', 'machine_rental'].includes(poData.poType);

      drawHeader();
      drawAddressSection();
      if (isServicePO) {
        drawServiceItemsTable();
      } else {
        drawItemsTable();
      }
      drawPaymentTerms();
      drawAnnexure();
      drawApprovalsSection();
      drawFooter();

      // Finalize PDF
      doc.end();
    } catch (error) {
      console.error('PDF generation error:', error);
      reject(error);
    }
  });
}

module.exports = generatePOPdf;
