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
    const category = invoiceData.category || 'Uncategorized';
    const items = invoiceData.items || []; // Ensure 'items' is defined here


    // Generate PDF
    const doc = new PDFDocument({
      margin: 50,
      layout: 'landscape', // Change page orientation to landscape
    });
    const filePath = path.join(__dirname, `invoice_${invoiceId}.pdf`);
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    // Add logo in the top-left corner
    const logoPath = path.join(__dirname, 'public/assets/cornerlogo.png');
    if (!fs.existsSync(logoPath)) {
      throw new Error(`Logo image not found at ${logoPath}`);
    }

    doc.image(logoPath, 50, 50, {
      width: 100, // Set width for the logo
    });

    // Header Section
    doc.fontSize(25).text('INNOVATION CONSORTIUM LIMITED', { align: 'center' });
    doc.fontSize(15).text('Think Different, Live Different', { align: 'center', italic: true });
    doc.fontSize(10).text('Location: Bweyogerere, Plot no. 732 Jinja Rd.', { align: 'center' });
    doc.fontSize(10).text('Address: P.O BOX 31054 Kamapala (U)', { align: 'center' });
    doc.fontSize(10).text('Tel: +256 753 434679  +256 772 905521', { align: 'center' });
    doc.moveDown(2);

    // Client and Invoice Details Section
doc.fontSize(12)
.text(`Client Name: ${invoiceData.clientName || 'N/A'}`, 50, doc.y) // Start from the left
.text(`Client Address: ${invoiceData.clientAddress || 'N/A'}`)
.text(`Client Email: ${invoiceData.clientEmail || 'N/A'}`)

  // Ensure the document object is initialized and has a valid `y` position
  const tableStartY = doc.y + 30; // Adjust table position

    // Invoice ID and Date (unchanged positions)
    doc.text(`Invoice ID: ${invoiceId}`, doc.page.width - 200, tableStartY - 60, { align: 'right' });
    doc.text(`Date: ${invoiceData.date || 'N/A'}`, doc.page.width - 200, tableStartY - 40, { align: 'right' });

     // Define headers and column widths
     let headers = ['Number', 'Description', 'Quantity', 'Rate (UGX)', 'Amount (UGX)'];
     let colWidths = [100, 200, 90, 150, 150];
     let rows = items.map((item) => [
       item.number || 'N/A',
       item.description || 'N/A',
       item.quantity || 0,
       (item.rate || 0).toFixed(2),
       (item.amount || 0).toFixed(2),
     ]);
 
     // Adjust headers and rows for specific categories
     if (['Maintenance', 'Fabrication', 'Installation', 'Designing'].includes(category)) {
       headers = ['Number', 'Description', 'No of Workers', 'No of Days', 'Hours in Day', 'Rate (UGX)', 'Amount (UGX)'];
       colWidths = [90, 150, 80, 80, 80, 100, 120];
       rows = items.map((item) => [
         item.number || 'N/A',
         item.description || 'N/A',
         item.numberOfWorkers || 0,
         item.numberOfDays || 0,
         item.hoursInDay || 0,
         (item.rate || 0).toFixed(2),
         (item.amount || 0).toFixed(2),
       ]);
     } else if (['Supply', 'Machining'].includes(category)) {
       headers = ['Number', 'Description', 'Quantity', 'Rate (UGX)', 'Amount (UGX)'];
       colWidths = [100, 200, 90, 150, 150];
       rows = items.map((item) => [
         item.number || 'N/A',
         item.description || 'N/A',
         item.quantity || 0,
         (item.rate || 0).toFixed(2),
         (item.amount || 0).toFixed(2),
       ]);
     }
 
     // Draw the table
     let currentY = tableStartY + 10;
 
     // Table header
     doc.font('Helvetica-Bold').fontSize(10);
     headers.forEach((header, i) => {
       const columnWidth = colWidths[i] || 100;
       doc.rect(50 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), currentY, columnWidth, 20).stroke();
       doc.text(header, 55 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), currentY + 5, {
         width: columnWidth - 10,
         align: 'center',
       });
     });
     currentY += 20;
 
     // Table rows
     // Draw the Table Rows
doc.font('Helvetica').fontSize(10);
rows.forEach((row) => {
  row.forEach((cell, i) => {
    const columnWidth = colWidths[i] || 100; // Default column width if undefined
    const cellValue = cell !== undefined && cell !== null ? cell.toString() : ''; // Ensure no undefined values
    doc.rect(50 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), currentY, columnWidth, 20).stroke();
    doc.text(cellValue, 55 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), currentY + 5, {
      width: columnWidth - 10,
      align: 'center',
    });
  });
  currentY += 20;
});

// Add Total Amount Row for Categories That Require It
if (['Supply', 'Fabrication', 'Machining', 'Designing', 'Maintenance'].includes(category)) {
  const totalAmount = rows.reduce((sum, row) => sum + parseFloat(row[row.length - 1] || 0), 0); // Sum the last column
  doc.font('Helvetica-Bold').fontSize(10);

  // Render "Total Amount" label and value
  doc.font('Helvetica-Bold').fontSize(10);

  // Draw the label in the first column (aligned below "Number")
  const labelX = 50; // Start position for the "Number" column
  const valueX = doc.page.width - 150; // End position for the "Amount (UGX)" column
  const rowHeight = 20;

  // Render the "Total Amount" label
  doc.text('Total Amount', labelX, currentY + 5, {
    align: 'center',
    width: colWidths[0], // Same width as the "Number" column
  });

  // Render the total row
  headers.forEach((header, i) => {
    const columnWidth = colWidths[i] || 100; // Default column width if undefined
    const cellValue = i === headers.length - 1 ? totalAmount.toFixed(2) : ''; // Display total only in the last column
    doc.rect(50 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), currentY, columnWidth, 20).stroke();
    doc.text(cellValue, 55 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), currentY + 5, {
      width: columnWidth - 10,
      align: 'center',
    });
  });

  currentY += 20;
}

 
if (category === 'General') {
  currentY += 20; // Add spacing

  // Add extra rows for Consumables, Labour, Sub-Total 2, VAT, and Grand Total
  const generalRows = [
    { label: 'Consumables', value: items.reduce((sum, item) => sum + (item.consumables || 0), 0) },
    { label: 'Labour', value: items.reduce((sum, item) => sum + (item.labour || 0), 0) },
    { label: 'Sub-Total 2', value: items.reduce((sum, item) => sum + (item.subTotal2 || 0), 0) },
    { label: 'VAT', value: items.reduce((sum, item) => sum + (item.vat || 0), 0) },
    { label: 'Grand Total', value: items.reduce((sum, item) => sum + (item.grandTotal || 0), 0) },
  ];

  generalRows.forEach((row) => {
    headers.forEach((header, i) => {
      const columnWidth = colWidths[i] || 100;
      let cellValue = '';

      // Bold the label in the "Number" column
      if (i === 0) {
        doc.font('Helvetica-Bold'); // Set bold font for labels
        cellValue = row.label;
      } else if (i === headers.length - 1) {
        doc.font('Helvetica'); // Set back to normal font for values
        cellValue = row.value.toFixed(2);
      }

      doc.rect(50 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), currentY, columnWidth, 20).stroke();
      doc.text(cellValue, 55 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), currentY + 5, {
        width: columnWidth - 10,
        align: 'center',
      });
    });
    currentY += 20;
  });
}


  // Total Amount in Words (All Categories Except General)
if (category !== 'General') {
  const totalAmount = rows.reduce((sum, row) => sum + parseFloat(row[row.length - 1] || 0), 0);
  const totalInWords = numberToWords(Math.floor(totalAmount));

  currentY += 40; // Add spacing below the table
  doc.font('Helvetica-Bold').fontSize(12).text(
    `Total Amount in Words: ${totalInWords} Uganda Shillings Only`,
    50, // Align to the left-hand side of the page
    currentY,
    {
      align: 'left', // Left alignment
    }
  );

  currentY += 20; // Add spacing after the "Total Amount in Words"
}


// Signature Section
doc.moveDown(2);
doc.fontSize(12).text('Signature:', 50, doc.y); // Explicitly setting the left margin

// Add signature image, ensuring it is aligned to the left
const signatureImagePath = path.join(__dirname, 'public/assets/mdsign.png');
if (fs.existsSync(signatureImagePath)) {
  doc.image(signatureImagePath, 50, doc.y, {
    width: 200,
    height: 50,
  });
  doc.moveDown(3);
}

// Draw a signature line explicitly aligned to the left margin
doc.lineWidth(1).moveTo(50, doc.y).lineTo(250, doc.y).stroke();

// Thank You Section
doc.moveDown(2);
doc.fontSize(10).text('Thank you for doing business with INNOVATION CONSORTIUM.', {
  align: 'center', // Centered as required
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

// Endpoint to generate and download a summary as a PDF
app.get('/downloadSummary/:summaryId', async (req, res) => {
  const summaryId = req.params.summaryId;

  try {
    // Fetch summary data from Firestore
    const summaryDoc = await db.collection('summary').doc(summaryId).get();

    if (!summaryDoc.exists) {
      return res.status(404).json({ error: 'Summary not found' });
    }

    const summaryData = summaryDoc.data();

    // Generate PDF
    const doc = new PDFDocument({ margin: 50 });
    const filePath = path.join(__dirname, `summary_${summaryId}.pdf`);
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    // Header Section
    doc.fontSize(25).text('INNOVATION CONSORTIUM', { align: 'center' });
    doc.fontSize(15).text('Summary Report', { align: 'center', underline: true });
    doc.fontSize(12).moveDown().text(`Summary ID: ${summaryId}`, { align: 'left' });

    // Client Information
    doc.moveDown().fontSize(16).text('Client Information', { underline: true });
    doc.fontSize(12)
      .text(`Client Name: ${summaryData.clientName || 'Unknown'}`)
      .text(`Client Address: ${summaryData.clientAddress || 'Unknown'}`)
      .text(`Client Email: ${summaryData.clientEmail || 'Unknown'}`)
      .text(`Category: ${summaryData.category || 'Unknown'}`)
      .text(`Date: ${summaryData.date || 'Unknown'}`);

    // Items Section
    const items = summaryData.items || [];
    if (items.length > 0) {
      doc.moveDown().fontSize(16).text('Items', { underline: true });

      items.forEach((item, index) => {
        doc.fontSize(12)
          .moveDown(0.5)
          .text(`Item ${index + 1}`)
          .text(`Number: ${item.number || 'Unknown'}`)
          .text(`Description: ${item.description || 'Unknown'}`)
          .text(`Quantity: ${item.quantity || 0}`)
          .text(`Qualification of Workers: ${item.qualificationOfWorkers || 0}`)
          .text(`Number of Workers: ${item.numberOfWorkers || 0}`)
          .text(`Number of Days: ${item.numberOfDays || 0}`)
          .text(`Hours in Day: ${item.hoursInDay || 0}`)
          .text(`Money paid per hour per person: ${item.moneyPaidPerHourPerPerson || 0}`)
          .text(`Days to Supply: ${item.daysToSupply || 0}`)
          .text(`% Interest Charged: ${item.interestPercentage || 0}%`)
          .text(`Market Price: UGX ${item.marketPrice?.toFixed(2) || '0.00'}`)
          .text(`Other Expenses: UGX ${item.otherExpenses?.toFixed(2) || '0.00'}`)
          .text(`Machining Cost: UGX ${item.machiningCost?.toFixed(2) || '0.00'}`)
          .text(`Immediate Investment: UGX ${item.immediateInvestment?.toFixed(2) || '0.00'}`)
          .text(`Total Investment: UGX ${item.totalInvestment?.toFixed(2) || '0.00'}`)
          .text(`% Markup: ${item.markupPercentage || 0}%`)
          .text(`Profit: UGX ${item.profit?.toFixed(2) || '0.00'}`)
          .text(`Rate: UGX ${item.rate?.toFixed(2) || '0.00'}`)
          .text(`Amount: UGX ${item.amount?.toFixed(2) || '0.00'}`)
          .text(`Sub-Total 1: UGX ${item.subTotal1?.toFixed(2) || '0.00'}`)
          .text(`Consumables Percentage: ${item.consumablesPercentage|| 0}%`)
          .text(`Consumables: UGX ${item.consumables?.toFixed(2) || '0.00'}`)
          .text(`Labour Percentage: ${item.labourPercentage || 0}%`)
          .text(`Labour: UGX ${item.labour?.toFixed(2) || '0.00'}`)
          .text(`Sub-Total 2: ${item.subTotal2?.toFixed(2) || '0.00'}`)
          .text(`VAT: ${item.vat?.toFixed(2) || '0.00'}`)
          .text(`Grand Total: UGX ${item.grandTotal?.toFixed(2) || '0.00'}`)

      });
    } else {
      doc.moveDown().text('No items available.', { align: 'left' });
    }

    doc.end();

    // Wait for PDF generation and send the file
    stream.on('finish', () => {
      res.download(filePath, `summary_${summaryId}.pdf`, (err) => {
        if (!err) {
          fs.unlinkSync(filePath); // Delete the file after sending
        }
      });
    });
  } catch (error) {
    console.error('Error generating summary:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
