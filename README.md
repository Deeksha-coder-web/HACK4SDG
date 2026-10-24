# ReForm3D (accessibility theme)

Team Big Hero 6, Hack4SDG.

- `dist/reform3d.html` is the finished single-file page. Open it in a browser (it loads three fonts from Google Fonts and falls back to system fonts offline).
- To rebuild after editing `src/`: `npm install` then `npm run build`. The output is written to `dist/reform3d.html` (and a `www/index.html` test copy).

## Source map
- `src/body.html` page markup and copy
- `src/style.css` styles
- `src/main.js` scroll director, how-it-works steps, examples picker, pins
- `src/world.js` three.js scene: stage, bottle, printer, wing-grip cap, example parts
- `src/parts.js` wing-grip cap (plus two rejected candidates) and the eight accessibility parts, modelled in code
- `src/ex.js` copy and camera settings for the eight example parts
- `src/fx.js` shader patches (scan, wireframe, layer-by-layer print)
- `assets/WaterBottle.glb` Khronos glTF Sample Assets, CC0, by Microsoft
