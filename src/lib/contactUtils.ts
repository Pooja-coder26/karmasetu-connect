/**
 * KarmaSetu Connect - Contact Utilities
 *
 * Normalizes phone numbers for `tel:` links and WhatsApp `https://wa.me/` links.
 * Handles Indian phone numbers (+91) with or without country code.
 */

/**
 * Normalizes a phone number for direct dialer `tel:` links.
 * Output format: `+91XXXXXXXXXX`
 */
export function normalizeCallPhone(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== 'string') return null;
  const cleaned = phone.trim().replace(/[\s\-()]/g, '');
  if (!cleaned) return null;

  const digits = cleaned.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  if (cleaned.startsWith('+')) {
    return `+${digits}`;
  }
  return digits ? `+${digits}` : null;
}

/**
 * Normalizes a phone number for WhatsApp `https://wa.me/<digits>` links.
 * Output format: only country code and digits, no plus, no spaces, no dashes.
 */
export function normalizeWhatsAppDigits(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  return digits;
}

/**
 * Generates a full WhatsApp chat URL.
 */
export function getWhatsAppUrl(phone: string | null | undefined, message?: string): string | null {
  const digits = normalizeWhatsAppDigits(phone);
  if (!digits) return null;

  const base = `https://wa.me/${digits}`;
  if (message && message.trim()) {
    return `${base}?text=${encodeURIComponent(message.trim())}`;
  }
  return base;
}
