/**
 * Debug utilities for diagnosing image loading issues in exports
 * Usage: Call window.debugImages() in browser console
 */

import { listRecords } from "./api";
import { fetchAdminImagesAsBase64 } from "./imageUtils";

export async function debugAdminImages() {
  console.log("=== DEBUGGING ADMIN IMAGES ===\n");

  try {
    // Step 1: Check database
    console.log("Step 1: Checking admin_images database table...");
    const response = await listRecords<{ image_type: string; file_path: string }>("admin_images");
    const rows = response.data || [];
    
    console.log(`  Found ${rows.length} image record(s):`, rows);

    if (rows.length === 0) {
      console.warn("⚠️ NO IMAGES IN DATABASE!");
      console.log("  Action: Go to Admin > Media Library and upload:");
      console.log("    - Logo");
      console.log("    - Contacts");
      console.log("    - Stamp");
      return;
    }

    // Step 2: Check image paths
    console.log("\nStep 2: Extracted image paths:");
    const latest: Record<string, string> = {};
    for (const row of rows) {
      if (!latest[row.image_type]) {
        latest[row.image_type] = row.file_path;
        console.log(`  ${row.image_type}: ${row.file_path}`);
      }
    }

    // Step 3: Test image conversion
    console.log("\nStep 3: Attempting to fetch and convert images...");
    const images = await fetchAdminImagesAsBase64();
    
    console.log("  Results:");
    console.log(`    Logo: ${images.logo ? `✓ (${images.logo.length} chars)` : "✗ MISSING"}`);
    console.log(`    Contacts: ${images.contacts ? `✓ (${images.contacts.length} chars)` : "✗ MISSING"}`);
    console.log(`    Stamp: ${images.stamp ? `✓ (${images.stamp.length} chars)` : "✗ MISSING"}`);

    if (!images.logo && !images.contacts && !images.stamp) {
      console.error("❌ All images failed to load!");
      console.log("  Possible causes:");
      console.log("    1. CORS issues (check browser console for CORS errors)");
      console.log("    2. Image files not found on server");
      console.log("    3. Invalid file paths in database");
      return;
    }

    console.log("\n✅ Image loading successful!");
  } catch (error) {
    console.error("Error during debugging:", error);
  }
}

// Attach to window for console access
if (typeof window !== "undefined") {
  (window as any).debugImages = debugAdminImages;
  console.log("Debug utility attached: Call window.debugImages() in console to diagnose image loading");
}
