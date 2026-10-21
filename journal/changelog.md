# Changelog - Card Simulator

## Todos / Bugs / Ideas

- rebuilding the "old" structures
	- generating PDFs
	- making cards directly accessible through direct links (posibly through paremeters)
	- directly selectable categories
	- link to the repository / XML-files with the links
- individual "give me more" text?
- more advanced PDF generator
	- now that PDFs can be generated "on the fly": adjustable size and colors, etc.
	- front page with additional information
- speed improvements, why is it so slow?
- more mobile friendly? how with p5.js?
- PDF generation
	- one page generation with QR codes has some bugs (codes are on a separate page)
	- should the html-part be moved to js (and thus to the cardsimulator)? or is it ok to keep it in the html-file?
- the whole structure how cards are arrangend needs to be reworked
	- now two systems are existing next to each other (my old and Christophs new one)
	- some are working with a flexible amount of referenced (URL) cards
	- some others not

## Release 0.50 (Work in Progress)

- new card table, replacing the p5.js simulator (the old files are in the git history)
	- plain HTML/CSS/JS modules, no build step, no p5.js
	- responsive: desktop, tablet, phone
	- click a card to flip it: questions on the back, "inspire me" (random link) and "more" (numbered link list)
	- "random card", stacks / pile / random 5 (a pile and five cards around it), shuffle, a–z sorting, category filters
	- short deep links: `?card=name` opens the card
	- cards have the printed shape (63 × 88) with rounded corners; Helvetica Neue UltraLight throughout
	- phones: scrolling list, cards open full screen, swipe left / right for the next / previous card, down to close
	- question / task cards only show when their own category is on (and, if topics are on, one of their topics)
	- color grading: each card set keeps its own palette; a color is only darkened (in OKLCH, same hue) where pure white text would fall below 4.5:1. `<grading>` in `cardset.xml`: `calm` (one shared muted band) or `off` (XML colors as they are)
	- prompts on the back of a card are questions: each one ends with a "?" (task cards stay as written)
	- the table is hidden while a card is open (solid black behind it)
	- sharp text: readable cards lie straight on whole pixels (only cards covered in a pile are slightly turned); an opened card drops its 3D once it has turned
	- one motion language: hover lifts, picking up straightens and raises a card, dragging follows the pointer, putting down settles
	- previous / next on every opened card (also swipe and arrow keys): the card stays, its content slides, and the color blends only when the category changes
	- the PDF panel opens and closes like a card, out of the "pdf" button
- clean split between simulator and card sets
	- `cardsimulator.js` loader: a card set's `index.html` is ~10 lines and identical everywhere
	- `cards/cardset.xml`: title, repository, public url
	- no hardcoded paths into the host repository
	- `template/` with a GitHub Pages deploy workflow (replaces the `xmlfiles.html` workaround)
- PDF export
	- one 63 × 88 mm card per page, or A4 sheets (3 × 3 with cut lines)
	- QR code: none, on the front, or on the back (A4 backs mirrored for double-sided printing)
	- color (same graded colors as on screen, white text) or black & white
	- larger titles (up to 32 pt)
	- QR codes point to the public url from `cardset.xml` (or keep the page path)
	- QR codes are transparent PNGs in the card's ink color
	- question / task cards can be printed too (never with a QR code)

## Release 0.40

- finally: proper setup with separate repositories 
	- p5.js can directly access the XML files in the other repository
	- Processing is NOT needed anymore
		- thanks for everything, it was a pleasure to work with you!
- no more porn!

## Previous Versions

See: https://bitbucket.org/csongorb/porncreator/