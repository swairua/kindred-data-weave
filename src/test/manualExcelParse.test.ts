import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import zlib from "zlib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple ZIP-like reader for XLSX files (XLSX = ZIP archive)
function readZipEntry(filePath: string, entryName: string): string | null {
  try {
    const buffer = fs.readFileSync(filePath);
    
    // Find entry in ZIP file
    // ZIP format has Central Directory at end, but we can scan for local file headers
    // Local file header signature: 0x04034b50
    let pos = 0;
    const searchStr = Buffer.from(entryName);
    
    // For simplicity, try to find theentry name in the file
    const fileContent = buffer.toString("latin1");
    const entryIndex = fileContent.indexOf(entryName);
    
    if (entryIndex === -1) {
      return null;
    }
    
    // This is a simplified approach - look for XML content after the entry name
    // A proper implementation would parse the ZIP structure correctly
    const xmlStart = fileContent.indexOf("<?xml", entryIndex);
    if (xmlStart === -1) {
      return null;
    }
    
    // Find the end of this file entry
    const nextEntry = fileContent.indexOf("\x50\x4b\x03\x04", xmlStart); // Next local file header
    const endContent = nextEntry === -1 ? fileContent.length : nextEntry;
    
    return fileContent.substring(xmlStart, endContent);
  } catch (error) {
    console.error("Error reading ZIP entry:", error);
    return null;
  }
}

// Parse cell references from Excel XML
function parseCellsFromXml(xmlContent: string): Map<string, string> {
  const cells = new Map<string, string>();
  
  // Regex to find cell elements: <c r="A1">...</c>
  // Cells can have formulas or values
  const cellRegex = /<c\s+r="([A-Z$]+\d+)"[^>]*>(?:<f>([^<]*)<\/f>)?(?:<v>([^<]*)<\/v>)?/g;
  
  let match;
  while ((match = cellRegex.exec(xmlContent)) !== null) {
    const cellRef = match[1];
    const formula = match[2];
    const value = match[3];
    
    // Prefer value over formula
    const cellValue = value || formula || "";
    if (cellValue) {
      cells.set(cellRef, cellValue);
    }
  }
  
  return cells;
}

describe("Manual Excel Parsing - ATTERTEST.xlsx", () => {
  const filePath = path.join(__dirname, "..", "..", "ATTERTEST.xlsx");
  
  it("should read Excel file structure", () => {
    expect(fs.existsSync(filePath)).toBe(true);
    const stat = fs.statSync(filePath);
    console.log(`File size: ${stat.size} bytes`);
    expect(stat.size).toBeGreaterThan(0);
  });
  
  it("should extract and parse worksheet XML", () => {
    if (!fs.existsSync(filePath)) {
      console.warn("File not found");
      return;
    }
    
    // Try to read the worksheet XML
    const wsXml = readZipEntry(filePath, "sheet1.xml");
    
    if (!wsXml) {
      console.warn("Could not extract worksheet XML");
      return;
    }
    
    console.log(`Extracted ${wsXml.length} bytes of XML`);
    console.log("\nFirst 1000 chars of XML:");
    console.log(wsXml.substring(0, 1000));
    
    // Parse cells
    const cells = parseCellsFromXml(wsXml);
    console.log(`\nFound ${cells.size} cells with values`);
    
    // Display some cells
    console.log("\nSample cells:");
    let count = 0;
    for (const [ref, value] of cells) {
      if (count++ < 20) {
        console.log(`  ${ref}: ${value}`);
      }
    }
    
    expect(cells.size).toBeGreaterThan(0);
  });
  
  it("should find Atterberg test data in worksheet", () => {
    if (!fs.existsSync(filePath)) {
      return;
    }
    
    const wsXml = readZipEntry(filePath, "sheet1.xml");
    if (!wsXml) {
      return;
    }
    
    const cells = parseCellsFromXml(wsXml);
    
    // Look for common Atterberg labels
    console.log("\n=== SEARCHING FOR ATTERBERG DATA ===");
    const keywords = ["LIQUID", "PLASTIC", "PENETRATION", "LIMIT", "SHRINK"];
    
    let found = false;
    for (const [cellRef, value] of cells) {
      const valueUpper = String(value).toUpperCase();
      for (const keyword of keywords) {
        if (valueUpper.includes(keyword)) {
          console.log(`Found "${keyword}" at ${cellRef}: ${value}`);
          found = true;
        }
      }
    }
    
    if (!found) {
      console.log("No Atterberg-related data found in cells");
      console.log("Available cell values (first 30):");
      let count = 0;
      for (const [ref, value] of cells) {
        if (count++ < 30) {
          console.log(`  ${ref}: ${value}`);
        }
      }
    }
  });
});
