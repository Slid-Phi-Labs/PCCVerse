export async function gzipSize(data: Uint8Array): Promise<number | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
    const buf = await new Response(stream).arrayBuffer();
    return buf.byteLength;
  } catch {
    return null;
  }
}
