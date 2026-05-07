import fs from 'fs';
import { inflateRawSync } from 'zlib';

function parseZipFile(buffer) {
  const files = new Map();
  let pos = 0;
  
  // Find local file headers
  const PK34 = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // "PK\x03\x04"
  
  while (pos < buffer.length - 30) {
    const sliceStart = buffer.indexOf(PK34, pos);
    if (sliceStart === -1) break;
    
    pos = sliceStart;
    
    // Parse local file header
    const version = buffer.readUInt16LE(pos + 4);
    const flags = buffer.readUInt16LE(pos + 6);
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
      
      // Decompress if needed
      if (compression === 8) { // deflate
        try {
          data = inflateRawSync(data, { maxOutputLength: 10 * 1024 * 1024 });
        } catch (e) {
          console.warn(`Failed to decompress ${filename}: ${e.message}`);
        }
      }
      
      files.set(filename, {
        data: data,
        compressed: compression !== 0,
        uncompressedSize: uncompressedSize,
        compression: compression
      });
    }
    
    pos = dataEnd;
  }
  
  return files;
}

async function parseXLSXXml() {
  try {
    console.log("Reading ATTERTEST.xlsx...");
    const buffer = fs.readFileSync('./ATTERTEST.xlsx');
    console.log(`✓ File read (${buffer.length} bytes)\n`);
    
    console.log("Parsing as ZIP and decompressing...");
    const files = parseZipFile(buffer);
    console.log(`✓ Found ${files.size} files\n`);
    
    // Extract shared strings
    let sharedStrings = [];
    if (files.has('xl/sharedStrings.xml')) {
      const data = files.get('xl/sharedStrings.xml').data;
      const ssXml = data.toString('utf8');
      console.log(`✓ Shared strings XML length: ${ssXml.length} bytes`);
      
      // Parse shared strings - may be in rich text format
      const rtRegex = /<r><rPr[^>]*><[^>]*>?<\/[^>]*><\/rPr><t[^>]*>([^<]*)<\/t><\/r>/g;
      const simpleRegex = /<si[^>]*><t[^>]*>([^<]*)<\/t><\/si>/g;
      const tRegex = /<t[^>]*>([^<]*)<\/t>/g;
      
      let match;
      let processed = new Set();
      
      // Try simple format first
      while ((match = simpleRegex.exec(ssXml)) !== null) {
        if (!processed.has(match[1])) {
          sharedStrings.push(match[1]);
          processed.add(match[1]);
        }
      }
      
      console.log(`✓ Extracted ${sharedStrings.length} shared strings\n`);
    }
    
    // Extract worksheet XML
    let wsXml = null;
    if (files.has('xl/worksheets/sheet1.xml')) {
      const data = files.get('xl/worksheets/sheet1.xml').data;
      wsXml = data.toString('utf8');
      console.log(`✓ Worksheet XML length: ${wsXml.length} bytes\n`);
    }
    
    // Parse cells from worksheet
    if (wsXml) {
      console.log("=== PARSING CELLS ===");
      const cellRegex = /<c r="([A-Z]+\d+)"[^>]*t="?([a-z]*)"?[^>]*>(?:<v>([^<]*)<\/v>)?/g;
      let match;
      const cells = {};
      let cellCount = 0;
      
      while ((match = cellRegex.exec(wsXml)) !== null) {
        const cellRef = match[1];
        const cellType = match[2] || 'n';
        const cellValue = match[3];
        
        let displayValue = cellValue;
        if (cellType === 's' && cellValue !== undefined) {
          const strIndex = parseInt(cellValue);
          if (sharedStrings[strIndex]) {
            displayValue = sharedStrings[strIndex];
          }
        }
        
        if (displayValue !== undefined && displayValue !== '') {
          cells[cellRef] = {
            type: cellType,
            value: displayValue
          };
          cellCount++;
        }
      }
      
      console.log(`✓ Extracted ${cellCount} cells with data\n`);
      
      // Display first 200 cells
      console.log("=== FIRST 200 CELLS ===");
      let count = 0;
      for (const [ref, cell] of Object.entries(cells)) {
        console.log(`  ${ref}: ${cell.value}`);
        if (++count >= 200) break;
      }
      
      // Save to JSON
      fs.writeFileSync('./xlsx-cells.json', JSON.stringify({
        cellCount,
        sharedStringsCount: sharedStrings.length,
        cells
      }, null, 2));
      console.log(`\n✓ Saved all ${cellCount} cells to xlsx-cells.json`);
      
      // Summary
      console.log("\n=== KEYWORDS ===");
      const keywords = ['LIQUID', 'PLASTIC', 'SHRINK', 'PENETRATION', 'LIMIT', 'TRIAL', 'MOISTURE', 'CONTAINER', 'WET', 'DRY'];
      for (const keyword of keywords) {
        const matches = [];
        for (const [ref, cell] of Object.entries(cells)) {
          if (String(cell.value).toUpperCase().includes(keyword)) {
            matches.push(ref);
          }
        }
        if (matches.length > 0) {
          console.log(`"${keyword}": ${matches.join(', ')}`);
        }
      }
    }
    
  } catch (error) {
    console.error("Error:", error.message);
    console.error(error.stack);
  }
}

parseXLSXXml();
