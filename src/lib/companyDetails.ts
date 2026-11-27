/**
 * Dynamic laboratory identity for reports and the app shell.
 *
 * All of this used to be typed into a few PDF generators (and the sidebar).
 * The database is now the single source of truth: `company_info` (row 1) holds
 * the name/address/phone/e-mail/web fields and `organisation_details` (row 1)
 * holds the legal/registration fields. The header artwork stays in
 * `admin_images`, keyed by image_type, and is fetched in the same pass.
 *
 * Every consumer degrades gracefully: an unavailable table, a permission
 * error or an offline API must never stop a report being produced.
 */
import { readRecord } from "./api";
import { fetchAdminImagesAsBase64, type AdminImages } from "./imageUtils";
import { isDemoMode } from "./demoMode";
import { DEMO_COMPANY } from "./demoBrand";

export interface CompanyDetails {
  name: string;
  legalName: string;
  addressLines: string[];
  phone1: string;
  phone2: string;
  email: string;
  website: string;
  registrationNumber: string;
  taxId: string;
  industry: string;
  headquartersCountry: string;
  yearEstablished: number | null;
}

/** Last-resort values so an unbranded sheet still identifies the laboratory. */
export const FALLBACK_COMPANY_DETAILS: CompanyDetails = {
  name: "Cransfield Materials Testing Center",
  legalName: "Cransfield Materials Testing Center",
  addressLines: [],
  phone1: "",
  phone2: "",
  email: "",
  website: "",
  registrationNumber: "",
  taxId: "",
  industry: "",
  headquartersCountry: "",
  yearEstablished: null,
};

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export const formatCompanyAddress = (company: CompanyDetails, separator = " · "): string =>
  company.addressLines.filter((line) => line.trim() !== "").join(separator);

export const formatCompanyPhones = (company: CompanyDetails): string =>
  [company.phone1, company.phone2].map(str).filter(Boolean).join(" · ");

/**
 * Reads the company/organisation settings fresh on every call. Reports call
 * this at export time, so a change made in Settings reaches the very next PDF.
 */
export const fetchCompanyDetails = async (): Promise<CompanyDetails> => {
  // Demo mode replaces the identity, never the data: lists/reads still go to
  // the live API exactly as before.
  if (isDemoMode()) return { ...DEMO_COMPANY, addressLines: [...DEMO_COMPANY.addressLines] };

  const [companyResult, orgResult] = await Promise.allSettled([
    readRecord<Record<string, unknown>>("company_info", 1),
    readRecord<Record<string, unknown>>("organisation_details", 1),
  ]);

  const companyRow = companyResult.status === "fulfilled" ? companyResult.value?.data : null;
  const orgRow = orgResult.status === "fulfilled" ? orgResult.value?.data : null;

  const name = str(companyRow?.name) || str(orgRow?.legal_name);
  const addressLines = [1, 2, 3]
    .map((index) => str(companyRow?.[`address_line${index}`]))
    .filter(Boolean);

  return {
    name: name || FALLBACK_COMPANY_DETAILS.name,
    legalName: str(orgRow?.legal_name) || name || FALLBACK_COMPANY_DETAILS.legalName,
    addressLines,
    phone1: str(companyRow?.phone1),
    phone2: str(companyRow?.phone2),
    email: str(companyRow?.email),
    website: str(companyRow?.website),
    registrationNumber: str(orgRow?.registration_number),
    taxId: str(orgRow?.tax_id),
    industry: str(orgRow?.industry),
    headquartersCountry: str(orgRow?.headquarters_country),
    yearEstablished:
      typeof orgRow?.year_established === "number"
        ? orgRow.year_established
        : str(orgRow?.year_established)
          ? Number.parseInt(str(orgRow.year_established), 10)
          : null,
  };
};

export interface ReportBrand {
  images: AdminImages;
  company: CompanyDetails;
}

/** One call for every report: header artwork + typed company identity. */
export const fetchReportBrand = async (sessionToken: string = ""): Promise<ReportBrand> => {
  const [images, company] = await Promise.all([
    fetchAdminImagesAsBase64(sessionToken).catch(() => ({}) as AdminImages),
    fetchCompanyDetails(),
  ]);
  return { images, company };
};
