# Pixel Portfolio

Bruno Rodriguez-Mendez's portfolio, built as a pixel-art Phaser game — chop trees, explore a field,
and cut down entities to open his projects. Live at [bruno-rodriguez-mendez.com](https://bruno-rodriguez-mendez.com).

## Structure

- **`index.html` + `src/`** — the game (entry point). Plain ES modules + [Phaser](https://phaser.io/)
  loaded from a CDN, no build step.
  - `src/game.js` — Phaser config/bootstrap
  - `src/scenes/IntroScene.js` — visitor gate ("Recruiter" vs "Everyone Else"), routes accordingly
  - `src/scenes/MainScene.js` — the 2D field: chopping, hearts/bombs, the OHS sub-world swap
  - `src/utils/DoomView.js` — first-person 3D mode, a DOOM/Wolfenstein-style raycaster overlay on top
    of the still-simulating 2D world (`2D ⇄ 3D` toggle)
  - `src/utils/SoundManager.js`, `src/utils/helpers.js` — audio + shared helpers
  - `src/config/gameConfig.js` — Phaser game config
- **`personalWebsite/`** — a standalone recruiter-facing version of the portfolio (plain HTML/CSS/JS,
  no Phaser). Recruiters from the intro gate land here directly; it's also reachable on its own.
- **`assets/`** — sprites, screenshots, and project previews used by both the game and the personal
  site (`assets/subdomains/`, `assets/other-projects/`).
- **`server/`** — the multiplayer presence server: a minimal WebSocket relay (Node + `ws`) that
  broadcasts player positions so other visitors render as non-interactive ghosts. Anonymous,
  in-memory, no persistence, no auth.

## Running locally

No build step required.

```
python3 -m http.server 8731      # from repo root
```

- Game: `http://localhost:8731/index.html`
- Personal site (standalone): `http://localhost:8731/personalWebsite/index.html`

## Deployment

Static site, deployed via GitHub Pages with a custom domain (`CNAME`).

## Notable features

- First-person 3D mode (raycaster) toggled live against the same 2D world state — zombies, planks,
  the cowboy, bullets, slashes and pickups all billboard in 3D too
- Mobile-friendly touch HUD (D-pad, chop button, plank tool chip, tutorial overlay)
- Two hidden sub-worlds reached by chopping their schoolhouses: "OHS" (6 archive projects) and
  "Brown" (shape up, bloom, chipathon)
- Combat sandbox: opt-in zombie horde (A* pathing, rare BIG zombie), opt-in cowboy duel (stalks from
  the left, fires trailed bullets), a ranged Hollow-Knight-style slash, and a Terraria-Zenith frenzy
  every 5 zombie kills
- Planks: every 3 chopped trees bank one (key 1 = axe, 2 = plank); placed planks wall zombies off
  until they chew through. Trees and hidden bombs regenerate when exhausted
- Hearts run in half-heart steps, with rare half-heart pickups; zombies blow in half on hidden bombs
- Persistent scores (`localStorage`: trees, zombie kills, cowboy kills) and a visitor-type gate that
  gives recruiters a fast, no-game path to the same content
- The recruiter site's background video hides behind an opaque goop cover — gooey drips reveal it,
  tinted by the triangles they cross
- Lightweight multiplayer: other visitors appear as ghosts (position + facing only, no interaction)
  via a small WebSocket presence server

## Contributing

Bug fixes and small features are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for how to run
things locally and what to check before opening a PR.

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free to use, run, and modify for non-commercial purposes.
Commercial use is not permitted.
