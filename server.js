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
    const doc = new PDFDocument({ margin: 50 });
    const filePath = path.join(__dirname, `invoice_${invoiceId}.pdf`);
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    // Header Section
    doc.fontSize(25).text('INNOVATION CONSORTIUM', { align: 'center' });
    doc.fontSize(15).text('Your Trusted Billing Partner', { align: 'center', italic: true });
    doc.fontSize(10).text('Location: Bweyogerere, Butto', { align: 'center' });
    doc.fontSize(10).text('Email: innovationconsortium@gmail.com', { align: 'center' });
    doc.fontSize(10).text('Tel: +256 753 434679', { align: 'center' });
    doc.moveDown(2);

    // Client and Invoice Details Section
    doc.fontSize(12).text(`Invoice ID: ${invoiceId}`);
    doc.text(`Client Name: ${invoiceData.clientName || 'N/A'}`);
    doc.text(`Client Address: ${invoiceData.clientAddress || 'N/A'}`);
    doc.text(`Client Email: ${invoiceData.clientEmail || 'N/A'}`);
    doc.text(`Date: ${invoiceData.date || 'N/A'}`);
    doc.moveDown();

    // Items Section
    doc.fontSize(14).text('Items:', { underline: true });
    doc.moveDown(0.5);

    if (Array.isArray(invoiceData.items)) {
      const tableHeaders = ['Name', 'Description', 'Quantity', 'Price'];
      const colWidths = [150, 200, 100, 100];

      doc.fontSize(12);
      doc.text(`${tableHeaders.join(' | ')}`, { underline: true });

      invoiceData.items.forEach((item, index) => {
        doc.text(
          `${index + 1}. ${item.name || 'N/A'} | ${item.description || 'N/A'} | Quantity: ${item.quantity || 0} | Price: ${item.price || 0}`
        );
      });
    } else {
      doc.fontSize(12).text('No items available.');
    }

    // Financial Summary Section
    doc.moveDown(2);
    doc.fontSize(14).text('Summary:', { underline: true });
    doc.fontSize(12).text(`Other Expenses: ${invoiceData.otherExpenses || 'N/A'}`);
    doc.text(`Immediate Investment: ${invoiceData.immediateInvestment || 'N/A'}`);
    doc.text(`Days to Supply: ${invoiceData.daysToSupply || 'N/A'}`);
    doc.text(`Percentage Interest Charged: ${invoiceData.percentageInterestCharged || 'N/A'}`);
    doc.text(`Rate: ${invoiceData.rate || 'N/A'}`);
    doc.text(`Total Investment: ${invoiceData.totalInvestment || 'N/A'}`);
    doc.text(`Total Profit: ${invoiceData.totalProfit || 'N/A'}`);
    doc.moveDown(2);
    doc.fontSize(10).text(
      'Thank you for doing business with INNOVATION CONSORTIUM.',
      { align: 'center', italic: true }
    );

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
