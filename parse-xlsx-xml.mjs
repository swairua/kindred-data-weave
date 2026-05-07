import AdmZip from 'adm-zip';
import fs from 'fs';
import { parseStringPromise } from 'xml2js';

async function parseXLSXdata() {
  try {
    console.log("Opening XLSX as ZIP file...");
    const zip = new AdmZip('./ATTERTEST.xlsx');
    const entries = zip.getEntries();
    
    console.log(`✓ ZIP opened successfully, ${entries.length} files found\n`);
    
    // Get worksheet1 XML
    const wsEntry = zip.getEntry('xl/worksheets/sheet1.xml');
    if (!wsEntry) {
      console.log("sheet1.xml not found");
      return;
    }
    
    const wsXml = wsEntry.getData().toString('utf8');
    console.log("=== WORKSHEET1 XML (First 2000 chars) ===");
    console.log(wsXml.substring(0, 2000));
    
    // Get shared strings
    const ssEntry = zip.getEntry('xl/sharedStrings.xml');
    const sharedStrings = [];
    if (ssEntry) {
      const ssXml = ssEntry.getData().toString('utf8');
      console.log("\n=== SHARED STRINGS XML (First 1000 chars) ===");
      console.log(ssXml.substring(0, 1000));
      
      // Extract text values from sharedStrings
      const textRegex = /<t[^>]*>([^<]*)<\/t>/g;
      let match;
      let idx = 0;
      while ((match = textRegex.exec(ssXml)) !== null) {
        sharedStrings[idx++] = match[1];
      }
      console.log(`\n✓ Extracted ${sharedStrings.length} shared strings`);
    }
    
    // Parse worksheet cells
    console.log("\n=== PARSING CELL DATA ===");
    const cellRegex = /<c r="([A-Z]+\d+)"[^>]*t="?([a-z]*)"?[^>]*>(?:<v>([^<]*)<\/v>)?/g;
    let match;
    const cells = [];
    let cellCount = 0;
    
    while ((match = cellRegex.exec(wsXml)) !== null) {
      const cellRef = match[1];
      const cellType = match[2] || 'n'; // default to number
      const cellValue = match[3];
      
      let displayValue = cellValue;
      if (cellType === 's' && cellValue !== undefined) {
        // String reference to sharedStrings
        const strIndex = parseInt(cellValue);
        if (sharedStrings[strIndex]) {
          displayValue = sharedStrings[strIndex];
        }
      }
      
      if (displayValue !== undefined && displayValue !== '') {
        cells.push({
          ref: cellRef,
          type: cellType,
          value: displayValue
        });
        
        if (cellCount < 200) {
          console.log(`  ${cellRef} (type: ${cellType}): ${displayValue}`);
        }
        cellCount++;
      }
    }
    
    console.log(`\n✓ Extracted ${cellCount} total cells with data`);
    
    // Save to JSON
    const output = {
      sharedStringsCount: sharedStrings.length,
      cellCount: cellCount,
      cells: cells.slice(0, 500), // Save first 500 cells as sample
      allCells: cells
    };
    
    fs.writeFileSync('./xlsx-parsed.json', JSON.stringify(output, null, 2));
    console.log(`\n✓ Saved parsed data to xlsx-parsed.json`);
    
  } catch (error) {
    console.error("Error:", error.message);
    console.error(error.stack);
  }
}

parseXLSXdata();
