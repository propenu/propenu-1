export const INDIA_COUNTRY_CODE = "+91";
export const INDIAN_PHONE_DIGIT_LENGTH = 10;

export function getIndianPhoneDigits(value?: string | null) {
  const rawValue = String(value || "").trim();
  const digits = rawValue.replace(/\D/g, "");
  const hasExplicitCountryCode = rawValue.startsWith(INDIA_COUNTRY_CODE);
  const withoutCountryCode =
    (hasExplicitCountryCode ||
      (digits.startsWith("91") && digits.length > INDIAN_PHONE_DIGIT_LENGTH))
      ? digits.slice(2)
      : digits;

  return withoutCountryCode.slice(0, INDIAN_PHONE_DIGIT_LENGTH);
}

export function formatIndianPhoneNumber(value?: string | null) {
  const digits = getIndianPhoneDigits(value);
  return digits ? `${INDIA_COUNTRY_CODE}${digits}` : "";
}

function hasSuspiciousIndianPhonePattern(digits: string) {
  if (/^(\d)\1{9}$/.test(digits)) return true;
  if (/^(\d{2})\1{2,}/.test(digits)) return true;
  if (digits === "1234567890" || digits === "9876543210") return true;

  return false;
}

export function isValidIndianPhoneNumber(value?: string | null) {
  const digits = getIndianPhoneDigits(value);
  return /^[6-9]\d{9}$/.test(digits) && !hasSuspiciousIndianPhonePattern(digits);
}
