/**
 * Destination masking for the Communication Center UI (Step 63's privacy
 * requirement: the raw destination is never rendered in a list view). Pure
 * string functions, no DB access.
 */

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "*".repeat(Math.max(email.length, 3));
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(local.length - 1, 3))}@${domain}`;
}

export function maskPhone(phone: string): string {
  const prefixLen = phone.startsWith("+") ? 4 : 3;
  if (phone.length <= prefixLen + 3) return "*".repeat(phone.length);
  const prefix = phone.slice(0, prefixLen);
  const suffix = phone.slice(-3);
  const middleLength = phone.length - prefix.length - suffix.length;
  return `${prefix}${"*".repeat(middleLength)}${suffix}`;
}

export function maskDestination(destination: string, channel: "EMAIL" | "WHATSAPP"): string {
  return channel === "EMAIL" ? maskEmail(destination) : maskPhone(destination);
}
