# TDK 3D Factory — development map

`index.html` is the browser entry point and contains the page structure. The
runtime entry point is `src/main.js`:

- `src/main.js` initializes the scene, gameplay, object editor and interactions.
- `src/factory-data.js` contains the photo-estimated building footprints, camera
  presets, roads, walkways, parking and vegetation data.
- `src/viewer.css` contains the main viewer styles; `src/responsive.css` contains
  the small-screen overrides. `src/editor-workspace.css` styles the editor.
- `src/bootstrap.js` reports module-loading errors before the app initializes.

## Small modules

- `src/app-config.js` is the single place for site-scale and gameplay tuning.
- `src/game-controls.js` contains pure input and movement helpers. It has no
  Three.js dependency, so changes to left/right movement can be reviewed or
  tested without loading the whole scene.

When adding a feature, put new tunable values in `app-config.js`, layout content
in `factory-data.js`, pure input or math in `src/`, and viewer/editor styling in
the corresponding CSS file. This keeps UI and layout changes separate from the
page entry point.

## Fullscreen object workspace

`src/editor-workspace.css` contains the white/blue theme and responsive editing
workspace. Entering edit mode hides the viewer panels and exposes the object
list, inspector and toolbar over the full-viewport canvas. The fullscreen button
separately uses the browser Fullscreen API; hiding the panels provides a clear
canvas on small screens. View switches retain the active edit session.

The editor supports position XYZ, Y rotation, scale XYZ, proportional scale,
snapping, names, multi-selection, duplication (including buildings), add/delete,
undo/redo, automatic localStorage saves and JSON export. Built-in buildings have
stable IDs. Primitive meshes are wrapped so their geometry scale is not confused
with the editor scale. Building name labels follow their edited transforms.

Layout revision 12 resets saved built-in scales that made the west Doke 1 hall
oversized. The default opening view frames the full campus from an elevated
three-quarter angle. Building extents remain approximate evidence, not surveyed
dimensions or a georeferenced transformation.
On migration the previous layout is backed up and custom objects are retained;
built-in transforms reset to the corrected base layout.

## Verification

Run `npm install` then `npm test` in `v7/qa`. The integration harness uses the same
Three.js 0.169.0 as the page and a JSDOM document. It exercises editor actions,
world transforms, multi-selection, history, persistence and fullscreen events.
GPU rendering and canvas rasterization are stubbed: these checks do not replace
visual WebGL testing in a browser. `qa/index.before-editor.html` is the source
backup from before this change.
