import { useEffect, useRef, useState } from "react";
import { thumbSrc } from "@/core/thumbnail";

// Thumbnails are fetched with the extension's host permission (no CORS limit, Google session cookies sent)
// and shown as local blobs. At a thousand photos per account that must not mean a thousand simultaneous
// requests, so: only when scrolled near the viewport, at most MAX_PARALLEL at a time, and each image is
// kept in memory so switching pages does not download it again.
const MAX_PARALLEL = 6;
let running = 0;
const waiting: (() => void)[] = [];
const cache = new Map<string, string>(); // thumbnail URL -> blob URL
const inflight = new Map<string, Promise<string>>();

function acquire(): Promise<void> {
  if (running < MAX_PARALLEL) {
    running++;
    return Promise.resolve();
  }
  return new Promise((resolve) =>
    waiting.push(() => {
      running++;
      resolve();
    }),
  );
}
function release() {
  running--;
  waiting.shift()?.();
}

function load(url: string): Promise<string> {
  const hit = cache.get(url);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(url);
  if (pending) return pending;
  const p = (async () => {
    await acquire();
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) throw new Error(`not an image (${blob.type || "no type"})`);
      const blobUrl = URL.createObjectURL(blob);
      cache.set(url, blobUrl);
      return blobUrl;
    } finally {
      release();
      inflight.delete(url);
    }
  })();
  inflight.set(url, p);
  return p;
}

export function Thumb({ base, px = 120 }: { base?: string; px?: number }) {
  const url = base ? thumbSrc(base, px * 2) : undefined;
  const [src, setSrc] = useState<string | undefined>(() => (url ? cache.get(url) : undefined));
  const [err, setErr] = useState<string>();
  const [visible, setVisible] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Start loading only once the placeholder is near the viewport.
  useEffect(() => {
    if (src || visible) return;
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [src, visible]);

  useEffect(() => {
    if (!url || !visible || src) return;
    let cancelled = false;
    load(url).then(
      (b) => !cancelled && setSrc(b),
      (e) => !cancelled && setErr(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [url, visible, src]);

  const size = { width: px, height: px, background: "var(--surface-2, #eee)", display: "block", borderRadius: 7 } as const;
  if (src) return <img src={src} width={px} height={px} style={{ ...size, objectFit: "cover" }} />;
  return (
    <div ref={box} style={{ ...size, fontSize: 11, color: "var(--bad, #a00)", padding: 4, boxSizing: "border-box", overflow: "hidden" }}>
      {err}
    </div>
  );
}
