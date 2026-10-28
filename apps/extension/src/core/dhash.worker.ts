// Web Worker: 64-bit difference hash (dHash) of an image.
// Shrink to a 9x8 greyscale grid; each bit says whether a pixel is brighter than its right neighbour.
const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<{ id: number; blob: Blob }>) => {
  const { id, blob } = e.data;
  try {
    const bmp = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(9, 8);
    const g = canvas.getContext("2d", { willReadFrequently: true })!;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(bmp, 0, 0, 9, 8);
    bmp.close();
    const px = g.getImageData(0, 0, 9, 8).data;
    const grey = (x: number, y: number) => {
      const i = (y * 9 + x) * 4;
      return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    };
    let bits = 0n;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        bits = (bits << 1n) | (grey(x, y) > grey(x + 1, y) ? 1n : 0n);
      }
    }
    ctx.postMessage({ id, hash: bits.toString(16).padStart(16, "0") });
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
