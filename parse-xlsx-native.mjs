import fs from 'fs';
import { createReadStream } from 'fs';
import { createInflateRaw } from 'zlib';
import { Readable } from 'stream';

// Simple ZIP entry parser - looks for central directory to find files
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
      const data = buffer.slice(dataStart, dataEnd);
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
    console.log(`✓ File read (${buffer.length} bytes)`);
    
    console.log("\nParsing as ZIP...");
    const files = parseZipFile(buffer);
    console.log(`✓ Found ${files.size} files in ZIP`);
    
    // List files
    console.log("\nFiles in archive:");
    files.forEach((entry, name) => {
      console.log(`  ${name} (${entry.data.length} bytes, compressed: ${entry.compressed})`);
    });
    
    // Extract worksheet XML
    let wsXml = null;
    if (files.has('xl/worksheets/sheet1.xml')) {
      let data = files.get('xl/worksheets/sheet1.xml').data;
      wsXml = data.toString('utf8');
      console.log(`\n✓ Found worksheet1 XML (${wsXml.length} bytes)`);
    } else {
      console.log("\n✗ Worksheet1 XML not found");
      console.log("Available worksheet files:");
      files.forEach((_, name) => {
        if (name.includes('worksheets')) {
          console.log(`  ${name}`);
        }
      });
    }
    
    // Extract shared strings
    let sharedStrings = [];
    if (files.has('xl/sharedStrings.xml')) {
      const data = files.get('xl/sharedStrings.xml').data;
      const ssXml = data.toString('utf8');
      console.log(`✓ Found sharedStrings XML (${ssXml.length} bytes)`);
      
      // Parse shared strings
      const textRegex = /<t[^>]*>([^<]*)<\/t>/g;
      let match;
      while ((match = textRegex.exec(ssXml)) !== null) {
        sharedStrings.push(match[1]);
      }
      console.log(`✓ Extracted ${sharedStrings.length} shared strings`);
    }
    
    // Parse cells from worksheet
    if (wsXml) {
      console.log("\n=== PARSING CELLS ===");
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
          
          if (cellCount < 300) {
            console.log(`  ${cellRef}: ${displayValue}`);
          }
          cellCount++;
        }
      }
      
      console.log(`\n✓ Extracted ${cellCount} total cells`);
      
      // Save to JSON for analysis
      fs.writeFileSync('./xlsx-cells.json', JSON.stringify({
        cellCount,
        cells
      }, null, 2));
      console.log(`✓ Saved cell data to xlsx-cells.json`);
      
      // Output some interesting summary
      console.log("\n=== SUMMARY ===");
      console.log(`Total cells with data: ${cellCount}`);
      console.log(`Total shared strings: ${sharedStrings.length}`);
      
      // Try to identify test data sections
      console.log("\n=== LOOKING FOR KEYWORDS ===");
      const keywords = ['LIQUID', 'PLASTIC', 'SHRINK', 'PENETRATION', 'LIMIT', 'TRIAL', 'MOISTURE'];
      for (const keyword of keywords) {
        const matches = [];
        for (const [ref, cell] of Object.entries(cells)) {
          if (String(cell.value).toUpperCase().includes(keyword)) {
            matches.push(`${ref}: ${cell.value}`);
          }
        }
        if (matches.length > 0) {
          console.log(`\n"${keyword}" found in:`);
          matches.slice(0, 5).forEach(m => console.log(`  ${m}`));
          if (matches.length > 5) console.log(`  ... and ${matches.length - 5} more`);
        }
      }
    }
    
  } catch (error) {
    console.error("Error:", error.message);
    console.error(error.stack);
  }
}

parseXLSXXml();
