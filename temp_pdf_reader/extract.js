const fs = require('fs');
const PDFParser = require("pdf2json");

const pdfParser = new PDFParser(this, 1);

pdfParser.on("pdfParser_dataError", errData => console.error(errData.parserError) );
pdfParser.on("pdfParser_dataReady", pdfData => {
    fs.writeFileSync("../Documentation/PRD.txt", pdfParser.getRawTextContent());
    console.log("Extracted text to PRD.txt");
});

pdfParser.loadPDF("../Documentation/CREDIT OS (LENDR) PRD.pdf");
