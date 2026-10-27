// Print & play PDF export.
//
// Options:
//   qr:      "none" | "front" | "back"   QR code linking to the card on the website.
//            Question / task cards (type="display") never get one.
//   bw:      black & white instead of the category colors
//   a4:      A4 sheets, 3 x 3 cards with cut lines; otherwise one card per page
//            (63 x 88 mm), which is what print shops want.
//   circles: the card's category, written in a circle at the bottom of every card
//            face. Question / task cards show their own category and every topic
//            they are tagged with (needs `categories`, the deck's category list).
// With "back", every front page / sheet is followed by its back: on A4 the
// columns are mirrored, so the backs line up when printed double-sided
// (flip on the long edge).

const CARD_W = 63;  // mm
const CARD_H = 88;  // mm
const A4 = { w: 210, h: 297 };
const COLS = 3, ROWS = 3;
const QR_FRONT = 24, QR_BACK = 34; // mm, every code exactly this size
const PAD = 4;                     // mm, free edge around the title
const CIRCLE = 12, CIRCLE_GAP = 1.6, CIRCLE_EDGE = 5, FRAMED_EDGE = 7; // mm
const MIN_TITLE = 10;              // pt: below this, long words get a hyphen

// The font sits next to src/, wherever the simulator folder is.
const FONT_URL = new URL("../fonts/HelveticaNeueUltraLightv130.ttf", import.meta.url).href;

// `publicUrl` (cardset.xml <url>) wins, so PDFs made locally still point to the
// published site.
export function cardUrl(card, publicUrl) {
    let page = publicUrl || `${location.origin}${location.pathname}`;
    if (!/\/$|\.html?$/.test(page)) page += "/"; // ".../leveldesigncards" -> ".../leveldesigncards/"
    return `${page}?card=${encodeURIComponent(card.slug)}`;
}

export async function generatePDF(cards, { qr = "front", bw = false, a4 = false, circles = false, categories = [], publicUrl } = {}) {
    const pdf = await buildPDF(cards, { qr, bw, a4, circles, categories, publicUrl });
    pdf.save((document.title || "cards").toLowerCase().replace(/[^a-z0-9]+/g, "") + ".pdf");
}

export async function buildPDF(cards, { qr = "front", bw = false, a4 = false, circles = false, categories = [], publicUrl } = {}) {
    const { jsPDF } = window.jspdf;
    const pdf = a4
        ? new jsPDF({ unit: "mm", format: "a4", compress: true })
        : new jsPDF({ unit: "mm", format: [CARD_W, CARD_H], compress: true });

    let titleFont = "helvetica";
    try {
        const res = await fetch(FONT_URL);
        if (!res.ok) throw new Error("font");
        pdf.addFileToVFS("HelveticaNeue.ttf", await blobToBase64(await res.blob()));
        pdf.addFont("HelveticaNeue.ttf", "HelveticaNeue", "normal");
        titleFont = "HelveticaNeue";
    } catch { /* built-in Helvetica */ }

    // Same colors as on screen (graded, see color.js); text and QR codes in pure white.
    const look = card => {
        const outline = card.type === "display" || card.category.onlyBorder;
        const tone = card.category.tone || card.category.color;
        if (bw) return { fill: "#FFFFFF", ink: "#000000", frame: outline ? "#000000" : null, outline };
        if (outline) return { fill: "#000000", ink: "#FFFFFF", frame: tone, outline };
        return { fill: tone, ink: "#FFFFFF", frame: null, outline };
    };
    const hasQR = card => qr !== "none" && card.type !== "display";

    // Question / task cards: their own category, then their topics.
    const circlesOf = card => {
        if (!circles || card.category.isCover) return [];
        const cats = [card.category, ...card.tags.map(t => categories[t]).filter(Boolean)];
        return cats.filter((c, i) => cats.indexOf(c) === i);
    };

    // Circles along the bottom edge; returns the y where they start.
    const drawCircles = (card, x, y) => {
        const cats = circlesOf(card);
        if (!cats.length) return y + CARD_H;
        const { ink, frame } = look(card);
        const edge = frame ? FRAMED_EDGE : CIRCLE_EDGE; // stay clear of the frame
        const d = Math.min(CIRCLE, (CARD_W - 2 * edge - (cats.length - 1) * CIRCLE_GAP) / cats.length);
        const top = y + CARD_H - edge - d;
        const rowW = cats.length * d + (cats.length - 1) * CIRCLE_GAP;
        // one font size for the whole row
        pdf.setFont("helvetica", "normal");
        const fits = cats.map(c => fitLabel(pdf, c.title, d));
        const size = Math.min(...fits.map(f => f.size));
        cats.forEach((cat, i) => {
            const cx = x + (CARD_W - rowW) / 2 + d / 2 + i * (d + CIRCLE_GAP), cy = top + d / 2;
            const tone = cat.tone || cat.color;
            // tagged topics on question / task cards are filled with their color
            const filled = !bw && card.type === "display" && cat !== card.category;
            pdf.setLineWidth(0.3);
            pdf.setDrawColor(bw ? "#000000" : card.type === "display" ? tone : ink);
            if (filled) { pdf.setFillColor(tone); pdf.circle(cx, cy, d / 2, "FD"); }
            else pdf.circle(cx, cy, d / 2, "S");
            pdf.setTextColor(ink);
            pdf.setFontSize(size);
            const lines = wrapWords(pdf, cat.title, d * 0.8);
            const lineH = size * 0.3528 * 1.1;
            let ty = cy - (lines.length * lineH) / 2 + lineH * 0.78;
            for (const line of lines) {
                pdf.text(line, cx, ty, { align: "center" });
                ty += lineH;
            }
        });
        pdf.setFont(titleFont, "normal");
        return top;
    };

    const front = (card, x, y) => {
        const { fill, ink, frame } = look(card);
        background(pdf, x, y, fill, frame);
        const circlesTop = drawCircles(card, x, y);
        const hasCircles = circlesTop < y + CARD_H;
        const qrHere = qr === "front" && hasQR(card);

        // QR above the circles (or where it always was), title in the space above
        let bottom = hasCircles ? circlesTop - 3 : y + CARD_H - PAD;
        let qrTop;
        if (qrHere) {
            qrTop = hasCircles ? circlesTop - 3 - QR_FRONT : y + CARD_H * 0.76 - QR_FRONT / 2;
            bottom = qrTop - 3;
        }
        const top = y + PAD;
        const area = { w: CARD_W - 2 * PAD - (card.type === "display" ? 2 : 0), h: bottom - top };
        const segments = card.type === "display" ? [card.text] : card.titleLines.length ? card.titleLines : [card.title];
        pdf.setFont(titleFont, "normal");
        const { lines, size, lineH } = fitTitle(pdf, segments, area, card.type === "display" ? 22 : 32);
        pdf.setFontSize(size);
        pdf.setTextColor(ink);
        // without QR or circles the title sits in the middle of the card, as before
        const centerY = qrHere || hasCircles ? (top + bottom) / 2 : y + CARD_H / 2;
        let ty = centerY - (lines.length * lineH) / 2 + lineH * 0.75;
        for (const line of lines) {
            pdf.text(line, x + CARD_W / 2, ty, { align: "center" });
            ty += lineH;
        }
        if (qrHere) qrCode(pdf, cardUrl(card, publicUrl), ink, x + (CARD_W - QR_FRONT) / 2, qrTop, QR_FRONT);
    };

    const back = (card, x, y) => {
        const { fill, ink, frame } = look(card);
        background(pdf, x, y, fill, frame);
        drawCircles(card, x, y);
        if (hasQR(card)) qrCode(pdf, cardUrl(card, publicUrl), ink, x + (CARD_W - QR_BACK) / 2, y + (CARD_H - QR_BACK) / 2, QR_BACK);
    };

    if (!a4) {
        cards.forEach((card, i) => {
            if (i > 0) pdf.addPage();
            front(card, 0, 0);
            if (qr === "back") { pdf.addPage(); back(card, 0, 0); }
        });
    } else {
        const offX = (A4.w - COLS * CARD_W) / 2, offY = (A4.h - ROWS * CARD_H) / 2;
        const perSheet = COLS * ROWS;
        for (let s = 0; s * perSheet < cards.length; s++) {
            const sheet = cards.slice(s * perSheet, (s + 1) * perSheet);
            if (s > 0) pdf.addPage();
            sheet.forEach((card, i) => front(card, offX + (i % COLS) * CARD_W, offY + Math.floor(i / COLS) * CARD_H));
            cutLines(pdf, offX, offY, sheet.length);
            if (qr === "back") {
                pdf.addPage();
                sheet.forEach((card, i) => back(card, offX + (COLS - 1 - i % COLS) * CARD_W, offY + Math.floor(i / COLS) * CARD_H));
                cutLines(pdf, offX, offY, sheet.length, true);
            }
        }
    }
    return pdf;
}

function background(pdf, x, y, fill, frame) {
    pdf.setFillColor(fill);
    pdf.rect(x, y, CARD_W, CARD_H, "F");
    if (frame) {
        pdf.setDrawColor(frame);
        pdf.setLineWidth(1);
        pdf.roundedRect(x + 3, y + 3, CARD_W - 6, CARD_H - 6, 2, 2, "S");
    }
}

// Thin grey lines around each card on an A4 sheet, for cutting.
function cutLines(pdf, offX, offY, count, mirrored = false) {
    pdf.setDrawColor("#9a9a9a");
    pdf.setLineWidth(0.1);
    for (let i = 0; i < count; i++) {
        const col = mirrored ? COLS - 1 - i % COLS : i % COLS;
        pdf.rect(offX + col * CARD_W, offY + Math.floor(i / COLS) * CARD_H, CARD_W, CARD_H, "S");
    }
}

// QRious anchors its code top-left and leaves a margin that depends on the URL
// length, so its image can't be scaled to an exact size. Read the modules back
// out of a plain render and draw them as squares in the card's ink: every code
// is exactly `size` mm wide and sits exactly where it is put.
function qrCode(pdf, url, ink, x, y, size) {
    const rows = qrModules(url);
    const m = size / rows.length;
    pdf.setFillColor(ink);
    rows.forEach((row, r) => {
        for (let c = 0; c < row.length; c++) {
            if (!row[c]) continue;
            let end = c;
            while (end + 1 < row.length && row[end + 1]) end++;
            // a hair taller than a module, so rows don't show seams between them
            pdf.rect(x + c * m, y + r * m, (end - c + 1) * m, m + 0.01, "F");
            c = end;
        }
    });
}

function qrModules(url) {
    const S = 600;
    const canvas = document.createElement("canvas");
    new QRious({ element: canvas, value: url, size: S, padding: 0, background: "#ffffff", foreground: "#000000" });
    const data = canvas.getContext("2d").getImageData(0, 0, S, S).data;
    const dark = (px, py) => data[(py * S + px) * 4] < 128;
    // The top-left finder pattern starts at the first dark pixel and is 7
    // modules wide; the top-right one ends the same row.
    let ox = -1, oy = 0;
    for (; oy < S && ox < 0; oy++) for (let px = 0; px < S; px++) if (dark(px, oy)) { ox = px; break; }
    oy--;
    let run = 0;
    while (dark(ox + run, oy)) run++;
    const m = run / 7;
    let right = S - 1;
    while (!dark(right, oy)) right--;
    const n = Math.round((right - ox + 1) / m);
    return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) =>
        dark(Math.floor(ox + (c + 0.5) * m), Math.floor(oy + (r + 0.5) * m))));
}

// Words never break in the middle: the font shrinks until the longest word fits
// on a line. Only a word too long even at MIN_TITLE gets a hyphen.
function fitTitle(pdf, segments, area, maxSize) {
    for (let size = maxSize; size >= MIN_TITLE; size -= 0.5) {
        pdf.setFontSize(size);
        const lineH = size * 0.3528 * 1.22; // pt -> mm, 1.22 leading
        const lines = segments.flatMap(s => wrapWords(pdf, s, area.w));
        const widest = Math.max(...lines.map(l => pdf.getTextWidth(l)));
        if (widest <= area.w && lines.length * lineH <= area.h) return { lines, size, lineH };
    }
    pdf.setFontSize(MIN_TITLE);
    const lines = segments.flatMap(s => wrapWords(pdf, s, area.w)).flatMap(l => hyphenate(pdf, l, area.w));
    return { lines, size: MIN_TITLE, lineH: MIN_TITLE * 0.3528 * 1.22 };
}

// Largest size (pt) at which a category name fits a circle of `d` mm.
function fitLabel(pdf, label, d) {
    for (let size = 7; size > 3; size -= 0.25) {
        pdf.setFontSize(size);
        const lines = wrapWords(pdf, label, d * 0.8);
        const widest = Math.max(...lines.map(l => pdf.getTextWidth(l)));
        const lineH = size * 0.3528 * 1.1;
        if (widest <= (lines.length > 1 ? d * 0.74 : d * 0.88) && lines.length * lineH <= d * 0.6) return { size };
    }
    return { size: 3 };
}

// Greedy word wrap that never splits a word (a too-long word gets a line of its own).
function wrapWords(pdf, text, width) {
    const lines = [];
    let line = "";
    for (const word of String(text).split(/\s+/).filter(Boolean)) {
        const next = line ? line + " " + word : word;
        if (line && pdf.getTextWidth(next) > width) { lines.push(line); line = word; }
        else line = next;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
}

// Last resort for a single word wider than the card: split it with a hyphen.
function hyphenate(pdf, line, width) {
    if (pdf.getTextWidth(line) <= width) return [line];
    const out = [];
    let rest = line;
    while (pdf.getTextWidth(rest) > width) {
        let cut = rest.length - 1;
        while (cut > 2 && pdf.getTextWidth(rest.slice(0, cut) + "-") > width) cut--;
        out.push(rest.slice(0, cut) + "-");
        rest = rest.slice(cut);
    }
    out.push(rest);
    return out;
}

function blobToBase64(blob) {
    return new Promise(resolve => {
        const r = new FileReader();
        r.onloadend = () => resolve(String(r.result).split(",")[1]);
        r.readAsDataURL(blob);
    });
}
