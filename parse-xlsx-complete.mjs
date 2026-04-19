import fs from 'fs';
import { inflateRawSync } from 'zlib';

function parseZipFile(buffer) {
  const files = new Map();
  let pos = 0;
  
  const PK34 = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  
  while (pos < buffer.length - 30) {
    const sliceStart = buffer.indexOf(PK34, pos);
    if (sliceStart === -1) break;
    
    pos = sliceStart;
    
    const compression = buffer.readUInt16LE(pos + 8);
    const filenameLen = buffer.readUInt16LE(pos + 26);
    const extraLen = buffer.readUInt16LE(pos + 28);
    const compressedSize = buffer.readUInt32LE(pos + 18);
    const uncompressedSize = buffer.readUInt32LE(pos + 22);
    
    const headerStart = pos + 30;
    const filename = buffer.toString('utf8', headerStart, headerStart + filenameLen);
    const dataStart = headerStart + filenameLen + extraLen;
    const dataEnd = dataStart + compressedSize;
    
    if (dataEnd <= buffer.length) {
      let data = buffer.slice(dataStart, dataEnd);
      
      if (compression === 8) {
        try {
          data = inflateRawSync(data, { maxOutputLength: 10 * 1024 * 1024 });
        } catch (e) {
          console.warn(`Failed to decompress ${filename}`);
        }
      }
      
      files.set(filename, data);
    }
    
    pos = dataEnd;
  }
  
  return files;
}

function parseXLSXXml() {
  try {
    console.log("Reading ATTERTEST.xlsx...");
    const buffer = fs.readFileSync('./ATTERTEST.xlsx');
    console.log(`✓ File read (${buffer.length} bytes)\n`);
    
    console.log("Parsing ZIP and decompressing...");
    const files = parseZipFile(buffer);
    console.log(`✓ Found ${files.size} files\n`);
    
    // Extract shared strings
    let sharedStrings = [];
    if (files.has('xl/sharedStrings.xml')) {
      const ssData = files.get('xl/sharedStrings.xml');
      const ssXml = ssData.toString('utf8');
      
      // Extract all text values from sharedStrings.xml
      const tRegex = /<t[^>]*>([^<]*)<\/t>/g;
      let match;
      while ((match = tRegex.exec(ssXml)) !== null) {
        sharedStrings.push(match[1]);
      }
      console.log(`✓ Extracted ${sharedStrings.length} shared strings\n`);
    }
    
    // Extract worksheet
    let wsXml = null;
    if (files.has('xl/worksheets/sheet1.xml')) {
      const wsData = files.get('xl/worksheets/sheet1.xml');
      wsXml = wsData.toString('utf8');
      console.log(`✓ Worksheet XML length: ${wsXml.length} bytes\n`);
      
      // First, show a snippet of the raw XML
      console.log("=== RAW WORKSHEET XML SNIPPET (first 2000 chars) ===");
      console.log(wsXml.substring(0, 2000));
      console.log("...\n");
    }
    
    // Parse all cells more comprehensively
    if (wsXml) {
      console.log("=== PARSING ALL CELLS ===");
      
      // Match cells more broadly - support multiple formats
      // Pattern: <c r="A1" t="type"> ... <v>value</v> ... </c>
      const cellRegex = /<c r="([A-Z0-9]+)"[^>]*(?:t="([a-z])")?[^>]*>(?:<[^>]*>)*(?:<v>([^<]*)<\/v>)?(?:<[^>]*>)*<\/c>/g;
      
      const cells = {};
      let match;
      
      while ((match = cellRegex.exec(wsXml)) !== null) {
        const cellRef = match[1];
        const cellType = match[2] || 'n'; // default number
        const cellValue = match[3];
        
        if (cellValue !== undefined && cellValue !== null && cellValue !== '') {
          let displayValue = cellValue;
          
          // If it's a string reference, look up in shared strings
          if (cellType === 's') {
            const idx = parseInt(cellValue);
            if (sharedStrings[idx]) {
              displayValue = sharedStrings[idx];
            }
          }
          
          cells[cellRef] = {
            type: cellType,
            rawValue: cellValue,
            displayValue: displayValue
          };
        }
      }
      
      console.log(`✓ Found ${Object.keys(cells).length} cells with data\n`);
      
      // Display all cells organized by row
      console.log("=== ALL CELLS ORGANIZED BY ROW ===");
      const sortedRefs = Object.keys(cells).sort((a, b) => {
        const aRow = parseInt(a.match(/\d+/)[0]);
        const bRow = parseInt(b.match(/\d+/)[0]);
        if (aRow !== bRow) return aRow - bRow;
        
        const aCol = a.match(/[A-Z]+/)[0];
        const bCol = b.match(/[A-Z]+/)[0];
        return aCol.localeCompare(bCol);
      });
      
      let lastRow = 0;
      for (const ref of sortedRefs) {
        const cell = cells[ref];
        const row = parseInt(ref.match(/\d+/)[0]);
        
        if (row !== lastRow) {
          console.log(`\nRow ${row}:`);
          lastRow = row;
        }
        
        console.log(`  ${ref} (${cell.type}): ${cell.displayValue}`);
      }
      
      // Save detailed output
      fs.writeFileSync('./xlsx-complete-data.json', JSON.stringify({
        totalCells: Object.keys(cells).length,
        sharedStringsCount: sharedStrings.length,
        cells,
        sharedStrings
      }, null, 2));
      
      console.log(`\n✓ Saved complete data to xlsx-complete-data.json`);
      
      // Identify expected benchmark values
      console.log("\n=== LIKELY EXPECTED VALUES ===");
      for (const [ref, cell] of Object.entries(cells)) {
        const displayVal = String(cell.displayValue).trim();
        
        // Look for rows near result labels
        if (displayVal === 'LIQUID LIMIT' || displayVal === 'PLASTIC LIMIT' || displayVal === 'LINEAR SHRINKAGE' || displayVal === 'PLASTICITY INDEX') {
          console.log(`Found label "${displayVal}" at ${ref}`);
          
          // Check adjacent cells for values
          const refCol = ref.match(/[A-Z]+/)[0];
          const refRow = parseInt(ref.match(/\d+/)[0]);
          
          // Check same row, next few columns
          const nextCols = ['H', 'I', 'J', 'K', 'L', 'M'];
          for (const col of nextCols) {
            const nextRef = col + refRow;
            if (cells[nextRef]) {
              const val = cells[nextRef].displayValue;
              if (!isNaN(parseFloat(val))) {
                console.log(`  -> Possible value at ${nextRef}: ${val}`);
              }
            }
          }
        }
      }
    }
    
  } catch (error) {
    console.error("Error:", error.message);
    console.error(error.stack);
  }
}

parseXLSXXml();
