// Card Simulator: the card table.
// Desktop / tablet: arrange the cards on a table. Phone: a scrolling list.
// Click a card to flip it: the back shows its questions, "inspire me" (a random
// link), "more" (all links, numbered) and previous / next. The PDF panel opens
// and closes the same way, out of the "pdf" button.

import { loadDeck, loadCardset, normalize } from "./data.js";
import { generatePDF } from "./pdf.js";
import { gradeCategories, edgeFor } from "./color.js";

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const wait = ms => new Promise(r => setTimeout(r, ms));

const RATIO = 88 / 63;   // card shape, same as the printed cards (63 x 88 mm)
const TILT = 0.045;      // radians: cards lying under others in a pile are slightly turned
const FLIP_MS = 700;     // keep in sync with --flip in styles.css
const GAP = 1.18;        // horizontal distance between stacks, in card widths
const VGAP = 1.1;        // vertical distance between stacks, in card heights
const PHONE = matchMedia("(max-width: 600px)");

const app = $("#app");
const board = $("#board");
const flip = $("#flip");
const veil = $("#veil");

// The PDF panel uses the same flip as the cards.
const PDF_PANEL = { isPanel: true };

const state = {
    deck: null,
    cardset: {},
    cards: [],
    enabled: new Set(),
    topics: new Set(),      // categories that question / task cards are tagged with
    layout: "stacks",       // stacks | pile | random5
    sort: "natural",        // natural | az | shuffled
    five: [],               // the cards picked by "random 5"
    list: false,            // phone: scrolling list instead of the table
    open: null,             // the card (or PDF_PANEL) that is flipped open
    size: 150,              // card width; height is size * RATIO
    cols: 6,
    z: 10,
    dirty: false,
    pdf: { qr: "front", bw: false, a4: false },
};

const cardH = () => state.size * RATIO;
const label = card => card.title || card.text;
const byLabel = (a, b) => label(a).localeCompare(label(b), undefined, { sensitivity: "base", numeric: true });
const isCard = t => t && !t.isPanel;

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

init().catch(err => {
    console.error(err);
    board.innerHTML = `<p class="empty">could not load the cards<br><small>${esc(err.message)}</small></p>`;
});

async function init() {
    const [deck, cardset] = await Promise.all([loadDeck(), loadCardset()]);
    state.deck = deck;
    state.cardset = cardset;
    state.cards = deck.cards;
    const grading = (cardset.grading || "").toLowerCase();
    gradeCategories(deck.categories, { mode: /^(off|none|false|no)$/.test(grading) ? "off" : grading === "calm" ? "calm" : "guard" });
    deck.categories.forEach(c => state.enabled.add(c.id));
    const questionCats = new Set(deck.cards.filter(c => c.type === "display").map(c => c.catId));
    deck.cards.forEach(c => c.tags.forEach(t => { if (!questionCats.has(t)) state.topics.add(t); }));

    applyCardset(cardset);
    buildCategories();
    buildBoard();
    bindUi();
    setMode(PHONE.matches, { initial: true });
    try { await document.fonts.load('300 20px "CardSim Helvetica"'); } catch { /* fallback font */ }
    fitTitles();
    applyVisibility();
    layout(state.layout, { instant: true });

    const params = new URLSearchParams(location.search);
    const matched = params.get("card") ? findCards(params.get("card")) : [];
    if (matched.length) {
        if (!state.list) spotlight(matched);
        if (matched.length === 1 || params.get("open") === "true") {
            setTimeout(() => openFlip(matched[0], { updateUrl: false }), 250);
        }
    } else if (!state.list) {
        deal();
    }
}

// Title, description and repository link from cards/cardset.xml.
function applyCardset({ title, description, repo }) {
    if (title) document.title = title;
    $("#cardsetTitle").textContent = document.title.toLowerCase();
    if (repo) $("#repoLink").href = repo;
    if (description) {
        let meta = $('meta[name="description"]');
        if (!meta) document.head.appendChild(meta = Object.assign(document.createElement("meta"), { name: "description" }));
        meta.content = description;
    }
}

function findCards(param) {
    const wanted = param.split(",").map(normalize).filter(Boolean);
    return state.cards.filter(c =>
        wanted.includes(normalize(c.slug)) ||
        wanted.includes(normalize(c.rawTitle)) ||
        wanted.includes(normalize(c.titleLines[0])));
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

function buildCategories() {
    const nav = $("#cats");
    nav.innerHTML = state.deck.categories.map(cat => `
        <button class="cat" type="button" data-cat="${cat.id}" data-row="${cat.row}" aria-pressed="true" style="--c:${cat.tone};--edge:${edgeFor(cat.tone)}">
            <i aria-hidden="true"></i>${esc(cat.title)}
        </button>`).join("");

    nav.addEventListener("click", e => {
        const btn = e.target.closest(".cat");
        if (!btn) return;
        const id = +btn.dataset.cat;
        state.enabled.has(id) ? state.enabled.delete(id) : state.enabled.add(id);
        onCategoriesChange();
    });
    // double-click: only this category (double-click again: all)
    nav.addEventListener("dblclick", e => {
        const btn = e.target.closest(".cat");
        if (!btn) return;
        const id = +btn.dataset.cat;
        const solo = state.enabled.size === 1 && state.enabled.has(id);
        state.enabled = solo ? new Set(state.deck.categories.map(c => c.id)) : new Set([id]);
        onCategoriesChange();
    });
}

function onCategoriesChange() {
    $$("#cats .cat").forEach(b => b.setAttribute("aria-pressed", String(state.enabled.has(+b.dataset.cat))));
    applyVisibility();
    if (state.layout === "random5" && state.five.some(c => !isVisible(c))) layout("random5");
    else if (state.list) layoutList();
    else straightenTops();
}

// A card shows when its own category is on. Question / task cards also need
// one of their topics (e.g. "Art") to be on, as long as any topic is on.
function isVisible(card) {
    if (!state.enabled.has(card.catId)) return false;
    if (!card.tags.length) return true;
    const topicsOn = [...state.enabled].some(id => state.topics.has(id));
    return !topicsOn || card.tags.some(t => state.enabled.has(t));
}

function applyVisibility() {
    let shown = 0;
    for (const card of state.cards) {
        const vis = isVisible(card);
        card.el.hidden = !vis;
        if (vis) shown++;
    }
    $("#boardEmpty").hidden = shown > 0;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

const titleHTML = card => card.type === "display"
    ? `<span>${esc(card.text)}</span>`
    : card.titleLines.map(l => `<span>${esc(l)}</span>`).join("");

// Question / task cards: black with a colored border (category "onlyBorder").
const isOutline = card => card.type === "display" || card.category.onlyBorder;
const tagCats = card => card.tags.map(t => state.deck.categories[t]).filter(Boolean);
const tagDots = card => tagCats(card).length
    ? `<span class="tags" aria-hidden="true">${tagCats(card).map(c => `<i style="--t:${c.tone}"></i>`).join("")}</span>` : "";

// The colors a card face needs (graded, see color.js). Text is always pure white.
function paintColors(el, card) {
    const plain = isOutline(card) || card.category.isCover;
    el.style.setProperty("--c", card.category.tone);
    el.style.setProperty("--back", plain ? "#0b0b0b" : card.category.deep);
    el.style.setProperty("--edge", edgeFor(card.category.tone));
}

function buildBoard() {
    const frag = document.createDocumentFragment();
    for (const card of state.cards) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "card" + (card.category.isCover ? " cover" : "") + (isOutline(card) ? " outline" : "");
        paintColors(el, card);
        el.innerHTML = `<span class="card-title">${titleHTML(card)}</span>${tagDots(card)}`;
        if (card.tags.length) el.classList.add("has-tags");
        el.setAttribute("aria-label", `${label(card)} (${card.category.title})`);
        card.el = el;
        card.titleEl = $(".card-title", el);
        card.r = 0;
        card.tilt = rand(-TILT, TILT);
        card.x = card.y = card.fx = card.fy = 0;
        card.jx = rand(-4, 4); card.jy = rand(-4, 4);
        bindCardPointer(card);
        frag.appendChild(el);
    }
    board.appendChild(frag);

    // phone + "random 5": the rest of the deck, tap to deal five new cards
    const deckTile = document.createElement("button");
    deckTile.type = "button";
    deckTile.className = "deck-tile";
    deckTile.id = "deckTile";
    deckTile.hidden = true;
    deckTile.addEventListener("click", () => layout("random5"));
    board.appendChild(deckTile);

    const measure = document.createElement("div");
    measure.className = "measure";
    board.appendChild(measure);

    new ResizeObserver(onResize).observe(board);
}

// The category rows from the XML; rows longer than `cols` wrap onto new rows.
function stackRows(cols) {
    const rows = [];
    state.deck.categories.forEach(cat => (rows[cat.row] ||= []).push(cat.id));
    return rows.filter(Boolean).flatMap(row => {
        const out = [];
        for (let i = 0; i < row.length; i += cols) out.push(row.slice(i, i + cols));
        return out;
    });
}

// Card size: on the table, the largest at which all stacks fit; on a phone,
// two columns across the screen. Whole pixels keep the text sharp.
function measureSize() {
    const W = board.clientWidth, H = board.clientHeight;
    if (!W || !H) return false;
    let size, cols = 1;
    if (state.list) {
        size = Math.floor((W - 2 * 16 - 14) / 2);
    } else {
        size = 56;
        for (let S = 150; S >= 56; S -= 2) {
            const h = S * RATIO;
            const c = Math.max(1, Math.floor((W - 16 + S * (GAP - 1)) / (S * GAP)));
            const rows = stackRows(c);
            const needW = Math.max(...rows.map(r => r.length)) * S * GAP - S * (GAP - 1) + 16;
            const needH = rows.length * h * VGAP - h * (VGAP - 1) + 16;
            if (needW <= W && needH <= H) { size = S; cols = c; break; }
        }
    }
    const changed = size !== state.size;
    state.size = size;
    state.cols = cols;
    board.style.setProperty("--card", size + "px");
    board.style.setProperty("--card-h", Math.round(size * RATIO) + "px");
    return changed;
}

// Line division for titles: keep the author's "/" breaks, balance each part,
// and use the largest font size at which no line and no single word overflows.
function fitTitles() {
    const S = state.size;
    const pad = Math.round(S * 0.09);
    const innerW = S - 2 * pad - 2;
    const innerH0 = Math.round(cardH()) - 2 * pad - 2;
    const measure = $(".measure", board);
    measure.style.width = innerW + "px";

    for (const card of state.cards) {
        const innerH = card.tags.length ? innerH0 - S * 0.14 : innerH0;
        const long = card.type === "display";
        const minF = long ? Math.max(9, S * 0.07) : Math.max(11, S * 0.08);
        measure.innerHTML = card.titleEl.innerHTML;
        let lo = minF, hi = long ? S * 0.115 : S * 0.17, best = lo;
        for (let i = 0; i < 8; i++) {
            const mid = (lo + hi) / 2;
            measure.style.fontSize = mid + "px";
            if (measure.scrollHeight <= innerH && measure.scrollWidth <= innerW + 0.5) { best = mid; lo = mid; }
            else hi = mid;
        }
        measure.style.fontSize = best + "px";
        const tooTight = measure.scrollWidth > innerW + 0.5 || measure.scrollHeight > innerH;
        card.font = Math.floor(best * 2) / 2; // half pixels: still sharp, still fits
        card.titleEl.style.fontSize = card.font + "px";
        card.titleEl.style.overflowWrap = tooTight ? "anywhere" : "";
    }
    measure.innerHTML = "";
}

// Table (desktop / tablet) or list (phone).
function setMode(list, { initial = false } = {}) {
    if (!initial && list === state.list) return;
    state.list = list;
    app.classList.toggle("is-list", list);
    board.classList.toggle("list", list);
    if (list && state.layout === "pile") state.layout = "stacks";
    measureSize();
    if (!initial) {
        fitTitles();
        layout(state.layout, { instant: true, keepJitter: true });
    }
}

function onResize() {
    if (!board.clientWidth || !board.clientHeight || !state.cards.length) return;
    if (state.open) sizeFlip();
    if (PHONE.matches !== state.list) return setMode(PHONE.matches);
    if (measureSize()) fitTitles();
    if (state.list) return;
    if (!state.dirty) {
        layout(state.layout, { instant: true, keepJitter: true });
    } else {
        const a = area();
        state.cards.forEach(c => setPos(c, clamp(c.fx * board.clientWidth, a.l, a.r), clamp(c.fy * board.clientHeight, a.t, a.b)));
    }
}

// Bounds for card centers on the table.
function area() {
    const W = board.clientWidth, H = board.clientHeight, S = state.size, h = cardH(), pad = 8;
    const a = { l: pad + S / 2, r: W - pad - S / 2, t: pad + h / 2, b: H - pad - h / 2 };
    if (a.r < a.l) a.l = a.r = W / 2;
    if (a.b < a.t) a.t = a.b = H / 2;
    a.cx = (a.l + a.r) / 2; a.cy = (a.t + a.b) / 2;
    a.w = a.r - a.l; a.h = a.b - a.t;
    return a;
}

function setPos(card, x, y) {
    card.x = x; card.y = y;
    card.fx = x / board.clientWidth;
    card.fy = y / board.clientHeight;
    paint(card);
}

// Whole-pixel positions: fractional ones blur the text.
function paint(card) {
    card.el.style.setProperty("--x", Math.round(card.x - state.size / 2) + "px");
    card.el.style.setProperty("--y", Math.round(card.y - cardH() / 2) + "px");
    card.el.style.setProperty("--r", card.r.toFixed(4) + "rad");
}

const toFront = card => { card.el.style.zIndex = ++state.z; };
const zOf = card => +card.el.style.zIndex || 0;

// Every card you can read lies straight (sharp text); only cards mostly
// covered by others keep a slight turn, so piles still look like piles.
function straightenTops() {
    if (state.list) return;
    const S = state.size, h = cardH();
    const shown = state.cards.filter(c => !c.el.hidden).sort((a, b) => zOf(b) - zOf(a));
    shown.forEach((card, i) => {
        let covered = false;
        for (let j = 0; j < i && !covered; j++) {
            const o = shown[j];
            const ox = Math.max(0, S - Math.abs(o.x - card.x)), oy = Math.max(0, h - Math.abs(o.y - card.y));
            covered = ox * oy > S * h * 0.55;
        }
        const r = covered ? card.tilt : 0;
        if (r !== card.r) { card.r = r; paint(card); }
    });
}

// ---------------------------------------------------------------------------
// Layouts
// ---------------------------------------------------------------------------

// Order in which cards are put down: the last one lands on top of its pile.
function dealOrder() {
    if (state.sort === "az") return [...state.cards].sort(byLabel).reverse();
    return state.cards;
}

function pickFive() {
    const pool = shuffleArray(state.cards.filter(c => isVisible(c) && !c.category.isCover));
    state.five = pool.slice(0, 5);
}

function layout(kind, { instant = false, keepJitter = false } = {}) {
    stopAllMomentum();
    state.layout = kind;
    state.dirty = false;
    $$("#layouts [data-layout]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.layout === kind)));
    $("#sortBtn").setAttribute("aria-pressed", String(state.sort === "az"));

    if (!keepJitter) {
        if (state.sort !== "az") shuffleArray(state.cards);
        state.cards.forEach(c => {
            c.jx = rand(-4, 4); c.jy = rand(-4, 4);
            c.tilt = rand(-TILT, TILT);
        });
        if (kind === "random5") pickFive();
    }
    if (kind === "random5" && !state.five.length) pickFive();

    if (state.list) return layoutList();

    const a = area(), S = state.size, h = cardH();
    let order = 0;
    const place = (card, x, y) => {
        card.r = card.tilt;
        setPos(card, clamp(x, a.l - 6, a.r + 6), clamp(y, a.t - 12, a.b + 6));
        card.el.style.zIndex = ++state.z;
        if (!instant) card.el.style.setProperty("--delay", Math.min(order++ * 6, 360) + "ms");
    };
    const cards = dealOrder();

    if (kind === "stacks") {
        const rows = stackRows(state.cols);
        const R = rows.length, C = Math.max(...rows.map(r => r.length));
        const dx = C > 1 ? Math.min(S * 1.25, a.w / (C - 1)) : 0;
        const dy = R > 1 ? Math.min(h * 1.12, a.h / (R - 1)) : 0;
        const centers = {};
        rows.forEach((row, ri) => row.forEach((catId, ci) => {
            centers[catId] = { x: a.cx + (ci - (row.length - 1) / 2) * dx, y: a.cy + (ri - (R - 1) / 2) * dy };
        }));
        const depth = {};
        cards.forEach(card => {
            const k = depth[card.catId] = (depth[card.catId] ?? -1) + 1;
            const c = centers[card.catId];
            const d = Math.min(k, 14); // big decks: keep the pile tidy
            place(card, c.x + card.jx + d * 0.3, c.y + card.jy - d * 0.5);
        });
    } else if (kind === "pile") {
        cards.forEach((card, k) => place(card, a.cx + card.jx * 1.5 + Math.min(k, 30) * 0.15, a.cy + card.jy * 1.5 - Math.min(k, 30) * 0.3));
    } else {
        // random 5: the rest of the deck as one pile in the middle, five cards around it
        const rest = cards.filter(c => !state.five.includes(c));
        rest.forEach((card, k) => place(card, a.cx + card.jx + Math.min(k, 20) * 0.2, a.cy + card.jy - Math.min(k, 20) * 0.35));
        const rx = Math.min(a.w / 2, S * 2.2), ry = Math.min(a.h / 2, h * 1.2);
        state.five.forEach((card, i) => {
            const ang = -Math.PI / 2 + i * (2 * Math.PI / 5);
            place(card, a.cx + Math.cos(ang) * rx, a.cy + Math.sin(ang) * ry);
        });
    }
    straightenTops();
    if (!instant) animate();
}

// Phone: cards in a scrolling grid. "random 5" shows five cards and the deck.
function layoutList() {
    let ordered;
    if (state.layout === "random5") ordered = state.five.filter(isVisible);
    else if (state.sort === "az") ordered = [...state.cards].sort(byLabel);
    else if (state.sort === "shuffled") ordered = state.cards;
    else ordered = [...state.cards].sort((a, b) => a.catId - b.catId || a.index - b.index);

    const shown = new Set(ordered);
    state.cards.forEach(c => c.el.classList.toggle("off", !shown.has(c)));
    ordered.forEach((c, i) => { c.el.style.order = i; });

    const deckTile = $("#deckTile");
    const rest = state.cards.filter(c => isVisible(c) && !shown.has(c)).length;
    deckTile.hidden = state.layout !== "random5";
    deckTile.style.order = ordered.length;
    deckTile.innerHTML = `<span>${rest} more</span><b>deal 5 new</b>`;
}

let animTimer;
function animate() {
    board.classList.add("dealing");
    clearTimeout(animTimer);
    animTimer = setTimeout(() => board.classList.remove("dealing"), 1000);
}

// Intro: the cards slide out of one pile into the layout.
function deal() {
    const a = area();
    const targets = state.cards.map(c => [c, c.x, c.y]);
    targets.forEach(([c]) => { c.x = a.cx; c.y = a.cy; paint(c); });
    board.offsetWidth;
    targets.forEach(([c, x, y], i) => { c.el.style.setProperty("--delay", Math.min(i * 8, 600) + "ms"); setPos(c, x, y); });
    animate();
}

// Requested cards in the middle, everything else scattered around them.
function spotlight(selected) {
    const a = area(), S = state.size, h = cardH();
    const cols = Math.max(1, Math.min(selected.length, Math.floor((a.w + S) / (S * 1.15))));
    const rows = Math.ceil(selected.length / cols);
    const gapW = cols * S * 1.15 + S * 0.6, gapH = rows * h * 1.1 + h * 0.4;
    for (const card of state.cards) {
        if (selected.includes(card)) continue;
        let x, y, tries = 0;
        do { x = rand(a.l, a.r); y = rand(a.t, a.b); }
        while (++tries < 40 && Math.abs(x - a.cx) < gapW / 2 && Math.abs(y - a.cy) < gapH / 2);
        setPos(card, x, y);
    }
    selected.forEach((card, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const inRow = Math.min(cols, selected.length - row * cols);
        setPos(card, a.cx + (col - (inRow - 1) / 2) * S * 1.15, a.cy + (row - (rows - 1) / 2) * h * 1.1);
        toFront(card);
    });
    straightenTops();
    state.dirty = true;
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ---------------------------------------------------------------------------
// Picking up, moving and putting down cards (table only)
// ---------------------------------------------------------------------------

function bindCardPointer(card) {
    const el = card.el;
    let drag = null;

    el.addEventListener("pointerdown", e => {
        if (state.list || e.button !== 0 || drag) return;
        stopMomentum(card);
        const b = board.getBoundingClientRect();
        drag = {
            id: e.pointerId, b, moved: false,
            sx: e.clientX, sy: e.clientY,
            ox: card.x - (e.clientX - b.left), oy: card.y - (e.clientY - b.top),
            samples: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }],
        };
        el.setPointerCapture(e.pointerId);
        toFront(card);
        // picked up: straight, a little larger, higher shadow
        card.r = 0;
        paint(card);
        el.classList.add("held");
    });

    el.addEventListener("pointermove", e => {
        if (!drag || e.pointerId !== drag.id) return;
        if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
        if (!drag.moved) {
            drag.moved = true;
            board.classList.remove("dealing");
            el.classList.add("dragging");
        }
        const S = state.size, W = board.clientWidth, H = board.clientHeight;
        setPos(card,
            clamp(e.clientX - drag.b.left + drag.ox, S * 0.2, W - S * 0.2),
            clamp(e.clientY - drag.b.top + drag.oy, S * 0.2, H - S * 0.2));
        drag.samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
        if (drag.samples.length > 6) drag.samples.shift();
    });

    const end = (e, cancelled) => {
        if (!drag || e.pointerId !== drag.id) return;
        const d = drag;
        drag = null;
        el.classList.remove("held", "dragging");
        if (!d.moved) {
            if (!cancelled) openFlip(card);
            return;
        }
        state.dirty = true;
        const first = d.samples.find(s => e.timeStamp - s.t < 90) || d.samples[0];
        const dt = Math.max(1, e.timeStamp - first.t);
        const vx = (e.clientX - first.x) / dt, vy = (e.clientY - first.y) / dt;
        if (!cancelled && Math.hypot(vx, vy) > 0.5) glide(card, vx, vy);
        else straightenTops();
    };
    el.addEventListener("pointerup", e => end(e, false));
    el.addEventListener("pointercancel", e => end(e, true));
    // keyboard (Enter / Space) and taps in the phone list
    el.addEventListener("click", e => { if (e.detail === 0 || state.list) openFlip(card); });
}

// A released card keeps a little momentum and comes to rest.
function glide(card, vx, vy) {
    let last = performance.now();
    const step = now => {
        const dt = Math.min(32, now - last);
        last = now;
        const a = area();
        let x = card.x + vx * dt, y = card.y + vy * dt;
        if (x < a.l || x > a.r) { vx = -vx * 0.4; x = clamp(x, a.l, a.r); }
        if (y < a.t || y > a.b) { vy = -vy * 0.4; y = clamp(y, a.t, a.b); }
        const f = Math.pow(0.99, dt);
        vx *= f; vy *= f;
        setPos(card, x, y);
        if (Math.hypot(vx, vy) > 0.02) card.anim = requestAnimationFrame(step);
        else { card.anim = null; straightenTops(); }
    };
    card.anim = requestAnimationFrame(step);
}

function stopMomentum(card) { if (card.anim) cancelAnimationFrame(card.anim); card.anim = null; }
function stopAllMomentum() { state.cards.forEach(stopMomentum); }

// ---------------------------------------------------------------------------
// The flip: an opened card, or the PDF panel
// ---------------------------------------------------------------------------

// Prompts are questions: each one ends with a "?". Task cards
// ("Write an elevator pitch") are instructions, so they stay as written.
const asQuestion = q => /[?？]$/.test(q) ? q : q.replace(/[\s.!:;,…]+$/, "") + "?";
function promptItems(card) {
    if (card.type === "display") {
        const question = /[?？]$/.test(card.text);
        return [{ text: card.text, question }];
    }
    return card.questions.map(q => ({ text: asQuestion(q), question: true }));
}

function backHTML(card) {
    const prompts = promptItems(card);
    const n = card.links.length;
    const links = card.links.map((l, i) => `
        <li>
            <a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" title="${esc(l.url)}">
                <span class="link-num">${i + 1}</span>
                <span class="link-label">${esc(l.label || l.guess)}</span>
                <span class="link-host">${esc(l.host)}</span>
            </a>
        </li>`).join("");
    const order = browseOrder();
    const pos = order.indexOf(card);
    return `
        <div class="back-scroll" id="backScroll">
            <div class="back-head">
                <span>${esc(card.category.title)}</span>
                <button type="button" data-act="close">close</button>
            </div>
            ${card.title ? `<h2 class="back-title" id="flipTitle">${esc(card.title)}</h2>` : ""}
            <ul class="prompts"${card.title ? "" : ` id="flipTitle"`}>${prompts.map((p, i) =>
                `<li style="--i:${i}">${esc(p.text)}</li>`).join("")}</ul>
            ${tagCats(card).length ? `
            <p class="related"><span>related</span>${tagCats(card).map(c =>
                `<span class="related-cat" style="--t:${c.tone}"><i aria-hidden="true"></i>${esc(c.title)}</span>`).join("")}</p>` : ""}
            ${n ? `
            <div class="back-actions">
                <button class="text-action" type="button" data-act="inspire">inspire me</button>
                <button class="text-action" type="button" data-act="more" aria-expanded="false" aria-controls="flipLinks">more</button>
            </div>
            <ol class="links" id="flipLinks" hidden>${links}</ol>` : ""}
        </div>
        ${order.length > 1 ? `
        <nav class="back-nav" aria-label="Cards">
            <button type="button" data-act="prev"><span aria-hidden="true">‹</span> previous</button>
            <span class="back-pos">${pos + 1} / ${order.length}</span>
            <button type="button" data-act="next">next <span aria-hidden="true">›</span></button>
        </nav>` : ""}`;
}

function pdfBackHTML() {
    const cards = pdfCards();
    const o = state.pdf;
    const radio = (v, text) => `<label><input type="radio" name="qr" value="${v}"${o.qr === v ? " checked" : ""}> ${text}</label>`;
    return `
        <div class="back-scroll" id="backScroll">
            <div class="back-head">
                <span>pdf</span>
                <button type="button" data-act="close">close</button>
            </div>
            <h2 class="back-title" id="flipTitle">print &amp; play</h2>
            <p class="panel-note">A PDF of the ${cards.length} cards in the selected categories.</p>
            <fieldset class="opts">
                <legend>QR code</legend>
                ${radio("none", "no QR code")}
                ${radio("front", "QR on the front")}
                ${radio("back", "QR on the back")}
            </fieldset>
            <fieldset class="opts">
                <legend>print</legend>
                <label><input type="checkbox" name="bw"${o.bw ? " checked" : ""}> black &amp; white</label>
                <label><input type="checkbox" name="a4"${o.a4 ? " checked" : ""}> A4 sheets (9 cards per page)</label>
            </fieldset>
            <p class="panel-note small">Otherwise one 63 × 88 mm card per page.${cards.some(c => c.type === "display") ? " Question and task cards never get a QR code." : ""}</p>
            <div class="back-actions">
                <button class="text-action" type="button" data-act="generate">generate pdf</button>
            </div>
        </div>`;
}

// Open one of the card's links, picked at random.
function inspire(card) {
    if (!card?.links.length) return;
    const link = card.links[Math.floor(Math.random() * card.links.length)];
    window.open(link.url, "_blank", "noopener");
}

// Show / hide the card's numbered link list.
function toggleLinks(btn) {
    const list = $("#flipLinks");
    const show = list.hidden;
    list.hidden = !show;
    btn.setAttribute("aria-expanded", String(show));
    btn.textContent = show ? "less" : "more";
    if (show) list.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// The opened card: card shaped, as large as fits; full screen on phones.
// Whole pixels, so the text is sharp.
function sizeFlip() {
    let w, h;
    if (PHONE.matches) { w = innerWidth; h = innerHeight; }
    else {
        w = Math.round(Math.min(500, innerWidth - 32, (innerHeight - 40) / RATIO));
        h = Math.round(w * RATIO);
    }
    Object.assign(flip.style, {
        width: w + "px", height: h + "px",
        left: Math.round((innerWidth - w) / 2) + "px", top: Math.round((innerHeight - h) / 2) + "px",
    });
    flip.style.setProperty("--fw", w + "px");
}

// Where the flip comes from: the card on the table / in the list, or the
// "pdf" button for the PDF panel.
function sourceRect(target) {
    if (target.isPanel) {
        const r = $("#pdfBtn").getBoundingClientRect(), w = 44;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 - w * RATIO / 2, w, h: w * RATIO, r: 0 };
    }
    const card = target;
    if (card.el.hidden || card.el.classList.contains("off")) {
        return { x: innerWidth / 2, y: innerHeight / 2 + 40, w: state.size, h: cardH(), r: 0 };
    }
    if (state.list) {
        const r = card.el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, r: 0 };
    }
    const b = board.getBoundingClientRect();
    return { x: b.left + card.x, y: b.top + card.y, w: state.size, h: cardH(), r: card.r };
}

// The flip as a transform back to where it comes from.
function sourceTransform(target) {
    const c = sourceRect(target);
    const fw = flip.offsetWidth, fh = flip.offsetHeight;
    const cx = parseFloat(flip.style.left) + fw / 2, cy = parseFloat(flip.style.top) + fh / 2;
    return `translate(${(c.x - cx).toFixed(1)}px, ${(c.y - cy).toFixed(1)}px) rotate(${c.r.toFixed(4)}rad) scale(${(c.w / fw).toFixed(4)}, ${(c.h / fh).toFixed(4)})`;
}

// When the opened card has another shape than its source (phone: full screen),
// stretch the front title the other way so it keeps its proportions while it turns.
const frontTitle = () => $("#flipFront .card-title");
function frontCounterScale(target) {
    const c = sourceRect(target);
    return `scaleY(${((c.w / flip.offsetWidth) / (c.h / flip.offsetHeight)).toFixed(4)})`;
}

function fillFlip(target) {
    flip.classList.toggle("panel", !!target.isPanel);
    if (target.isPanel) {
        flip.style.setProperty("--c", "#0b0b0b");
        flip.style.setProperty("--back", "#0b0b0b");
        flip.style.setProperty("--edge", "rgba(255,255,255,0.2)");
        flip.classList.add("cover");
        flip.classList.remove("outline");
        $("#flipBack").innerHTML = pdfBackHTML();
        $("#flipFront").innerHTML = `<span class="card-title" style="font-size:${Math.round(flip.offsetWidth * 0.11)}px"><span>print &amp;</span><span>play</span></span>`;
        return;
    }
    const card = target;
    paintColors(flip, card);
    flip.classList.toggle("cover", card.category.isCover);
    flip.classList.toggle("outline", isOutline(card));
    $("#flipBack").innerHTML = backHTML(card);
    const scale = flip.offsetWidth / sourceRect(card).w;
    $("#flipFront").innerHTML = `<span class="card-title" style="font-size:${((card.font || 16) * scale).toFixed(1)}px">${titleHTML(card)}</span>${tagDots(card)}`;
}

function setUrl(card) {
    history.replaceState(null, "", card ? `?card=${encodeURIComponent(card.slug)}` : location.pathname);
}

let settleTimer;
function openFlip(target, { updateUrl = true } = {}) {
    if (state.open) return;
    state.open = target;
    if (isCard(target)) stopMomentum(target);

    flip.hidden = false;
    veil.hidden = false;
    flip.classList.remove("animating", "open", "flat");
    sizeFlip();
    fillFlip(target);

    flip.style.transform = sourceTransform(target);
    frontTitle().style.transform = frontCounterScale(target);
    if (isCard(target)) target.el.classList.add("lifted");
    flip.offsetWidth; // commit the start position

    flip.classList.add("animating", "open");
    flip.style.transform = "";
    frontTitle().style.transform = "";
    veil.classList.add("on");
    document.body.classList.add("card-open");

    // Once it has turned, drop the 3D: a flat card renders its text sharply.
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
        if (state.open !== target || flip.classList.contains("closing")) return;
        flip.classList.remove("animating");
        flip.classList.add("flat");
        ($("[data-act=inspire]", flip) || $("[data-act=generate]", flip) || $("[data-act=close]", flip))?.focus({ preventScroll: true });
    }, FLIP_MS);

    if (updateUrl && isCard(target)) setUrl(target);
}

function closeFlip() {
    const target = state.open;
    if (!target || flip.classList.contains("closing")) return;
    clearTimeout(settleTimer);
    if (isCard(target) && state.list) target.el.scrollIntoView({ block: "nearest" });
    flip.classList.remove("flat");
    flip.offsetWidth; // back to 3D before turning
    flip.classList.add("animating", "closing");
    flip.classList.remove("open");
    flip.style.transform = sourceTransform(target);
    frontTitle().style.transform = frontCounterScale(target);
    veil.classList.remove("on");
    document.body.classList.remove("card-open");
    setTimeout(() => {
        flip.hidden = true;
        veil.hidden = true;
        flip.classList.remove("animating", "closing", "panel");
        flip.style.transform = "";
        state.open = null;
        if (isCard(target)) { target.el.classList.remove("lifted"); target.el.focus({ preventScroll: true }); }
        else $("#pdfBtn").focus({ preventScroll: true });
    }, FLIP_MS);
    if (isCard(target)) setUrl(null);
}

// Cards in the order they are shown, for previous / next.
function browseOrder() {
    if (state.list) {
        return state.cards.filter(c => isVisible(c) && !c.el.classList.contains("off"))
            .sort((a, b) => (+a.el.style.order || 0) - (+b.el.style.order || 0));
    }
    const cards = state.cards.filter(isVisible);
    return state.sort === "az" ? cards.sort(byLabel) : cards.sort((a, b) => a.index - b.index);
}

// Next / previous card while one is open (buttons, swipe, or the arrow keys).
// The card itself stays: only its content slides out and the next card's
// content slides in. The color only changes (as a smooth blend, see .face in
// styles.css) when the next card belongs to another category.
async function stepCard(dir) {
    const from = state.open;
    if (!isCard(from) || !flip.classList.contains("flat") || flip.classList.contains("stepping")) return;
    const order = browseOrder();
    if (order.length < 2) return;
    const i = order.indexOf(from);
    const to = order[(i + dir + order.length) % order.length];
    flip.classList.add("stepping");
    // never wait longer than the animation should take (paused animations in background tabs)
    const settle = (anim, ms) => Promise.race([anim.finished, wait(ms + 60)]).catch(() => {});
    const content = () => $("#backScroll");

    await settle(content().animate(
        [{ transform: "none", opacity: 1 }, { transform: `translateX(${-dir * 28}px)`, opacity: 0 }],
        { duration: 150, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" }), 150);

    from.el.classList.remove("lifted");
    to.el.classList.add("lifted");
    if (!state.list) toFront(to);
    state.open = to;
    fillFlip(to); // new colors blend in via the .face transition
    $$("#flipBack .prompts li, #flipBack .back-actions").forEach(el => el.style.transitionDelay = "0s");
    setUrl(to);

    await settle(content().animate(
        [{ transform: `translateX(${dir * 28}px)`, opacity: 0 }, { transform: "none", opacity: 1 }],
        { duration: 240, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }), 240);
    flip.classList.remove("stepping");
    $(`[data-act=${dir > 0 ? "next" : "prev"}]`, flip)?.focus({ preventScroll: true });
}

// Phone: swipe left / right for the next / previous card, down to close.
function bindSwipe() {
    let start = null;
    flip.addEventListener("touchstart", e => {
        if (e.touches.length !== 1 || !isCard(state.open)) return (start = null);
        const t = e.touches[0];
        start = { x: t.clientX, y: t.clientY, top: $("#backScroll")?.scrollTop || 0 };
    }, { passive: true });
    flip.addEventListener("touchend", e => {
        if (!start) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - start.x, dy = t.clientY - start.y;
        const fromTop = start.top <= 0;
        start = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.3) stepCard(dx < 0 ? 1 : -1);
        else if (dy > 90 && fromTop && Math.abs(dy) > Math.abs(dx) * 1.3) closeFlip();
    }, { passive: true });
}

// Pick a card from the shown categories (never the same one twice in a row)
// and flip it.
let lastRandom = null;
function randomCard() {
    if (state.open) return;
    const pool = state.cards.filter(c => isVisible(c) && !c.category.isCover && c !== lastRandom);
    const list = pool.length ? pool : state.cards.filter(isVisible);
    if (!list.length) return;
    const card = list[Math.floor(Math.random() * list.length)];
    lastRandom = card;
    if (!state.list) toFront(card);
    openFlip(card);
}

function toggleSort() {
    state.sort = state.sort === "az" ? "natural" : "az";
    layout(state.layout);
}

function shuffle() {
    state.sort = "shuffled";
    layout(state.layout);
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

function pdfCards() {
    return state.cards.filter(isVisible).sort((a, b) => a.index - b.index);
}

function readPdfOptions() {
    state.pdf = {
        qr: $("#flipBack input[name=qr]:checked")?.value || "front",
        bw: !!$("#flipBack input[name=bw]")?.checked,
        a4: !!$("#flipBack input[name=a4]")?.checked,
    };
}

async function makePdf(btn) {
    readPdfOptions();
    if (!window.jspdf || !window.QRious) return alert("The PDF tools could not be loaded. Check your connection.");
    btn.disabled = true;
    btn.textContent = "making pdf…";
    try {
        await generatePDF(pdfCards(), { ...state.pdf, publicUrl: state.cardset?.url });
        closeFlip();
    } catch (err) {
        console.error(err);
        alert("Could not create the PDF: " + err.message);
        btn.disabled = false;
        btn.textContent = "generate pdf";
    }
}

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------

function bindUi() {
    $$("#layouts [data-layout]").forEach(b => b.addEventListener("click", () => layout(b.dataset.layout)));
    $("#shuffleBtn").addEventListener("click", shuffle);
    $("#sortBtn").addEventListener("click", toggleSort);
    $("#randomBtn").addEventListener("click", randomCard);
    $("#pdfBtn").addEventListener("click", () => openFlip(PDF_PANEL));

    flip.addEventListener("click", e => {
        const btn = e.target.closest("[data-act]");
        const act = btn?.dataset.act;
        if (act === "close") closeFlip();
        if (act === "inspire") inspire(state.open);
        if (act === "more") toggleLinks(btn);
        if (act === "prev") stepCard(-1);
        if (act === "next") stepCard(1);
        if (act === "generate") makePdf(btn);
    });
    flip.addEventListener("change", () => { if (state.open?.isPanel) readPdfOptions(); });
    veil.addEventListener("click", closeFlip);
    bindSwipe();

    document.addEventListener("keydown", e => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === "Escape") return closeFlip();
        if (state.open) {
            if (!isCard(state.open)) return;
            if (e.key === "ArrowRight") stepCard(1);
            if (e.key === "ArrowLeft") stepCard(-1);
            return;
        }
        if (e.target.closest("input, textarea, select")) return;
        if (e.key === "1") layout("stacks");
        if (e.key === "2" && !state.list) layout("pile");
        if (e.key === "3") layout("random5");
        if (e.key === "s" || e.key === "S") shuffle();
        if (e.key === "a" || e.key === "A") toggleSort();
        if (e.key === "r" || e.key === "R") randomCard();
        if (e.key === "p" || e.key === "P") openFlip(PDF_PANEL);
    });
}
