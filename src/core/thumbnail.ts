// GPTK gives a base URL; a size suffix picks the rendition (square crop here).
export const thumbSrc = (base: string, px = 160) => `${base}=w${px}-h${px}-c`;
