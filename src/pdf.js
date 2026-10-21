// Print & play PDF export.
//
// Options:
//   qr:  "none" | "front" | "back"   QR code linking to the card on the website.
//        Question / task cards (type="display") never get one.
//   bw:  black & white instead of the category colors
//   a4:  A4 sheets, 3 x 3 cards with cut lines; otherwise one card per page
//        (63 x 88 mm), which is what print shops want.
// With "back", every front page / sheet is followed by its back: on A4 the
// columns are mirrored, so the backs line up when printed double-sided
// (flip on the long edge).

const CARD_W = 63;  // mm
const CARD_H = 88;  // mm
const A4 = { w: 210, h: 297 };
const COLS = 3, ROWS = 3;
const QR_FRONT = 24, QR_BACK = 34; // mm

// The font sits next to src/, wherever the simulator folder is.
const FONT_URL = new URL("../fonts/HelveticaNeueUltraLightv130.ttf", import.meta.url).href;

// `publicUrl` (cardset.xml <url>) wins, so PDFs made locally still point to the
// published site.
export function cardUrl(card, publicUrl) {
    let page = publicUrl || `${location.origin}${location.pathname}`;
    if (!/\/$|\.html?$/.test(page)) page += "/"; // ".../leveldesigncards" -> ".../leveldesigncards/"
    return `${page}?card=${encodeURIComponent(card.slug)}`;
}

export async function generatePDF(cards, { qr = "front", bw = false, a4 = false, publicUrl } = {}) {
    const { jsPDF } = window.jspdf;
    const pdf = a4
        ? new jsPDF({ unit: "mm", format: "a4", compress: true })
        : new jsPDF({ unit: "mm", format: [CARD_W, CARD_H], compress: true });

    try {
        const res = await fetch(FONT_URL);
        if (!res.ok) throw new Error("font");
        pdf.addFileToVFS("HelveticaNeue.ttf", await blobToBase64(await res.blob()));
        pdf.addFont("HelveticaNeue.ttf", "HelveticaNeue", "normal");
        pdf.setFont("HelveticaNeue");
    } catch {
        pdf.setFont("helvetica");
    }

    // Same colors as on screen (graded, see color.js); text and QR codes in pure white.
    const look = card => {
        const outline = card.type === "display" || card.category.onlyBorder;
        const tone = card.category.tone || card.category.color;
        if (bw) return { fill: "#FFFFFF", ink: "#000000", frame: outline ? "#000000" : null };
        if (outline) return { fill: "#000000", ink: "#FFFFFF", frame: tone };
        return { fill: tone, ink: "#FFFFFF", frame: null };
    };
    const hasQR = card => qr !== "none" && card.type !== "display";

    const front = (card, x, y) => {
        const { fill, ink, frame } = look(card);
        background(pdf, x, y, fill, frame);
        pdf.setTextColor(ink);
        const qrHere = qr === "front" && hasQR(card);
        const area = { w: CARD_W - 8, h: qrHere ? CARD_H * 0.52 : CARD_H * 0.8 };
        const segments = card.type === "display" ? [card.text] : card.titleLines.length ? card.titleLines : [card.title];
        const { lines, size, lineH } = fitTitle(pdf, segments, area, card.type === "display" ? 22 : 32);
        pdf.setFontSize(size);
        const centerY = qrHere ? y + 4 + area.h / 2 : y + CARD_H / 2;
        let ty = centerY - (lines.length * lineH) / 2 + lineH * 0.75;
        for (const line of lines) {
            pdf.text(line, x + CARD_W / 2, ty, { align: "center" });
            ty += lineH;
        }
        if (qrHere) qrCode(pdf, cardUrl(card, publicUrl), ink, x + CARD_W / 2 - QR_FRONT / 2, y + CARD_H * 0.76 - QR_FRONT / 2, QR_FRONT);
    };

    const back = (card, x, y) => {
        const { fill, ink, frame } = look(card);
        background(pdf, x, y, fill, frame);
        if (hasQR(card)) qrCode(pdf, cardUrl(card, publicUrl), ink, x + CARD_W / 2 - QR_BACK / 2, y + CARD_H / 2 - QR_BACK / 2, QR_BACK);
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

    pdf.save((document.title || "cards").toLowerCase().replace(/[^a-z0-9]+/g, "") + ".pdf");
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

// Transparent PNG, so the card color shows through; drawn in the card's ink.
function qrCode(pdf, url, ink, x, y, size) {
    const canvas = document.createElement("canvas");
    new QRious({ element: canvas, value: url, size: size * 8, padding: 8, background: "white", backgroundAlpha: 0, foreground: ink });
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, y, size, size);
}

// Honor the authors' "/" breaks, wrap each segment to the width, and shrink the
// font until the whole block fits the area (no word may overflow the width).
function fitTitle(pdf, segments, area, maxSize) {
    for (let size = maxSize; size >= 9; size -= 0.5) {
        pdf.setFontSize(size);
        const lineH = size * 0.3528 * 1.22; // pt -> mm, 1.22 leading
        const lines = segments.flatMap(s => pdf.splitTextToSize(s, area.w));
        const widest = Math.max(...lines.map(l => pdf.getTextWidth(l)));
        if (widest <= area.w && lines.length * lineH <= area.h) return { lines, size, lineH };
    }
    pdf.setFontSize(8);
    return { lines: segments.flatMap(s => pdf.splitTextToSize(s, area.w)), size: 8, lineH: 8 * 0.3528 * 1.22 };
}

function blobToBase64(blob) {
    return new Promise(resolve => {
        const r = new FileReader();
        r.onloadend = () => resolve(String(r.result).split(",")[1]);
        r.readAsDataURL(blob);
    });
}
