/**
 * Debug utilities for diagnosing image loading issues in exports
 * Usage: Call window.debugImages() in browser console
 */

import { listRecords, buildApiUrl, getSessionToken } from "./api";
import { fetchAdminImagesAsBase64 } from "./imageUtils";

export async function debugAdminImages() {
  console.clear();
  console.log("%c=== ADMIN IMAGES DIAGNOSTIC TOOL ===", "color: #2962A3; font-size: 16px; font-weight: bold;");
  console.log("");

  try {
    // Step 1: Check database
    console.log("%cStep 1: Checking admin_images database table...", "color: #2962A3; font-weight: bold;");
    const response = await listRecords<{ image_type: string; file_path: string; id: number; created_at?: string }>("admin_images");
    const rows = response.data || [];

    console.log(`Found ${rows.length} image record(s):`);
    if (rows.length > 0) {
      console.table(rows);
    }

    if (rows.length === 0) {
      console.warn("%c❌ NO IMAGES IN DATABASE!", "color: #DC2626; font-weight: bold;");
      console.log("%cSOLUTION:", "color: #2962A3; font-weight: bold;");
      console.log("1. Go to Admin panel in the application");
      console.log("2. Click 'Media Library' tab");
      console.log("3. Upload these images:");
      console.log("   • Logo (appears top-left of exports)");
      console.log("   • Contacts (appears top-right of exports)");
      console.log("   • Stamp (appears in footer)");
      console.log("4. After uploading, exports will automatically include the images");
      return;
    }

    // Step 2: Check image paths and formats
    console.log("");
    console.log("%cStep 2: Image paths and storage details:", "color: #2962A3; font-weight: bold;");
    const latest: Record<string, string> = {};
    for (const row of rows) {
      if (!latest[row.image_type]) {
        latest[row.image_type] = row.file_path;
        console.log(`  ✓ ${row.image_type.toUpperCase()}: ${row.file_path}`);
        if (row.created_at) {
          console.log(`    Uploaded: ${new Date(row.created_at).toLocaleString()}`);
        }
      }
    }

    // Step 3: Check server connectivity
    console.log("");
    console.log("%cStep 3: Testing server connectivity...", "color: #2962A3; font-weight: bold;");
    const sessionToken = getSessionToken();
    const apiUrl = buildApiUrl();
    const apiOrigin = new URL(apiUrl).origin;
    console.log(`  API URL: ${apiUrl}`);
    console.log(`  API Origin: ${apiOrigin}`);
    console.log(`  Session Token: ${sessionToken ? "✓ Present" : "✗ Missing"}`);

    // Step 4: Test image conversion
    console.log("");
    console.log("%cStep 4: Attempting to fetch and convert images to base64...", "color: #2962A3; font-weight: bold;");
    const images = await fetchAdminImagesAsBase64();

    console.log("  Results:");
    console.log(`    Logo: ${images.logo ? `✓ Loaded (${(images.logo.length / 1024 / 1024).toFixed(2)} MB)` : "✗ FAILED"}`);
    console.log(`    Contacts: ${images.contacts ? `✓ Loaded (${(images.contacts.length / 1024 / 1024).toFixed(2)} MB)` : "✗ FAILED"}`);
    console.log(`    Stamp: ${images.stamp ? `✓ Loaded (${(images.stamp.length / 1024 / 1024).toFixed(2)} MB)` : "✗ FAILED"}`);

    if (!images.logo && !images.contacts && !images.stamp) {
      console.error("%c❌ All images failed to load!", "color: #DC2626; font-weight: bold;");
      console.log("%cPossible causes:", "color: #2962A3; font-weight: bold;");
      console.log("  1. CORS issues - check browser Network tab for failed requests");
      console.log("  2. Image files not found on server");
      console.log("  3. Invalid file paths in database");
      console.log("  4. Missing authentication");
      console.log("");
      console.log("%cTo investigate further:", "color: #2962A3; font-weight: bold;");
      console.log("  • Open browser DevTools → Network tab");
      console.log("  • Attempt export again");
      console.log("  • Look for failed image requests (red X)");
      console.log("  • Check response status and error messages");
      return;
    }

    console.log("");
    console.log("%c✅ All images loaded successfully!", "color: #16A34A; font-weight: bold;");
    console.log("");
    console.log("%cImages are ready for export:", "color: #2962A3; font-weight: bold;");
    if (images.logo) console.log("  ✓ Logo will be included in PDF/Excel");
    if (images.contacts) console.log("  ✓ Contacts will be included in PDF/Excel");
    if (images.stamp) console.log("  ✓ Stamp will be included in PDF/Excel");
    console.log("");
    console.log("Try exporting to PDF or Excel now - images should appear!");
  } catch (error) {
    console.error("%c❌ Error during debugging:", "color: #DC2626; font-weight: bold;", error);
    console.log("");
    console.log("%cCommon issues:", "color: #2962A3; font-weight: bold;");
    console.log("  • API endpoint not responding - check internet connection");
    console.log("  • Database table doesn't exist - contact system administrator");
    console.log("  • Authentication failed - try logging out and back in");
  }
}

// Debug function is available for import in development, not exposed globally
