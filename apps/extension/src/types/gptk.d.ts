// GPTK's sources reference Tampermonkey's `unsafeWindow`; we alias it to
// `window` in the build. Mirrors vendor/gptk/src/types/global.d.ts.
declare const unsafeWindow: Window & typeof globalThis & {
  WIZ_global_data: Record<string, unknown>;
};
