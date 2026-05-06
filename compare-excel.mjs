import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function extractExcelData(filePath) {
  try {
    const workbook = new ExcelJS.Workbook();
    const buffer = fs.readFileSync(filePath);
    
    await workbook.xlsx.load(buffer, {
      ignoreNodes: ['drawings', 'picture', 'anchor'],
    });
    
    const ws = workbook.worksheets[0];
    if (!ws) {
      throw new Error('No worksheets found');
    }
    
    console.log('\n=== FILE: ' + path.basename(filePath) + ' ===');
    console.log('Worksheet: ' + ws.name);
    
    console.log('\nData from worksheet:');
    
    for (let row = 1; row <= Math.min(80, ws.rowCount); row++) {
      const rowData = ws.getRow(row);
      let rowValues = [];
      
      for (let col = 1; col <= 12; col++) {
        const cell = rowData.getCell(col);
        if (cell.value !== null && cell.value !== undefined) {
          rowValues.push('C' + col + ':' + String(cell.value));
        }
      }
      
      if (rowValues.length > 0) {
        console.log('R' + row + ': ' + rowValues.join(' | '));
      }
    }
    
    return ws;
  } catch (error) {
    console.error('Error reading ' + path.basename(filePath) + ': ' + error.message);
    return null;
  }
}

async function main() {
  console.log('EXCEL FILE COMPARISON');
  console.log('====================');
  
  const manualFile = path.join(__dirname, 'ATTERTEST.xlsx');
  const appFile = path.join(__dirname, 'Atterberg_Limits_Atterberg_Limits_Testing.xlsx');
  
  if (!fs.existsSync(manualFile)) {
    console.log('Manual file not found: ' + manualFile);
  } else {
    await extractExcelData(manualFile);
  }
  
  if (!fs.existsSync(appFile)) {
    console.log('App file not found: ' + appFile);
  } else {
    await extractExcelData(appFile);
  }
}

main().catch(console.error);
