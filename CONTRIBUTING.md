# Contributing

Thanks for considering a contribution to Pixel Portfolio. This is a personal portfolio project first,
but bug fixes, polish, and small features are welcome.

## Before you start

For anything more than a small fix (new mechanics, new sub-worlds, structural changes), open an issue
first to discuss the idea before writing code — it's easy to sink time into something that doesn't fit
the project's direction.

## Running locally

No build step required.

```
python3 -m http.server 8731      # from repo root
```

- Game: `http://localhost:8731/index.html`
- Personal site (standalone): `http://localhost:8731/personalWebsite/index.html`

The multiplayer "ghost" presence feature needs the WebSocket server running separately:

```
cd server
npm install
npm start
```

By default it expects TLS certs (see `server/deploy/`); for local testing you can run it over plain
`ws://` by adjusting `src/config/network.js` to point at your local server instead of the production
`wss://` endpoint. Don't commit that change.

## Code style

- Plain ES modules, no bundler, no framework — keep it that way. New code should load the same way
  existing code does (native `<script type="module">` / CDN imports), not introduce a build step.
- Match the existing structure: scene logic in `src/scenes/`, shared helpers in `src/utils/`, config
  in `src/config/`.
- No comments explaining *what* code does — name things clearly instead. Comments are for *why*,
  when something is genuinely non-obvious (a workaround, a hidden constraint).

## Testing your change

There's no automated test suite. At minimum, before opening a PR:

- Load the game in a desktop browser and confirm the change works and nothing else regressed.
- Check it on a mobile viewport (touch HUD, D-pad) if your change touches `MainScene.js`,
  `DoomView.js`, or anything input-related — mobile support is a priority for this project.
- If your change touches `server/`, run the WebSocket server locally and confirm presence/ghosts
  still work with two or more browser tabs open.

## Submitting a PR

- Keep PRs focused — one feature or fix per PR.
- Describe what you changed and why, and how you tested it (desktop/mobile, which browsers).
- By submitting a PR, you agree your contribution is licensed under this repo's
  [LICENSE](LICENSE) (PolyForm Noncommercial 1.0.0).
