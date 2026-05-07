#!/usr/bin/env node

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXCEL_URL = 'https://cdn.builder.io/o/assets%2F40046821ea90459e8c4c21c8cbfad10e%2F4e157eab2e344557b37c94cf89a13d85?alt=media&token=a7dadc3a-30c9-48a1-9a90-fef8e55cb817&apiKey=40046821ea90459e8c4c21c8cbfad10e';
const OUTPUT_FILE = path.join(__dirname, '..', 'ATTERTEST.xlsx');

async function downloadExcel() {
  console.log('Downloading Excel file from URL...');
  try {
    const response = await fetch(EXCEL_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const buffer = await response.buffer();
    fs.writeFileSync(OUTPUT_FILE, buffer);
    console.log(`✓ Downloaded to ${OUTPUT_FILE}`);
    return true;
  } catch (error) {
    console.error('Failed to download Excel file:', error);
    return false;
  }
}

async function main() {
  const success = await downloadExcel();
  if (success) {
    console.log('\nExcel file ready for validation tests.');
    console.log('Run: npm test -- benchmarkValidation.test.ts');
  } else {
    process.exit(1);
  }
}

main();
