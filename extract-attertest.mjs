import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function extractAtterbergData(filePath) {
  try {
    console.log('\nExtracting from: ' + path.basename(filePath));
    
    const workbook = new ExcelJS.Workbook();
    const buffer = fs.readFileSync(filePath);
    
    try {
      await workbook.xlsx.load(buffer, {
        ignoreNodes: ['drawings', 'picture', 'anchor', 'charts', 'chartsheet'],
        sheetStubs: true,
      });
    } catch (loadError) {
      console.log('First load attempt failed, trying without error details...');
      workbook.xlsx.readFile = function() {};
      throw loadError;
    }
    
    const ws = workbook.worksheets[0];
    if (!ws) {
      throw new Error('No worksheets found');
    }
    
    console.log('Worksheet: ' + ws.name);
    console.log('Extracting trial data...\n');
    
    const trials = [];
    const results = {};
    
    for (let row = 1; row <= ws.rowCount; row++) {
      const rowData = ws.getRow(row);
      const values = [];
      
      for (let col = 1; col <= 12; col++) {
        const cell = rowData.getCell(col);
        const val = cell.value;
        values.push(val !== null && val !== undefined ? String(val) : '');
      }
      
      if (values.some(v => v)) {
        const rowStr = 'Row' + row + ': ' + values.map((v, i) => i + ':' + v).filter(x => !x.endsWith(':undefined') && !x.endsWith(':null') && !x.endsWith(':')).join(' | ');
        if (rowStr.length > 10) {
          console.log(rowStr);
        }
      }
    }
    
  } catch (error) {
    console.error('Error: ' + error.message);
    if (error.stack) {
      console.error('Stack: ' + error.stack.split('\n')[0]);
    }
  }
}

async function main() {
  console.log('ATTERBERG TEST EXCEL EXTRACTION');
  console.log('================================');
  
  const manualFile = path.join(__dirname, 'ATTERTEST.xlsx');
  
  if (!fs.existsSync(manualFile)) {
    console.log('File not found: ' + manualFile);
  } else {
    await extractAtterbergData(manualFile);
  }
}

main().catch(console.error);
