import ExcelJS from "exceljs";
import fs from "fs";

export const debugExcelFile = async (filePath: string) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const buffer = fs.readFileSync(filePath);
    
    console.log("Loading Excel file...");
    await workbook.xlsx.load(buffer);
    
    console.log(`✓ Workbook loaded successfully`);
    console.log(`  Worksheets: ${workbook.worksheets.length}`);
    
    const ws = workbook.worksheets[0];
    if (!ws) {
      console.log("No worksheets found");
      return;
    }
    
    console.log(`\nFirst worksheet: "${ws.name}"`);
    console.log(`  Dimensions: ${ws.dimensions ? ws.dimensions.ref : "unknown"}`);
    console.log(`  Rows: ${ws.actualRowCount}, Columns: ${ws.actualColumnCount}`);
    
    // Sample first 50 rows, first 15 columns
    console.log("\n=== WORKSHEET CONTENT (First 50 rows, 15 columns) ===");
    for (let row = 1; row <= Math.min(50, ws.actualRowCount || 50); row++) {
      const rowData: string[] = [];
      for (let col = 1; col <= Math.min(15, ws.actualColumnCount || 15); col++) {
        const cell = ws.getCell(row, col);
        const value = cell.value;
        let displayValue = "";
        
        if (value === null || value === undefined) {
          displayValue = "";
        } else if (typeof value === "object") {
          displayValue = JSON.stringify(value).substring(0, 15);
        } else {
          displayValue = String(value).substring(0, 15);
        }
        
        rowData.push(displayValue.padEnd(15));
      }
      console.log(`Row ${String(row).padEnd(3)}: ${rowData.join(" | ")}`);
    }
    
    console.log("\n=== SEARCHING FOR KEYWORDS ===");
    // Search for common labels
    const keywords = ["LIQUID", "PLASTIC", "SHRINK", "PENETRATION", "LIMIT"];
    for (let row = 1; row <= (ws.actualRowCount || 100); row++) {
      for (let col = 1; col <= (ws.actualColumnCount || 20); col++) {
        const cell = ws.getCell(row, col);
        const value = String(cell.value || "").toUpperCase();
        
        for (const keyword of keywords) {
          if (value.includes(keyword)) {
            console.log(`Found "${keyword}" at [${row}, ${col}]: "${cell.value}"`);
            break;
          }
        }
      }
    }
    
  } catch (error) {
    console.error("Error:", error);
  }
};

if (require.main === module) {
  debugExcelFile("./ATTERTEST.xlsx");
}
