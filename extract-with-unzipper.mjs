import unzipper from 'unzipper';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function extractExcelData() {
  const filePath = path.join(__dirname, 'ATTERTEST.xlsx');
  
  console.log('EXTRACTING ATTERBERG TEST DATA FROM EXCEL');
  console.log('========================================\n');
  
  try {
    const directory = await unzipper.Open.file(filePath);
    
    console.log('Found files in ZIP:');
    for (const file of directory.files) {
      if (file.path.includes('worksheet') || file.path.includes('sharedString')) {
        console.log('  - ' + file.path);
      }
    }
    
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
      console.log('\nNo worksheet XML found');
      return;
    }
    
    console.log('\nWorksheet XML found (' + worksheetXml.length + ' bytes)');
    
    const wsContent = worksheetXml.toString('utf-8');
    
    console.log('\nSearching for trial data...\n');
    
    const cellRegex = /<c\s+r="([A-Z]+\d+)"[^>]*>(?:<v>([^<]*)<\/v>)?(?:<f>([^<]*)<\/f>)?/g;
    
    const cells = new Map();
    let match;
    while ((match = cellRegex.exec(wsContent)) !== null) {
      const cellRef = match[1];
      const value = match[2];
      if (value) {
        cells.set(cellRef, value);
      }
    }
    
    console.log('Found ' + cells.size + ' cells with values');
    
    console.log('\nEXTRACTED TRIAL DATA:\n');
    
    for (let row = 1; row <= 80; row++) {
      let rowData = [];
      
      for (let col = 0; col < 12; col++) {
        const letter = String.fromCharCode(65 + col);
        const cellRef = letter + row;
        const value = cells.get(cellRef);
        
        if (value) {
          rowData.push(letter + ':' + value);
        }
      }
      
      if (rowData.length > 0) {
        console.log('Row ' + row + ': ' + rowData.join(' | '));
      }
    }
    
  } catch (error) {
    console.error('Error: ' + error.message);
  }
}

extractExcelData().catch(console.error);
