import { useEffect, useState } from "react";
import {
  FALLBACK_COMPANY_DETAILS,
  fetchCompanyDetails,
  type CompanyDetails,
} from "@/lib/companyDetails";

/** Short-lived, app-wide cache so every screen does not re-read the same rows. */
let cached: CompanyDetails | null = null;
let cachedAt = 0;
let inFlight: Promise<CompanyDetails> | null = null;
const CACHE_MS = 30_000;

const load = (force = false): Promise<CompanyDetails> => {
  if (!force && cached && Date.now() - cachedAt < CACHE_MS) return Promise.resolve(cached);
  if (inFlight) return inFlight;
  inFlight = fetchCompanyDetails()
    .then((value) => {
      cached = value;
      cachedAt = Date.now();
      return value;
    })
    .catch(() => cached ?? FALLBACK_COMPANY_DETAILS)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
};

/** Call after saving the company settings so the tabs update immediately. */
export const invalidateCompanyDetails = (): void => {
  cached = null;
  cachedAt = 0;
};

export const useCompanyDetails = (): CompanyDetails => {
  const [details, setDetails] = useState<CompanyDetails>(cached ?? FALLBACK_COMPANY_DETAILS);

  useEffect(() => {
    let active = true;
    void load().then((value) => {
      if (active) setDetails(value);
    });
    // A second admin may have changed the letterhead while this tab was idle.
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void load(true).then((value) => {
        if (active) setDetails(value);
      });
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return details;
};
