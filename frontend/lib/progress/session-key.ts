/**
 * Derive a stable, short identifier from a (resume, jd) pair.
 *
 * Why this exists: progress lives in localStorage. Without a session key the
 * store is one global bucket, and any "completed" status from a prior analysis
 * leaks into a new analysis whenever course IDs overlap (very common for
 * popular YouTube tutorials). Keying by hash(resume + jd) gives each analysis
 * its own isolated bucket — same inputs land in the same bucket (so progress
 * persists across page reloads of the same analysis), different inputs land
 * in their own bucket (no cross-session leakage).
 *
 * Why djb2 and not SHA-256:
 *   - We don't need cryptographic strength — just a short, deterministic
 *     identifier for a localStorage key. Collisions inside a single user's
 *     history are astronomically unlikely.
 *   - djb2 is synchronous; SubtleCrypto.digest() is async, which would force
 *     the rest of the progress code to handle Promises everywhere.
 *   - The output is 7–8 base36 chars — short enough for compact storage.
 */
export function computeSessionKey(resume: string, jd: string): string {
  // Trim so trailing-whitespace differences don't fragment otherwise-identical
  // inputs into separate sessions.
  return djb2(resume.trim() + "|" + jd.trim());
}

function djb2(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // (hash * 33) ^ char, then force back to unsigned 32-bit.
    hash = ((hash * 33) ^ str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}
