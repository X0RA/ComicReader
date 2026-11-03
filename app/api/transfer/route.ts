import { TransferCache, TransferError } from "@/lib/transfer-cache";
export const runtime = "nodejs";
const processState = globalThis as typeof globalThis & { comicReaderTransfers?: TransferCache };
const cache = processState.comicReaderTransfers ??= new TransferCache();
const headers = { "Cache-Control": "private, no-store, max-age=0", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store" };

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin"), url = new URL(request.url);
    // Next may construct request.url with an internal host behind its proxy.
    const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host") || url.host;
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.slice(0, -1);
    if (origin && origin !== `${protocol}://${host}`) throw new TransferError("Open this site's Backup & transfer page to transfer data.", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new TransferError("Expected JSON transfer data.", 415);
    cache.rateLimit((request.headers.get("x-forwarded-for")?.split(",")[0] || "local").trim().slice(0, 256));
    if (Number(request.headers.get("content-length")) > 130_000) throw new TransferError("Transfer is too large. Use a JSON file.", 413);
    if (!request.body) throw new TransferError("Missing transfer data.", 400);
    const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length;
        if (size > 130_000) { await reader.cancel(); throw new TransferError("Transfer is too large. Use a JSON file.", 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let data;
    try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new TransferError("Invalid transfer JSON.", 400); }
    if (!data || typeof data !== "object") throw new TransferError("Invalid transfer request.", 400);
    const response = data.action === "create" ? cache.create(data.payload) : data.action === "read" ? cache.read(data.code) : undefined;
    if (!response) throw new TransferError("Unknown transfer action.", 400);
    return Response.json(response, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof TransferError ? error.message : "Transfer failed. Try again, or use a JSON file." }, { status: error instanceof TransferError ? error.status : 500, headers });
  }
}
