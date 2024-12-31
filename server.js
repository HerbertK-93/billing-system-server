const express = require('express');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const cors = require('cors'); // CORS Middleware

const app = express();
const PORT = 3000;

// Firebase Admin SDK Initialization
admin.initializeApp({
  credential: admin.credential.cert(require('./serviceAccountKey.json')),
});

const db = admin.firestore();

// Utility function to convert numbers to words
const numberToWords = (num) => {
  const a = [
    '',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
    'thirteen',
    'fourteen',
    'fifteen',
    'sixteen',
    'seventeen',
    'eighteen',
    'nineteen',
  ];
  const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const g = ['', 'thousand', 'million', 'billion', 'trillion'];

  const convertHundreds = (n) => {
    if (n < 100) return convertTens(n);
    return `${a[Math.floor(n / 100)]} hundred${n % 100 !== 0 ? ` and ${convertTens(n % 100)}` : ''}`;
  };

  const convertTens = (n) => {
    if (n < 20) return a[n];
    return `${b[Math.floor(n / 10)]}${n % 10 !== 0 ? `-${a[n % 10]}` : ''}`;
  };

  const convert = (n) => {
    if (n === 0) return 'zero';
    let str = '';
    let group = 0;

    while (n > 0) {
      const remainder = n % 1000;
      if (remainder !== 0) {
        str = `${convertHundreds(remainder)} ${g[group]} ${str}`.trim();
      }
      n = Math.floor(n / 1000);
      group++;
    }
    return str;
  };

  return convert(num);
};

// Middleware
app.use(bodyParser.json());
app.use(cors()); // Enable CORS for all routes

// Endpoint to generate and download an invoice as a PDF
app.get('/downloadInvoice/:invoiceId', async (req, res) => {
  const invoiceId = req.params.invoiceId;

  try {
    // Fetch invoice data from Firestore
    const invoiceDoc = await db.collection('invoices').doc(invoiceId).get();

    if (!invoiceDoc.exists) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoiceData = invoiceDoc.data();

    // Generate PDF
    const doc = new PDFDocument({
      margin: 50,
      layout: 'landscape', // Change page orientation to landscape
    });
    const filePath = path.join(__dirname, `invoice_${invoiceId}.pdf`);
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    // Add watermark (Company Logo)
    const watermarkPath = path.join(__dirname, 'public/assets/consortiumlogo-removebg-preview(1).png');
    if (!fs.existsSync(watermarkPath)) {
      throw new Error(`Watermark image not found at ${watermarkPath}`);
    }

    // Get the center position for the watermark
    const pageWidth = 842; // Standard landscape A4 page width in points
    const pageHeight = 595; // Standard landscape A4 page height in points
    const watermarkWidth = 400; // Desired width of the watermark
    const watermarkHeight = 200; // Desired height of the watermark
    const centerX = (pageWidth - watermarkWidth) / 2;
    const centerY = (pageHeight - watermarkHeight) / 2;

    // Add the watermark image
    doc.image(watermarkPath, centerX, centerY, {
      width: watermarkWidth,
      height: watermarkHeight,
      opacity: 0.1, // More faint for a modern look
    });

    // Header Section
    doc.fontSize(25).text('INNOVATION CONSORTIUM', { align: 'center' });
    doc.fontSize(15).text('Think Different, Live Different', { align: 'center', italic: true });
    doc.fontSize(10).text('Location: Bweyogerere, Plot no. 732 Jinja Rd.', { align: 'center' });
    doc.fontSize(10).text('Address: P.O BOX 31054 Kamapala (U)', { align: 'center' });
    doc.fontSize(10).text('Tel: +256 753 434679 +256 905 521', { align: 'center' });
    doc.moveDown(2);

    // Client and Invoice Details Section
    doc.fontSize(12).text(`Invoice ID: ${invoiceId}`);
    doc.text(`Client Name: ${invoiceData.clientName || 'N/A'}`);
    doc.text(`Client Address: ${invoiceData.clientAddress || 'N/A'}`);
    doc.text(`Client Email: ${invoiceData.clientEmail || 'N/A'}`);
    doc.text(`Category: ${invoiceData.category || 'Uncategorized'}`);
    doc.text(`Date: ${invoiceData.date || 'N/A'}`);
    doc.moveDown();

    // Table Headers
    const tableTop = doc.y;
    const itemMargin = 5;

    // Define column widths (fit landscape width)
    const tableWidth = 700; // Adjust width specifically for table layout
    const columnCount = 5;
    const colWidth = tableWidth / columnCount;
    const startX = doc.x;

    // Draw Table Headers
    doc.fontSize(10).font('Helvetica-Bold');
    const headers = ['Number', 'Description', 'Quantity', 'Rate (UGX)', 'Amount (UGX)'];
    headers.forEach((header, index) => {
      const colX = startX + colWidth * index;
      doc.rect(colX, tableTop, colWidth, 25).stroke();
      doc.text(header, colX + itemMargin, tableTop + 7, {
        width: colWidth - itemMargin * 2,
        align: 'center',
      });
    });

    // Table Rows
    let rowY = tableTop + 25;
    doc.font('Helvetica').fontSize(10);

    if (Array.isArray(invoiceData.items)) {
      invoiceData.items.forEach((item) => {
        const rowHeight = 25;

        const cells = [
          item.number || 'N/A',
          item.description || 'N/A',
          `${item.quantity || 0}`,
          `UGX ${item.rate?.toFixed(2) || '0.00'}`,
          `UGX ${item.amount?.toFixed(2) || '0.00'}`,
        ];

        cells.forEach((text, index) => {
          const colX = startX + colWidth * index;
          doc.rect(colX, rowY, colWidth, rowHeight).stroke();
          doc.text(text, colX + itemMargin, rowY + 7, {
            width: colWidth - itemMargin * 2,
            align: 'center',
          });
        });

        rowY += rowHeight;
      });
    } else {
      doc.text('No items available.', startX, rowY + 5);
    }

    // Grand Total
    const grandTotal = invoiceData.grandTotal || 0;
    rowY += 10;
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text(`Grand Total: UGX ${grandTotal.toFixed(2)}`, startX, rowY, {
      align: 'left',
      width: pageWidth,
    });

    // Grand Total in Words
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text(`Amount In Words: ${numberToWords(Math.floor(grandTotal))} Uganda Shillings Only`, {
      align: 'left',
    });

    // Divider line
doc.moveDown(0.5);
doc.lineWidth(1)
  .moveTo(doc.x, doc.y)
  .lineTo(doc.page.width - doc.x, doc.y)
  .stroke();

    doc.moveDown(1);
doc.fontSize(10).text('Discount', { align: 'left', italic: true });
doc.moveDown(0.5);
doc.fontSize(10).font('Helvetica-Bold').text('Terms of payment', { align: 'left' });
doc.moveDown(0.5);
doc.fontSize(10).font('Helvetica-Bold').text('All accounts are due on demand.', { align: 'left' });
doc.moveDown(0.5);
doc.fontSize(10).font('Helvetica-Bold').text('30% to be paid when picking the items.', { align: 'left' });

    // Add Signature Space
    doc.moveDown(1);
    doc.fontSize(12).text('Signature:', {
      align: 'left',
    });
    doc.moveDown(2);
    doc.lineWidth(1)
      .moveTo(doc.x, doc.y)
      .lineTo(doc.x + 200, doc.y)
      .stroke();
    doc.moveDown(2);

    doc.moveDown(2);
    doc.fontSize(10).text('Thank you for doing business with INNOVATION CONSORTIUM.', {
      align: 'center',
      italic: true,
    });

    doc.end();

    // Wait for PDF generation and send the file
    stream.on('finish', () => {
      res.download(filePath, `invoice_${invoiceId}.pdf`, (err) => {
        if (!err) {
          fs.unlinkSync(filePath); // Delete the file after sending
        }
      });
    });
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
