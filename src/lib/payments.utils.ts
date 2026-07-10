/**
 * Pure utility functions for DPO Pay XML building and parsing.
 * Extracted so they can be unit-tested without pulling in @tanstack/react-start.
 */

/** Escape a value before interpolating into XML to prevent tag injection. */
export function xmlEscape(v: string | number): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Validate a phone number: digits and optional leading '+', 7-15 chars. */
export function sanitizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = String(phone).trim();
  if (!/^\+?[0-9]{7,15}$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Build the DPO Pay createToken XML payload.
 */
export function buildCreateTokenXml(opts: {
  companyToken: string;
  serviceType: string;
  amount: number;
  companyRef: string;
  redirectUrl: string;
  backUrl: string;
  itemType: string;
  phone?: string | null;
}): string {
  const serviceDate = new Date().toISOString().replace("T", " ").slice(0, 19);
  const safePhone = sanitizePhone(opts.phone);
  const phoneElement = safePhone ? `<PhoneNumber>${xmlEscape(safePhone)}</PhoneNumber>` : "";

  return `<?xml version="1.0" encoding="utf-8"?>
<API3G>
  <CompanyToken>${xmlEscape(opts.companyToken)}</CompanyToken>
  <Request>createToken</Request>
  <Transaction>
    <PaymentAmount>${opts.amount.toFixed(2)}</PaymentAmount>
    <PaymentCurrency>ZMW</PaymentCurrency>
    <CompanyRef>${xmlEscape(opts.companyRef)}</CompanyRef>
    <RedirectURL>${xmlEscape(opts.redirectUrl)}</RedirectURL>
    <BackURL>${xmlEscape(opts.backUrl)}</BackURL>
    <CompanyRefUnique>0</CompanyRefUnique>
    <PTL>5</PTL>
    ${phoneElement}
  </Transaction>
  <Services>
    <Service>
      <ServiceType>${xmlEscape(opts.serviceType)}</ServiceType>
      <ServiceDescription>${xmlEscape(`WESU+ ${opts.itemType}`)}</ServiceDescription>
      <ServiceDate>${serviceDate}</ServiceDate>
    </Service>
  </Services>
</API3G>`;
}

/**
 * Extract a value from an XML string using a simple regex.
 * Returns the first match of <tagName>...</tagName>.
 */
export function extractXmlTag(xml: string, tagName: string): string | null {
  const match = xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`));
  return match ? match[1].trim() : null;
}
