import unzipper from 'unzipper';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseSharedStrings(xmlContent) {
  const strings = [];
  const stringRegex = /<si>[\s\S]*?<t[^>]*>([^<]*)<\/t>[\s\S]*?<\/si>/g;
  
  let match;
  while ((match = stringRegex.exec(xmlContent)) !== null) {
    strings.push(match[1]);
  }
  
  return strings;
}

async function extractExcelData() {
  const filePath = path.join(__dirname, 'ATTERTEST.xlsx');
  
  console.log('ATTERBERG TEST - MANUAL EXCEL ANALYSIS');
  console.log('=====================================\n');
  
  try {
    const directory = await unzipper.Open.file(filePath);
    
    let worksheetXml = null;
    let sharedStringsXml = null;
    
    for (const file of directory.files) {
      if (file.path === 'xl/worksheets/sheet1.xml') {
        worksheetXml = await file.buffer();
      }
      if (file.path === 'xl/sharedStrings.xml') {
        sharedStringsXml = await file.buffer();
      }
    }
    
    if (!worksheetXml) {
      console.log('No worksheet found');
      return;
    }
    
    const wsContent = worksheetXml.toString('utf-8');
    const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml.toString('utf-8')) : [];
    
    console.log('Shared Strings loaded: ' + sharedStrings.length + '\n');
    
    const cellRegex = /<c\s+r="([A-Z]+\d+)"[^>]*>(?:<v>([^<]*)<\/v>)?(?:<f>([^<]*)<\/f>)?/g;
    
    const cells = new Map();
    let match;
    while ((match = cellRegex.exec(wsContent)) !== null) {
      const cellRef = match[1];
      const value = match[2];
      if (value !== undefined) {
        cells.set(cellRef, value);
      }
    }
    
    function getCellValue(cellRef) {
      const val = cells.get(cellRef);
      if (!val) return null;
      
      const numVal = parseInt(val);
      if (numVal.toString() === val && sharedStrings[numVal]) {
        return sharedStrings[numVal];
      }
      
      const floatVal = parseFloat(val);
      if (!isNaN(floatVal)) {
        return floatVal;
      }
      
      return val;
    }
    
    console.log('KEY EXTRACTED DATA:\n');
    
    const llTrials = {};
    const plTrials = {};
    const slTrials = {};
    
    for (let row = 1; row <= 80; row++) {
      let rowLabel = null;
      let rowValues = {};
      
      for (let col = 0; col < 12; col++) {
        const letter = String.fromCharCode(65 + col);
        const cellRef = letter + row;
        const value = getCellValue(cellRef);
        
        if (value !== null) {
          rowValues[letter] = value;
        }
      }
      
      if (Object.keys(rowValues).length > 0) {
        const displayLine = 'Row ' + row + ': ' + Object.entries(rowValues).map(e => e[0] + '=' + e[1]).join(', ');
        console.log(displayLine);
      }
    }
    
  } catch (error) {
    console.error('Error: ' + error.message);
    if (error.stack) console.error(error.stack);
  }
}

extractExcelData().catch(console.error);
