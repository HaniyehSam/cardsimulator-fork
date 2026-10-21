// Color grading for the category colors from the XML.
//
// Each card set designs its own palette in cardCategories.xml (content). The
// simulator only makes sure pure white text reads on every card:
//   default  "guard": a color keeps its hue and vividness; only if white text
//            would fall below 4.5:1 is it darkened, just enough.
//   "calm":  all colors pulled into one shared lightness band (muted look).
//   "off":   the XML colors exactly as they are.
// Set with <grading> in cards/cardset.xml. Works in OKLCH, so equal numbers
// look equally light.

const L_LOW = 0.36, L_HIGH = 0.54; // lightness band (OKLab L)
const C_MAX = 0.13;                // chroma ceiling
const DARKER_BACK = 0.07;          // the back of a card is a little deeper

// ---- conversions (Björn Ottosson's OKLab) ----

const toLinear = v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const toSrgb = v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function hexToRgb(hex) {
    const n = parseInt(String(hex).replace("#", "").padStart(6, "0").slice(0, 6), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
}

function rgbToOklch([R, G, B]) {
    const r = toLinear(R), g = toLinear(G), b = toLinear(B);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    return { L, C: Math.hypot(A, Bb), h: Math.atan2(Bb, A) };
}

// linear sRGB, may be out of gamut
function oklchToLinear({ L, C, h }) {
    const A = C * Math.cos(h), Bb = C * Math.sin(h);
    const l = (L + 0.3963377774 * A + 0.2158037573 * Bb) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * Bb) ** 3;
    const s = (L - 0.0894841775 * A - 1.2914855480 * Bb) ** 3;
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ];
}

function oklchToHex(c) {
    let lin = oklchToLinear(c);
    // out of gamut: lower the chroma until it fits
    for (let C = c.C; lin.some(v => v < -1e-4 || v > 1 + 1e-4) && C > 0; C -= 0.004) {
        lin = oklchToLinear({ ...c, C: Math.max(0, C) });
    }
    const byte = v => Math.round(Math.min(255, Math.max(0, toSrgb(Math.min(1, Math.max(0, v))))));
    return "#" + lin.map(v => byte(v).toString(16).padStart(2, "0")).join("");
}

const luminance = rgb => {
    const [r, g, b] = rgb.map(toLinear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// ---- grading ----

const MIN_CONTRAST = 4.5; // white text, WCAG AA
const contrastWithWhite = hex => 1.05 / (luminance(hexToRgb(hex)) + 0.05);

// Grades a list of categories in place: sets `tone` (card color) and `deep`
// (back of the card). The black title category is left black; border-only
// categories (questions, tasks) carry no text on their color and stay vivid.
export function gradeCategories(categories, { mode = "guard" } = {}) {
    if (mode === "calm") return calmBand(categories);
    for (const cat of categories) {
        if (cat.isCover) { cat.tone = "#000000"; cat.deep = "#0b0b0b"; continue; }
        if (mode === "off" || cat.onlyBorder) { cat.tone = cat.color; cat.deep = shade(cat.color); continue; }
        const c = rgbToOklch(hexToRgb(cat.color));
        let L = c.L, tone = cat.color;
        while (contrastWithWhite(tone) < MIN_CONTRAST && L > 0.2) {
            L -= 0.01;
            tone = oklchToHex({ ...c, L });
        }
        cat.tone = tone;
        cat.deep = oklchToHex({ ...rgbToOklch(hexToRgb(tone)), L: Math.max(0.2, L - DARKER_BACK) });
    }
}

// "calm": every color pulled into one shared lightness band, loud colors toned down.
function calmBand(categories) {
    const colored = categories.filter(c => !c.isCover);
    const lch = new Map(colored.map(c => [c, rgbToOklch(hexToRgb(c.color))]));

    const Ls = [...lch.values()].map(v => v.L);
    const min = Math.min(...Ls), max = Math.max(...Ls);
    const scale = max > min ? Math.min(1, (L_HIGH - L_LOW) / (max - min)) : 1;
    const half = (max - min) * scale / 2;
    const mid = (min + max) / 2;
    const target = Math.min(L_HIGH - half, Math.max(L_LOW + half, mid));

    for (const cat of categories) {
        if (cat.isCover) { cat.tone = "#000000"; cat.deep = "#0b0b0b"; continue; }
        const c = lch.get(cat);
        const L = target + (c.L - mid) * scale;
        const C = c.C < 0.02 ? c.C : Math.min(C_MAX, c.C);
        cat.tone = oklchToHex({ L, C, h: c.h });
        cat.deep = oklchToHex({ L: Math.max(0.2, L - DARKER_BACK), C: C * 0.9, h: c.h });
    }
}

// Ungraded colors: darken until white text reads comfortably (7:1).
function shade(hex) {
    const rgb = hexToRgb(hex);
    for (let t = 1; t > 0.15; t -= 0.05) {
        const c = rgb.map(v => Math.round(v * t));
        if (1.05 / (luminance(c) + 0.05) >= 7) return "#" + c.map(v => v.toString(16).padStart(2, "0")).join("");
    }
    return "#111111";
}

// Very dark card colors get a light edge so they don't vanish on the black table.
export function edgeFor(hex) {
    return luminance(hexToRgb(hex)) < 0.04 ? "rgba(255, 255, 255, 0.22)" : "rgba(255, 255, 255, 0.08)";
}
