import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const filePath = path.join(__dirname, 'ATTERTEST.xlsx');

try {
  const buffer = fs.readFileSync(filePath);
  const content = buffer.toString('latin1');
  
  console.log('File size: ' + buffer.length + ' bytes\n');
  
  console.log('Looking for key indicators...\n');
  
  const indicators = [
    'sheet',
    'worksheet',
    'LIQUID',
    'PLASTIC',
    'penetration',
    'moisture',
    'xml',
    'xl/',
    'workbook'
  ];
  
  for (const indicator of indicators) {
    const pos = content.indexOf(indicator);
    if (pos !== -1) {
      console.log('Found "' + indicator + '" at position ' + pos);
    }
  }
  
  console.log('\nChecking for typical Excel ZIP structure...');
  
  const xmlIdx = content.indexOf('<?xml');
  if (xmlIdx !== -1) {
    console.log('Found XML at position ' + xmlIdx);
    console.log('First 500 chars of XML:');
    console.log(content.substring(xmlIdx, xmlIdx + 500));
  } else {
    console.log('No XML found in file');
  }
  
} catch (error) {
  console.error('Error: ' + error.message);
}
