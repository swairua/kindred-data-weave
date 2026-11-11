#!/usr/bin/env node
/**
 * Smoke test for the coring photo API on a deployed host.
 *
 * Usage (PowerShell):
 *   $env:BASE_URL="https://lab.wayrus.co.ke"
 *   $env:LAB_EMAIL="admin@cransfield.com"
 *   $env:LAB_PASSWORD="..."
 *   node scripts/verify-coring-photo-api.mjs
 *
 * Optional:
 *   --legacy <path>   also try to delete an image that has no DB row, e.g.
 *                     --legacy /uploads/pile_before_20261108_174509_c8811ecafeb0.jpg
 *
 * The script uploads a 1x1 PNG, checks that it is stored under /uploads/ (not
 * /uploads/coring/), that both the public URL and serve-image can read it, then
 * deletes it and confirms it is gone. Every step prints PASS/FAIL.
 */

const BASE = (process.env.BASE_URL || "https://lab.wayrus.co.ke").replace(/\/+$/, "");
const EMAIL = process.env.LAB_EMAIL;
const PASSWORD = process.env.LAB_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("Set LAB_EMAIL and LAB_PASSWORD (and optionally BASE_URL) before running.");
  process.exit(2);
}

const legacyIndex = process.argv.indexOf("--legacy");
const legacyPath = legacyIndex > -1 ? process.argv[legacyIndex + 1] : null;

let failures = 0;

function check(name, ok, detail = "") {
  if (ok) {
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
  return ok;
}

async function main() {
  console.log(`API: ${BASE}`);

  // 1. Login
  const loginRes = await fetch(`${BASE}/api.php?action=login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const login = await loginRes.json().catch(() => ({}));
  if (!check("login", loginRes.status === 200 && Boolean(login.session_token), `status ${loginRes.status}`)) {
    return;
  }
  const auth = { "X-Session-Token": login.session_token };

  // 2. Upload a tiny PNG through the coring endpoint
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
    "base64",
  );
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "api_probe.png");
  form.append("image_type", "before");

  const uploadRes = await fetch(`${BASE}/api.php?action=upload-coring-photo`, {
    method: "POST",
    headers: auth,
    body: form,
  });
  const upload = await uploadRes.json().catch(() => ({}));
  const filePath = upload.file_path;
  if (!check("upload-coring-photo", uploadRes.status === 200 && Boolean(filePath), `status ${uploadRes.status}`)) {
    return;
  }

  // 3. Storage location must be the /uploads/ root (uniform with existing previews)
  check(
    "upload path uses /uploads/ root",
    typeof filePath === "string" && /^\/uploads\/(coring_before_|coring_after_)/.test(filePath),
    filePath,
  );

  // 4. Public URL + serve-image must both return the file
  const publicRes = await fetch(`${BASE}${filePath}`);
  check("public URL serves the upload", publicRes.status === 200, `status ${publicRes.status}`);

  const servedRes = await fetch(`${BASE}/api.php?action=serve-image&file_path=${encodeURIComponent(filePath)}`, {
    headers: auth,
  });
  check("serve-image serves the upload", servedRes.status === 200, `status ${servedRes.status}`);

  // 5. Delete and confirm the file is really gone
  const deleteRes = await fetch(`${BASE}/api.php?action=delete-coring-photo`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ file_path: filePath }),
  });
  check("delete-coring-photo", deleteRes.status === 200, `status ${deleteRes.status}`);

  const afterRes = await fetch(`${BASE}${filePath}`);
  check("file removed from disk", afterRes.status === 404, `status ${afterRes.status}`);

  // 6. Optional: an image that has no coring_photos/admin_images row
  if (legacyPath) {
    const legacyRes = await fetch(`${BASE}/api.php?action=delete-coring-photo`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ file_path: legacyPath }),
    });
    check(
      "delete image with no DB row (needs api.php >= e76db09)",
      legacyRes.status === 200,
      `status ${legacyRes.status}`,
    );
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error("Verification crashed:", error);
  process.exitCode = 1;
});
