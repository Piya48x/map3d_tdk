# Locked TDK map baseline

The canonical hand-arranged map is the snapshot captured on 2026-11-05:

- Layout: `snapshots/baseline-2026-11-05/layout.json`
- Layout SHA-256: `263c223a07fdfa1c88ba80aed1d1e3c3dbbe9f181a1e5a89c9a8526c535fd004`
- Revision: 12
- Objects: 671
- Added: 52
- Deleted: 465
- Cuts: 1

Rules for every future change:

1. Existing object position, rotation, scale, render mode, deletion state, and wall cuts are immutable unless the user explicitly names the existing object and requests that exact transform change.
2. “Add” means additive-only: create a new stable object ID without changing any existing layout record.
3. Never load a standalone bundle in a way that writes its embedded layout to `tdk-v7-object-layout-v1`.
4. Never replace or migrate the canonical snapshot implicitly.
5. Before exporting, compare all existing records against the canonical snapshot. Unrequested differences must be zero.
6. New standalone exports must embed the requested new objects and must not write to host `localStorage` during startup.

