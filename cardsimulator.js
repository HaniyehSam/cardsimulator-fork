/*
 * Card Simulator: loader.
 *
 * A card-set repository only needs this in its index.html:
 *
 *   <script src="cardsimulator/cardsimulator.js"></script>
 *
 * This file works out where the simulator lives (so the submodule folder can
 * have any name), adds the stylesheet, builds the page, and starts the app.
 * Library versions live only here. The card set itself is read from
 * cards/cardset.xml, cards/cardCategories.xml and cards/cards.xml next to the
 * page (see src/data.js).
 */
(function () {
    "use strict";

    var LIBS = [
        "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.4.0/jspdf.umd.min.js",
        "https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js",
    ];

    var script = document.currentScript;
    var base = new URL(".", script ? script.src : location.href).href;

    window.CARDSIM = {
        base: base,
        repo: "https://github.com/csongorb/cardsimulator",
    };

    var head = document.head;

    function meta(name, content) {
        if (head.querySelector('meta[name="' + name + '"]')) return;
        var m = document.createElement("meta");
        m.name = name;
        m.content = content;
        head.appendChild(m);
    }
    meta("viewport", "width=device-width, initial-scale=1.0, viewport-fit=cover");
    meta("theme-color", "#000000");

    var css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = base + "src/styles.css";
    head.appendChild(css);

    var PAGE = [
        '<div class="app" id="app">',
        '  <header class="top">',
        '    <a class="title" id="cardsetTitle" href="./"></a>',
        '    <nav class="cats" id="cats" aria-label="Categories"></nav>',
        '  </header>',
        '  <main class="stage">',
        '    <section class="board" id="board" aria-label="Card table">',
        '      <p class="empty" id="boardEmpty" hidden>no category selected</p>',
        '    </section>',
        '  </main>',
        '  <footer class="bottom">',
        '    <div class="group" id="layouts" role="radiogroup" aria-label="Layout">',
        '      <button role="radio" data-layout="stacks" aria-checked="true"><span class="on-table">stacks</span><span class="on-list">all</span></button>',
        '      <button role="radio" data-layout="pile" aria-checked="false" class="on-table">pile</button>',
        '      <button role="radio" data-layout="random5" aria-checked="false">random 5</button>',
        '      <span class="sep" aria-hidden="true">/</span>',
        '      <button id="shuffleBtn" type="button">shuffle</button>',
        '      <span class="sep" aria-hidden="true">/</span>',
        '      <button id="sortBtn" type="button" aria-pressed="false" title="sort alphabetically">a\u2013z</button>',
        '    </div>',
        '    <div class="group">',
        '      <button id="randomBtn" type="button">random card</button>',
        '      <span class="sep" aria-hidden="true">/</span>',
        '      <button id="pdfBtn" type="button">pdf</button>',
        '      <span class="sep" aria-hidden="true">/</span>',
        '      <a id="repoLink" href="' + window.CARDSIM.repo + '" target="_blank" rel="noopener">github</a>',
        '    </div>',
        '  </footer>',
        '</div>',
        '<div class="veil" id="veil" hidden></div>',
        '<article class="flip" id="flip" role="dialog" aria-modal="true" aria-labelledby="flipTitle" hidden>',
        '  <div class="flip-inner" id="flipInner">',
        '    <div class="face face-front" id="flipFront"></div>',
        '    <div class="face face-back" id="flipBack"></div>',
        '  </div>',
        '</article>',
        '<dialog class="dialog" id="pdfDialog" aria-labelledby="pdfTitle">',
        '  <form method="dialog">',
        '    <h2 id="pdfTitle">print &amp; play</h2>',
        '    <p class="muted">A PDF of the <span id="pdfCount">0</span> cards in the selected categories.</p>',
        '    <fieldset>',
        '      <legend>QR code</legend>',
        '      <label><input type="radio" name="qr" value="none"> no QR code</label>',
        '      <label><input type="radio" name="qr" value="front" checked> QR on the front</label>',
        '      <label><input type="radio" name="qr" value="back"> QR on the back</label>',
        '      <p class="muted small" id="pdfQrNote" hidden>Question and task cards never get a QR code.</p>',
        '    </fieldset>',
        '    <fieldset>',
        '      <legend>print</legend>',
        '      <label><input type="checkbox" id="bwMode"> black &amp; white</label>',
        '      <label><input type="checkbox" id="a4Mode"> A4 sheets (9 cards per page)</label>',
        '      <p class="muted small">Otherwise one 63 \u00d7 88 mm card per page.</p>',
        '    </fieldset>',
        '    <div class="dialog-actions">',
        '      <button value="cancel">cancel</button>',
        '      <button value="generate" class="strong">generate pdf</button>',
        '    </div>',
        '  </form>',
        '</dialog>',
    ].join("\n");

    function addScript(src, module) {
        var s = document.createElement("script");
        s.src = src;
        if (module) s.type = "module";
        else s.async = false; // keep the order
        head.appendChild(s);
    }

    function start() {
        document.body.insertAdjacentHTML("afterbegin", PAGE);
        document.getElementById("cardsetTitle").textContent = document.title.toLowerCase();
        LIBS.forEach(function (src) { addScript(src, false); });
        addScript(base + "src/app.js", true);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
})();
