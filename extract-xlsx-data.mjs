import fs from 'fs';
import zlib from 'zlib';
import { Transform } from 'stream';

// Simple ZIP extraction for XLSX (which is just a ZIP file)
async function extractZip(filePath) {
  return new Promise((resolve, reject) => {
    const AdmZip = require('adm-zip');
    try {
      const zip = new AdmZip(filePath);
      const entries = zip.getEntries();
      
      const result = {};
      entries.forEach(entry => {
        if (!entry.isDirectory) {
          result[entry.entryName] = entry.getData().toString('utf8');
        }
      });
      
      resolve(result);
    } catch (error) {
      // Fallback: try using native unzip
      console.log('Trying native unzip...');
      const { execSync } = require('child_process');
      try {
        execSync(`cd /tmp && unzip -q ${filePath} -d xlsx_extract`);
        const path = require('path');
        const files = require('child_process').execSync('find /tmp/xlsx_extract -type f').toString().split('\n').filter(Boolean);
        
        const result = {};
        files.forEach(file => {
          const relative = path.relative('/tmp/xlsx_extract', file);
          result[relative] = fs.readFileSync(file, 'utf8');
        });
        
        execSync('rm -rf /tmp/xlsx_extract');
        resolve(result);
      } catch (e) {
        reject(e);
      }
    }
  });
}

async function main() {
  try {
    console.log('Attempting to extract XLSX manually...');
    
    // First try with adm-zip
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip('./ATTERTEST.xlsx');
      const entries = zip.getEntries();
      
      console.log(`✓ ZIP extraction successful`);
      console.log(`  Files found: ${entries.length}`);
      
      // Find and extract worksheets
      const wsEntry = entries.find(e => e.entryName === 'xl/worksheets/sheet1.xml');
      if (wsEntry) {
        const wsXml = wsEntry.getData().toString('utf8');
        console.log('\n=== WORKSHEET XML (first 3000 chars) ===');
        console.log(wsXml.substring(0, 3000));
        
        // Extract cell values
        console.log('\n=== CELLS FOUND ===');
        const cellRegex = /<c r="([A-Z]+\d+)"[^>]*>(?:<v>([^<]*)<\/v>)?/g;
        let match;
        let cellCount = 0;
        while ((match = cellRegex.exec(wsXml)) !== null && cellCount < 100) {
          const [, ref, value] = match;
          if (value) {
            console.log(`  ${ref}: ${value}`);
            cellCount++;
          }
        }
      }
      
      // Also list all XML files
      console.log('\n=== XML FILES IN WORKBOOK ===');
      entries.filter(e => e.entryName.endsWith('.xml')).forEach(e => {
        console.log(`  ${e.entryName}`);
      });
      
    } catch (error) {
      console.log('adm-zip not available, using unzip command...');
      const { execSync } = require('child_process');
      
      // Create temp directory and extract
      execSync('mkdir -p /tmp/xlsx_extract && cd /tmp/xlsx_extract && unzip -q ' + process.cwd() + '/ATTERTEST.xlsx');
      
      const wsXmlPath = '/tmp/xlsx_extract/xl/worksheets/sheet1.xml';
      if (fs.existsSync(wsXmlPath)) {
        const wsXml = fs.readFileSync(wsXmlPath, 'utf8');
        console.log('\n=== WORKSHEET XML (first 3000 chars) ===');
        console.log(wsXml.substring(0, 3000));
        
        // Extract cell values
        console.log('\n=== CELLS FOUND ===');
        const cellRegex = /<c r="([A-Z]+\d+)"[^>]*>(?:<v>([^<]*)<\/v>)?/g;
        let match;
        let cellCount = 0;
        while ((match = cellRegex.exec(wsXml)) !== null && cellCount < 100) {
          const [, ref, value] = match;
          if (value) {
            console.log(`  ${ref}: ${value}`);
            cellCount++;
          }
        }
      }
      
      execSync('rm -rf /tmp/xlsx_extract');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
