const ExcelJS = require('exceljs');
const fs = require('fs');

async function extractBenchmarkData() {
  try {
    const workbook = new ExcelJS.Workbook();
    const buffer = fs.readFileSync('./ATTERTEST.xlsx');
    
    console.log("Loading Excel file with safe mode...");
    
    // Load with options to skip certain features
    await workbook.xlsx.load(buffer, {
      ignoreNodes: ['drawings', 'picture'],
    });
    
    console.log(`✓ Workbook loaded successfully`);
    console.log(`  Worksheets: ${workbook.worksheets.length}`);
    
    const ws = workbook.worksheets[0];
    if (!ws) {
      console.log("No worksheets found");
      return;
    }
    
    console.log(`\nFirst worksheet: "${ws.name}"`);
    console.log(`  Rows: ${ws.actualRowCount}, Columns: ${ws.actualColumnCount}`);
    
    // Extract all cell values
    console.log("\n=== SCANNING ALL ROWS ===");
    const data = {};
    let rowCount = 0;
    
    ws.eachRow((row, rowNumber) => {
      const rowData = [];
      row.eachCell((cell, colNumber) => {
        if (cell.value !== null && cell.value !== undefined) {
          rowData.push({
            col: colNumber,
            colLetter: String.fromCharCode(64 + colNumber),
            value: cell.value,
            formula: cell.formula
          });
        }
      });
      
      if (rowData.length > 0) {
        console.log(`Row ${rowNumber}: ${rowData.map(c => `${c.colLetter}="${c.value}${c.formula ? `(formula)` : ""}`).join(", ")}`);
        data[rowNumber] = rowData;
      }
      
      rowCount++;
      if (rowCount % 10 === 0) {
        console.log(`... processed ${rowCount} rows`);
      }
    });
    
    console.log(`\n✓ Extracted data from ${rowCount} total rows`);
    
    // Save to JSON for reference
    const jsonData = {};
    Object.entries(data).forEach(([rowNum, cells]) => {
      jsonData[`row_${rowNum}`] = {};
      cells.forEach(cell => {
        jsonData[`row_${rowNum}`][cell.colLetter] = cell.value;
      });
    });
    
    fs.writeFileSync('./benchmark-data.json', JSON.stringify(jsonData, null, 2));
    console.log(`\n✓ Saved extracted data to benchmark-data.json`);
    
    return jsonData;
  } catch (error) {
    console.error("Error:", error.message);
    console.error(error.stack);
  }
}

extractBenchmarkData();
