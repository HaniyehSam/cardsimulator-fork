// Loads cards/cardCategories.xml and cards/cards.xml into plain objects.
// Parsed with DOMParser (not p5) so the XML comments next to <link> elements
// can be used as human-readable link labels.

export async function loadDeck(base = "cards/") {
    const [catXml, cardXml] = await Promise.all([
        fetchXml(base + "cardCategories.xml"),
        fetchXml(base + "cards.xml"),
    ]);

    const categories = [...catXml.getElementsByTagName("cardCategory")].map((el, id) => ({
        id,
        title: text(el.getElementsByTagName("title")[0]),
        color: "#" + (el.getAttribute("color") || "5C6E82"),
        row: parseInt(el.getAttribute("row") || "0", 10),
        onlyBorder: el.getAttribute("onlyBorder") === "true",
        isCover: /^0{6}$/.test(el.getAttribute("color") || ""), // the black "title" card
    }));

    const usedSlugs = new Set();
    const cards = [...cardXml.getElementsByTagName("card")].map((el, index) => {
        const type = el.getAttribute("type") || "link";
        const catId = parseInt(text(child(el, "cardCategoryId")) || "0", 10);
        const titleEl = child(el, "title");
        const rawTitle = text(titleEl) || (type === "display" ? "" : "Untitled");
        const lines = rawTitle.split("/").map(s => s.trim()).filter(Boolean);

        // question / task cards have no title: name them after their text
        const textSlug = normalize(text(child(el, "text"))).replace(/[^a-z0-9]/g, "").slice(0, 40);
        let slug = titleEl?.getAttribute("forcedFilename") || normalize(lines[0] || "") || textSlug || `card${index}`;
        if (usedSlugs.has(slug)) slug += "-" + index;
        usedSlugs.add(slug);

        return {
            index,
            type,
            catId,
            category: categories[catId] || categories[0],
            title: joinLines(lines),
            titleLines: lines,
            rawTitle,
            slug,
            text: text(child(el, "text")),
            questions: splitQuestions(text(child(el, "text"))),
            links: parseLinks(el),
            tags: [...el.getElementsByTagName("tag")].map(t => parseInt(text(t), 10)).filter(n => !isNaN(n)),
        };
    });

    return { categories, cards };
}

// cards/cardset.xml: optional metadata about the card set.
//   <cardset>
//     <title>Level Design Cards</title>
//     <repo>https://github.com/user/leveldesigncards</repo>
//     <url>https://user.github.io/leveldesigncards/</url>      (used by QR codes)
//     <description>...</description>
//   </cardset>
// Every field is optional, and a missing file is fine.
export async function loadCardset(base = "cards/") {
    try {
        const doc = await fetchXml(base + "cardset.xml");
        const field = name => text(doc.getElementsByTagName(name)[0]) || undefined;
        return { title: field("title"), repo: field("repo"), url: field("url"), description: field("description") };
    } catch {
        return {};
    }
}

async function fetchXml(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
    const doc = new DOMParser().parseFromString(await res.text(), "application/xml");
    const err = doc.querySelector("parsererror");
    if (err) throw new Error(`${url} is not valid XML: ${err.textContent.slice(0, 200)}`);
    return doc;
}

const child = (el, name) => [...el.children].find(c => c.tagName === name);
const text = el => (el?.textContent || "").trim();

// Same normalization the original simulator used for ?card= matching.
export const normalize = s => (s || "").toLowerCase().replace(/[\s/]+/g, "");

// "what is that? # examples? # ..." -> ["what is that?", "examples?", ...]
// Decks without "#" separate their topics with " / " instead.
export function splitQuestions(str) {
    const s = str || "";
    const parts = s.includes("#") ? s.split("#") : s.split(/\s\/\s/);
    return parts.map(p => p.replace(/\s+/g, " ").trim()).filter(Boolean);
}

// Title lines -> one line: "Entrepreneur-" + "ship" joins without a space.
function joinLines(lines) {
    return lines.reduce((out, line) => !out ? line : /\w-$/.test(out) ? out.slice(0, -1) + line : out + " " + line, "");
}

function parseLinks(cardEl) {
    const links = [];
    for (const node of cardEl.childNodes) {
        if (node.nodeType !== 1 || node.tagName !== "link") continue;
        const url = text(node);
        if (!url) continue;
        links.push({ url, label: commentLabel(node), ...describeUrl(url) });
    }
    return links;
}

// A comment on the same line right after a <link> describes it:
//   <link>https://youtu.be/x</link> <!-- GMTK: Level Design Playlist -->
// Commented-out links on their own line are ignored (newline before them).
function commentLabel(linkEl) {
    let n = linkEl.nextSibling;
    while (n && n.nodeType === 3) {
        if (n.textContent.includes("\n")) return null;
        n = n.nextSibling;
    }
    if (!n || n.nodeType !== 8) return null;
    const label = n.textContent.replace(/\s+/g, " ").trim();
    if (!label || /^link>/i.test(label) || /<\/?link/i.test(label)) return null;
    return label;
}

const KIND_RULES = [
    ["video", /youtube\.com|youtu\.be|vimeo\.com|twitch\.tv/],
    ["talk", /gdcvault\.com|slideshare\.net|prezi\.com|speakerdeck/],
    ["pdf", /\.pdf($|[?#])/i],
    ["wiki", /wikipedia\.org|wikiwand\.com|tvtropes\.org|fandom\.com/],
    ["book", /books\.google|goodreads\.com|amazon\.|transcript-verlag|gestalten\.com|mitpress/],
    ["social", /twitter\.com|x\.com\/|mastodon|bsky\.app|tumblr\.com/],
    ["archive", /web\.archive\.org/],
    ["game", /store\.steampowered|itch\.io|gog\.com/],
];

export function describeUrl(url) {
    let host = "", path = "", isLocal = false;
    try {
        const u = new URL(url, location.href);
        isLocal = !/^https?:/i.test(url);
        host = isLocal ? "local file" : u.hostname.replace(/^www\./, "");
        path = decodeURIComponent(u.pathname);
    } catch {
        host = url;
    }
    const kind = (KIND_RULES.find(([, re]) => re.test(url)) || ["article"])[0];
    return { host, kind, guess: guessTitle(url, host, path, kind, isLocal) };
}

// Turn ".../design/how-to-find-your-gameplay-themes" into "How to find your gameplay themes".
function guessTitle(url, host, path, kind, isLocal) {
    if (/youtube\.com|youtu\.be/.test(url)) return /list=/.test(url) && !/v=/.test(url) ? "YouTube playlist" : "YouTube video";
    if (/vimeo\.com/.test(url)) return "Vimeo video";

    // web.archive.org/web/2013.../http://site/path -> describe the archived page
    if (kind === "archive") {
        const m = url.match(/web\.archive\.org\/web\/\d+\*?\/(.+)$/);
        if (m) {
            const inner = describeUrl(m[1]);
            return inner.guess + " (archived)";
        }
    }

    const segments = path.split("/").filter(Boolean)
        .filter(s => !/^(index|default)\.(html?|php|aspx?)$/i.test(s))
        .filter(s => !/^\d+$/.test(s))
        .filter(s => !/^(comment-page-\d+|page-?\d+|amp|full|view|print)$/i.test(s))
        .filter(s => !/^(wiki|play|p|post|blog|en|de|design|business|products|pmwiki\.php|Main|watch|status)$/i.test(s));
    let seg = segments[segments.length - 1] || "";

    if (/^\d{4}$/.test(seg) || seg.length < 3) seg = "";
    seg = seg.replace(/\.(html?|php|aspx?|pdf)$/i, "")
        .replace(/[_+]/g, " ")
        .replace(/-/g, " ")
        .replace(/%28|%29/g, "")
        .replace(/\s+/g, " ")
        .trim();

    if (isLocal) return seg ? seg.replace(/([a-z])([A-Z])/g, "$1 $2") : "Document";

    const query = url.match(/[?&]q=([^&#]+)/);
    if (/\/search/.test(path) && query) return "Search: " + decodeURIComponent(query[1].replace(/\+/g, " "));

    if (!seg || /^[a-z0-9]{1,12}$/i.test(seg) && !/[aeiou]{1}/i.test(seg)) return prettyHost(host);
    seg = seg
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/(\s\d{3,})+$/, "")                  // trailing article ids: "... 1275355204"
        .replace(/^(\d+\s)+(?=[a-z])/i, "")           // leading ids: "3598 level design help files"
        .replace(/\b(\w+) (s|t)\b(?= |$)/g, "$1'$2"); // "isn t" -> "isn't", "assassin s" -> "assassin's"
    if ((seg.match(/(^| )i( |$)/g) || []).length >= 2) {
        seg = seg.replace(/(^| )i(?= |$)/g, "").replace(/\s+/g, " ").trim(); // gamedeveloper <i> markers
    }
    return seg.charAt(0).toUpperCase() + seg.slice(1);
}

function prettyHost(host) {
    const parts = host.split(".");
    const sub = parts.length > 2 && !/^(www|blog|en|de|m|web|store|docs)$/.test(parts[0]) ? parts[0] : null;
    const base = sub || parts.slice(-2, -1)[0] || host;
    return base.charAt(0).toUpperCase() + base.slice(1);
}
