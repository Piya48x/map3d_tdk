# Reusable Three.js export

Copy these two files into another web project:

- `tdk-factory-map-baseline-2026-11-05.js`
- `example.html` (or use its script tags as an integration example)

The JavaScript file is self-contained and exposes `window.TDK_FACTORY_MAP`.
It embeds the locked layout and does not write its layout into the host
application's `localStorage`.

Available API calls:

```js
window.TDK_FACTORY_MAP.setView('aerial');
window.TDK_FACTORY_MAP.setEnvironment('day');
window.TDK_FACTORY_MAP.getObject('object-id');
```

Bundle SHA-256:
`e4cbdbc26c9e8cca4ef9240de017acb660d522e18a7773f43e880acb7a006d8c`

