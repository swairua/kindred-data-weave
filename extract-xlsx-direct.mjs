import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';
import { Transform } from 'stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function extractZipEntry(buffer, entryName) {
  const content = buffer.toString('latin1');
  const entryPos = content.indexOf(entryName);
  
  if (entryPos === -1) return null;
  
  const xmlStart = content.indexOf('<?xml', entryPos);
  if (xmlStart === -1) return null;
  
  const nextEntry = content.indexOf('\x50\x4b\x03\x04', xmlStart + 100);
  const xmlEnd = nextEntry === -1 ? content.length : nextEntry;
  
  return content.substring(xmlStart, xmlEnd);
}

function parseXmlCells(xmlContent) {
  const cells = new Map();
  const cellRegex = /<c\s+r="([A-Z$]+\d+)"[^>]*>(?:<f>([^<]*)<\/f>)?(?:<v>([^<]*)<\/v>)?/g;
  
  let match;
  while ((match = cellRegex.exec(xmlContent)) !== null) {
    const cellRef = match[1];
    const formula = match[2];
    const value = match[3];
    const cellValue = value || formula || '';
    if (cellValue) {
      cells.set(cellRef, cellValue);
    }
  }
  
  return cells;
}

function getSharedStrings(xmlContent) {
  const strings = [];
  const stringRegex = /<si>(?:.*?<t>([^<]*)<\/t>)*.*?<\/si>/gs;
  
  let match;
  while ((match = stringRegex.exec(xmlContent)) !== null) {
    strings.push(match[1] || '');
  }
  
  return strings;
}

function getCellValue(cellRef, cells, sharedStrings) {
  const val = cells.get(cellRef);
  if (!val) return null;
  
  const numVal = Number(val);
  if (numVal.toString() === val) return numVal;
  return sharedStrings[parseInt(val)] || val;
}

function extractFromExcel(filePath) {
  console.log('\n=== Extracting: ' + path.basename(filePath) + ' ===\n');
  
  try {
    const buffer = fs.readFileSync(filePath);
    
    const sheetXml = extractZipEntry(buffer, 'xl/worksheets/sheet1.xml');
    if (!sheetXml) {
      console.log('Could not extract worksheet');
      return;
    }
    
    const sharedStringsXml = extractZipEntry(buffer, 'xl/sharedStrings.xml') || '';
    const sharedStrings = getSharedStrings(sharedStringsXml);
    
    const cells = parseXmlCells(sheetXml);
    
    console.log('Found ' + cells.size + ' cells with data');
    console.log('Found ' + sharedStrings.length + ' shared strings\n');
    
    console.log('EXTRACTED DATA:');
    console.log('===============\n');
    
    for (let row = 1; row <= 80; row++) {
      let rowContent = [];
      let hasData = false;
      
      for (let col = 1; col <= 12; col++) {
        const colLetter = String.fromCharCode(64 + col);
        const cellRef = colLetter + row;
        const val = cells.get(cellRef);
        
        if (val) {
          const displayVal = getCellValue(cellRef, cells, sharedStrings);
          rowContent.push(colLetter + ':' + displayVal);
          hasData = true;
        }
      }
      
      if (hasData) {
        console.log('Row ' + row + ': ' + rowContent.join(' | '));
      }
    }
    
  } catch (error) {
    console.error('Error: ' + error.message);
  }
}

console.log('ATTERBERG TEST EXCEL - DIRECT ZIP EXTRACTION');
console.log('===========================================');

const filePath = path.join(__dirname, 'ATTERTEST.xlsx');
extractFromExcel(filePath);
