import { randomBytes, createHash } from "node:crypto";

const TTL = 10 * 60_000;
const MAX_TOKEN = 128_000;
const MAX_ENTRIES = 128;
const MAX_BYTES = 16 * 1024 ** 2;
export class TransferError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
/** Best-effort process memory only: never assume different Vercel instances share it. */
export class TransferCache {
  private entries = new Map<string, { payload: string; expiresAt: number }>();
  private attempts = new Map<string, { count: number; resetAt: number }>();
  private bytes = 0;
  constructor(private now = Date.now) {}
  private sweep() {
    const now = this.now();
    for (const [key, item] of this.entries) if (item.expiresAt <= now) { this.bytes -= item.payload.length * 2; this.entries.delete(key); }
    for (const [key, item] of this.attempts) if (item.resetAt <= now) this.attempts.delete(key);
  }
  rateLimit(address: string) {
    this.sweep();
    // Store a short-lived digest, not the caller's address.
    const key = createHash("sha256").update(address).digest("hex");
    const existing = this.attempts.get(key);
    if (existing && existing.count >= 30) throw new TransferError("Too many transfer requests. Wait a minute and try again.", 429);
    if (!existing && this.attempts.size >= 4096) throw new TransferError("Transfer service is busy. Try a file or link instead.", 503);
    this.attempts.set(key, { count: (existing?.count ?? 0) + 1, resetAt: existing?.resetAt ?? this.now() + 60_000 });
  }
  create(payload: unknown) {
    this.sweep();
    if (typeof payload !== "string" || payload.length > MAX_TOKEN || !/^(?:g1|j1)\.[A-Za-z0-9_-]+$/.test(payload)) throw new TransferError("Invalid or oversized transfer data. Use a JSON file instead.", 400);
    if (this.entries.size >= MAX_ENTRIES || this.bytes + payload.length * 2 > MAX_BYTES) throw new TransferError("Temporary transfer storage is full. Use a file or link, or try again in 10 minutes.", 503);
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    let key: string;
    do { key = [...randomBytes(10)].map(value => alphabet[value & 31]).join(""); } while (this.entries.has(key));
    const expiresAt = this.now() + TTL;
    const item = { payload, expiresAt };
    this.entries.set(key, item); this.bytes += payload.length * 2;
    setTimeout(() => {
      if (this.entries.get(key) === item) { this.bytes -= item.payload.length * 2; this.entries.delete(key); }
    }, TTL).unref();
    return { code: `${key.slice(0, 5)}-${key.slice(5)}`, expiresAt };
  }
  read(code: unknown) {
    this.sweep();
    if (typeof code !== "string" || code.length > 32) throw new TransferError("Enter a valid transfer code.", 400);
    const key = code.toUpperCase().replace(/[\s-]/g, "");
    if (!/^[0-9A-HJKMNP-TV-Z]{10}$/.test(key)) throw new TransferError("Enter the 10-character transfer code.", 400);
    const entry = this.entries.get(key);
    if (!entry) throw new TransferError("Code unavailable: it may have expired, the server may have restarted, or this request reached another instance. Try again, or use the JSON file or import link.", 404);
    // Keep until expiry so a lost response or failed local import can be retried.
    return { payload: entry.payload, expiresAt: entry.expiresAt };
  }
}
