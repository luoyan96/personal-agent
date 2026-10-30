import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type Identity = { token: string; memberId: string };
type Identities = Record<string, Identity>;

const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");

function read(file: string): Identities {
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Identities)
      : {};
  } catch {
    return {};
  }
}

/**
 * Remembers which account this exact session cookie was last verified for, so
 * the transcript stays readable when the service cannot be reached.
 *
 * Only a hash of the cookie is stored: the file proves "this cookie was
 * verified as member X", never the credential itself. An unchanged cookie
 * cannot mean a different account, which is what makes the offline path as
 * strict as the online one.
 */
export function rememberIdentity(
  file: string,
  service: string,
  token: string,
  memberId: string,
) {
  const all = read(file);
  all[service] = { token: digest(token), memberId };
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(all), { mode: 0o600 });
  } catch {
    // Losing this only costs the offline path; the cache still works online.
  }
}

/** The member this cookie was verified for, or null when it was never seen. */
export function knownMember(file: string, service: string, token: string) {
  const known = read(file)[service];
  return known && known.token === digest(token) ? known.memberId : null;
}
