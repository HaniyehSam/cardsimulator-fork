# Card Simulator

A **tool** to visualise / create / provide **brainstorming cards**.

- digital cards in the browser: arrange them (stacks, pile, random 5), sort a–z, flip one to read its questions
- "inspire me": a random link from the card; "more": all of its links
- phones: a scrolling list, cards open full screen, swipe for the next / previous card
- print & play PDFs (63 × 88 mm cards or A4 sheets, QR code on the front or back, color or black & white)

Arrange / think / discuss!

Based on: https://bitbucket.org/csongorb/porncreator/

Currently used in:

- Level Design Cards: https://csongorb.github.io/leveldesigncards/
	- https://github.com/csongorb/leveldesigncards
- Dissecting Games: https://csongorb.github.io/dissectinggames/
	- https://github.com/csongorb/dissectinggames
- Interface Design Cards: https://csongorb.github.io/interfacedesigncards/
	- https://github.com/csongorb/interfacedesigncards
- Narrative Design Cards: https://csongorb.github.io/narrativedesigncards/
	- https://github.com/csongorb/narrativedesigncards

## Structure

This repository holds everything that **renders** a card set. Card-set repositories hold **content only** and include this repository as a git submodule.

- `cardsimulator.js`: loader; the only file a card set's `index.html` references. It finds its own location, adds the stylesheet, builds the page and loads the libraries (their versions live only here).
- `src/`: the app (ES modules, no build step)
	- `app.js`: card table, layouts, dragging, flipping
	- `data.js`: reads `cards/cardset.xml`, `cards/cardCategories.xml`, `cards/cards.xml`
	- `pdf.js`: print & play PDF export
	- `color.js`: readable text and edge colors for any category color
	- `styles.css`
- `fonts/`: font embedded in the PDFs
- `template/`: starter kit for a new card set
- `journal/`: changelog, journal, screenshots

A card set looks like this:

```
mycards/
  index.html                     tiny loader (same in every card set)
  cards/cardset.xml              title, repo, public url (QR codes)
  cards/cardCategories.xml
  cards/cards.xml
  texts/                         documents linked from the cards
  .github/workflows/deploy.yml   publishes to GitHub Pages
  cardsimulator/                 this repository, as a submodule (pinned)
```

## New card set

1. Create an empty repository on GitHub, clone it.
2. Copy everything from `template/` into it (including the hidden `.github/` folder and `.gitignore`).
3. Add the simulator: `git submodule add https://github.com/csongorb/cardsimulator.git cardsimulator`
4. Edit `cards/cardset.xml`, `cards/cardCategories.xml` and `cards/cards.xml`.
5. Commit and push.
6. On GitHub: Settings → Pages → Source → **GitHub Actions**.

## Updating a card set to a newer simulator

The submodule is pinned to a commit, so card sets only change when you decide:

```
git -C cardsimulator pull origin main
git add cardsimulator
git commit -m "Update cardsimulator"
```

## Run locally

Any static web server, from the card-set folder (the XML can't be loaded from `file://`):

```
python -m http.server
```

Then open http://localhost:8000/. Links like `?card=leveldesign` open a card directly.

## Changelog & Journal

- [changelog](journal/changelog.md)
- [journal](journal/journal.md)
- [screenshots](journal/screenshots/)

## Credits

- **Csongor Baranyai**  
	- csongorb (at) gmail (dot) com  
	- [csongorb.com](http://www.csongorb.com)

Thanks to all the **universities / schools / institutions** where I had the opportunity to teach courses, supervise students and projects, and refine the idea of the brainstorming cards. And of course a huge thank you to all the **students** who have contributed with all their comments and critiques... and who have tolerated my experiments.

Additional design / coding:

- **Christoph Maureder**
	[christophmaureder.me/](https://christophmaureder.me/)
- **Adrian Köhlmoos**
	- [LinkedIn](https://www.linkedin.com/in/adrian-ace-k%C3%B6hlmoos-30b99212b)

## License

[![Creative Commons License](https://i.creativecommons.org/l/by-nc/4.0/88x31.png)](http://creativecommons.org/licenses/by-nc/4.0/)
This work is licensed under a [Creative Commons Attribution-NonCommercial 4.0 International License](http://creativecommons.org/licenses/by-nc/4.0/).

All other media (images, software, etc.) remain the property of their copyright holders.
