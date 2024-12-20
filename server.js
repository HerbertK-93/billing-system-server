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

    // Header Section
    doc.fontSize(25).text('INNOVATION CONSORTIUM', { align: 'center' });
    doc.fontSize(15).text('We Innovate', { align: 'center', italic: true });
    doc.fontSize(10).text('Location: Bweyogerere, Butto', { align: 'center' });
    doc.fontSize(10).text('Email: innovationconsortium@gmail.com', { align: 'center' });
    doc.fontSize(10).text('Tel: +256 753 434679', { align: 'center' });
    doc.moveDown(2);

    // Client and Invoice Details Section
    doc.fontSize(12).text(`Invoice ID: ${invoiceId}`);
    doc.text(`Client Name: ${invoiceData.clientName || 'N/A'}`);
    doc.text(`Client Address: ${invoiceData.clientAddress || 'N/A'}`);
    doc.text(`Client Email: ${invoiceData.clientEmail || 'N/A'}`);
    doc.text(`Category: ${invoiceData.category || 'Uncategorized'}`); // Include category
    doc.text(`Date: ${invoiceData.date || 'N/A'}`);
    doc.moveDown();

    // Table Headers
    const tableTop = doc.y;
    const itemMargin = 5;

    // Define column widths (fit landscape width)
    const pageWidth = 700; // Landscape page width
    const columnCount = 5;
    const colWidth = pageWidth / columnCount;

    const startX = doc.x;

    // Draw Table Headers
    doc.fontSize(10).font('Helvetica-Bold');
    const headers = ['Name', 'Description', 'Quantity', 'Rate (UGX)', 'Amount (UGX)'];
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
          item.name || 'N/A',
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
    rowY += 10;
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text(`Grand Total: UGX ${invoiceData.grandTotal?.toFixed(2) || '0.00'}`, startX, rowY, {
      align: 'right',
      width: pageWidth,
    });

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
