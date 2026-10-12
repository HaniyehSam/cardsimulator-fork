// Readable colors for any category color from the XML.

const DARK_INK = "#000000"; // pure black: the ultra light font needs all the contrast it can get

function channels(hex) {
    const n = parseInt(hex.replace("#", "").padStart(6, "0").slice(0, 6), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
}

function luminance([r, g, b]) {
    const lin = v => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

// White or near-black text, whichever reads better on `hex` (white wins
// unless it falls below WCAG AA and black is clearly better).
export function inkFor(hex) {
    const L = luminance(channels(hex));
    const white = contrast(L, 1), dark = contrast(L, luminance(channels(DARK_INK)));
    return white >= 4.5 || white >= dark ? "#ffffff" : DARK_INK;
}

// The color darkened just enough for white text to be comfortable (7:1),
// used for the back of an opened card.
export function deepShade(hex) {
    const rgb = channels(hex);
    for (let t = 0.85; t > 0.15; t -= 0.05) {
        const c = rgb.map(v => Math.round(v * t));
        if (contrast(luminance(c), 1) >= 7) return `rgb(${c.join(",")})`;
    }
    return "#111";
}

// Very dark card colors get a light edge so they don't vanish on the black table.
export function edgeFor(hex) {
    return luminance(channels(hex)) < 0.03 ? "rgba(255, 255, 255, 0.24)" : "rgba(255, 255, 255, 0.07)";
}