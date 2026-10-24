# ReForm3D (accessibility theme)

Team Big Hero 6, Hack4SDG.

- `dist/reform3d.html` is the finished single-file page. Open it in a browser (it loads three fonts from Google Fonts and falls back to system fonts offline).
- To rebuild after editing `src/`: `npm install` then `npm run build`. The output is written to `dist/reform3d.html` (and a `www/index.html` test copy).

## Connecting the design server

The page talks to the ReForm3D backend (the AI design server). Tell it where the server is, in any of these ways:

- open the page with `?api=https://your-server` in the address (remembered on that browser; `?api=off` forgets it), or
- add `<meta name="reform3d-api" content="https://your-server">` to the page, or set `window.REFORM3D_API` before the page script.

On the server, set `REFORM3D_CORS_ORIGINS` to the page's origin. A page served over HTTPS needs the server on HTTPS too (a Cloudflare or ngrok tunnel works for a demo).

With a server connected:
- the request form shows the server's status, asks the AI's clarifying questions, then designs the part (a progress timer shows each stage);
- the finished part appears on the 3D stage in the printed look, next to the card with its summary, sizes it assumed, warnings, print time and plastic from a real slicer run, and downloads (zip, STL, fit test, print notes);
- "Adjust the sizes" rebuilds without AI in seconds, "Change the design" asks the AI for a revision;
- each example part has "Make this part for me", which builds the real template on the server.

Without a server the page is unchanged: the form says it is a demo and the example button is hidden.

## Source map
- `src/body.html` page markup and copy
- `src/style.css` styles
- `src/main.js` scroll director, how-it-works steps, examples picker, pins
- `src/world.js` three.js scene: stage, bottle, printer, wing-grip cap, example parts
- `src/parts.js` wing-grip cap (plus two rejected candidates) and the eight accessibility parts, modelled in code
- `src/ex.js` copy and camera settings for the eight example parts
- `src/backend.js` the design-server connection: status, questions, result panel, sizes, revisions, example builds
- `src/reform3d-client.js` the backend's own JavaScript client (copied from the backend's `web/` folder)
- `src/fx.js` shader patches (scan, wireframe, layer-by-layer print)
- `assets/WaterBottle.glb` Khronos glTF Sample Assets, CC0, by Microsoft
