import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
vi.mock("@/lib/imageUtils", () => ({
  fetchAdminImagesAsBase64: async () => {
    const toDataUrl = async (path: string) => {
      const res = await fetch("https://lab.wayrus.co.ke" + path);
      if (!res.ok) return undefined;
      const buf = Buffer.from(await res.arrayBuffer());
      return `data:image/jpeg;base64,${buf.toString("base64")}`;
    };
    return {
      logo: await toDataUrl("/uploads/admin/logo/logo_20260407_050124_d609d06ec523.jpg"),
      contacts: await toDataUrl("/uploads/admin/contacts/contacts_20260407_050218_3b81d75c955b.jpg"),
    };
  },
}));
import { generateReceptionAckPDF } from "../lib/receptionAckPdfGenerator";
import type { ReceptionConsignmentInput } from "../lib/reception";

/** Throwaway dump: renders the live seeded consignment to a PDF for visual QA. */
describe("reception ack dump", () => {
  it("renders the seeded consignment", async () => {
    const login = await fetch("https://lab.wayrus.co.ke/api.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ action: "login", email: "admin@cransfield.com", password: "Pass123" }),
    }).then((r) => r.json());
    const list = await fetch("https://lab.wayrus.co.ke/api.php?action=list&table=reception_consignments&limit=10", {
      headers: { "X-Session-Token": login.session_token },
    }).then((r) => r.json());
    const row = list.data[0];
    const payload = typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : row.payload_json;
    const doc = await generateReceptionAckPDF({ ...payload, skipDownload: true } as ReceptionConsignmentInput);
    fs.writeFileSync("_fresh_reception_ack.pdf", Buffer.from(doc.output("arraybuffer")));
    expect(doc.getNumberOfPages()).toBeGreaterThan(0);
  }, 60000);
});
