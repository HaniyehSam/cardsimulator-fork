# My Cards

Brainstorming cards. Arrange, think, discuss.

This repository holds **content only**. Everything that displays the cards comes from the [cardsimulator](https://github.com/csongorb/cardsimulator) submodule.

## Structure

- `cards/cardset.xml`: title, repository and public address of this card set
- `cards/cardCategories.xml`: the categories (colors, rows)
- `cards/cards.xml`: the cards and their links
- `texts/`: documents linked from the cards
- `index.html`: tiny loader, identical in every card set
- `.github/workflows/deploy.yml`: publishes the site to GitHub Pages
- `cardsimulator/`: the simulator (git submodule, pinned to a commit)

## Run locally

Any static web server works (the XML can't be loaded from `file://`):

```
python -m http.server
```

Then open http://localhost:8000/.

## Update the simulator

```
git -C cardsimulator pull origin main
git add cardsimulator
git commit -m "Update cardsimulator"
```
