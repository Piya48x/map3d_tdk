import { SITE } from './app-config.js';

            // Photo-based layout: satellite pixels record roof identity and relative extents.
            // World dimensions are proportional estimates, cross-checked against the aerial photo.
            // They are not surveyed dimensions or a georeferenced image-to-world transform.
            export const TOP_VIEW_GRID = Object.freeze({
                source: './references/factory-satellite.png',
                imageSize: { width: 1064, height: 857 },
                axes: { x: 'left-to-right across campus', z: 'gate-to-rear', gateIsPositiveZ: true },
                // Approximate roof extents traced from the supplied image; not survey measurements.
                footprints: {
                    doke1_west: {
                        sourceCenterPx: [790, 215], sourceFootprintPx: [165, 400],
                        position: { x: -32, z: -28 }, size: { width: 25, depth: 52 }
                    },
                    doke1_store: {
                        sourceCenterPx: [695, 404], sourceFootprintPx: [164, 480],
                        position: { x: -4, z: -15.5 }, size: { width: 24, depth: 59 }
                    },
                    doke2_assy: {
                        sourceCenterPx: [631, 631], sourceFootprintPx: [214, 442],
                        position: { x: 31, z: -10.5 }, size: { width: 32, depth: 56 }
                    },
                    rack_dome: {
                        sourceCenterPx: [284, 553], sourceFootprintPx: [177, 190],
                        position: { x: 19.5, z: 31 }, size: { width: 27, depth: 25 }
                    },
                    main_office: {
                        sourceCenterPx: [301, 301], sourceFootprintPx: [85, 120],
                        position: { x: -16.5, z: 30 }, size: { width: 18.5, depth: 14 }
                    },
                    canteen: {
                        sourceCenterPx: [525, 153], sourceFootprintPx: [162, 171],
                        position: { x: -38.5, z: 6.5 }, size: { width: 25, depth: 17 }
                    }
                }
            });
            const gridBuilding = (id, name, height, details) => {
                const measured = TOP_VIEW_GRID.footprints[id];
                return {
                    id, name,
                    position: { ...measured.position },
                    size: { ...measured.size, height },
                    gridMeasurement: {
                        sourceCenterPx: [...measured.sourceCenterPx],
                        sourceFootprintPx: [...measured.sourceFootprintPx]
                    },
                    ...details
                };
            };
            export const BUILDINGS = [
                gridBuilding('doke1_west', 'Doke 1 — อาคารด้านซ้าย', 6.62, {
                    rotationY: 0,
                    roof: { type: 'barrel', axis: 'z', rise: 3.8, overhang: .58, skylight: 'vents' },
                    facade: { type: 'quiet', sign: true, loadingDoors: 1, blueRatio: .34 },
                    vent: false, confidence: 'high', evidence: ['factory-satellite', 'factory-aerial']
                }),
                gridBuilding('doke1_store', 'Doke 1 — อาคารกลาง / Store', 6.75, {
                    rotationY: 0,
                    roof: { type: 'barrel', axis: 'z', rise: 4.1, overhang: .58, skylight: 'sparse' },
                    facade: { type: 'store', sign: true, loadingDoors: 1, blueRatio: .6 },
                    vent: true, confidence: 'high', evidence: ['factory-satellite', 'factory-aerial', 'S__33005594']
                }),
                gridBuilding('doke2_assy', 'Doke 2 — Assy Hanon', 7.86, {
                    rotationY: 0,
                    roof: { type: 'barrel', axis: 'z', rise: 4.6, overhang: .58, skylight: 'vents' },
                    facade: { type: 'louvered', sign: true, loadingDoors: 1, blueRatio: .9 },
                    vent: false, confidence: 'high', evidence: ['factory-satellite', 'factory-aerial', 'S__33005597', 'S__33005598']
                }),
                gridBuilding('rack_dome', 'โดมเก็บแร็ค', 5.45, {
                    rotationY: 0,
                    roof: { type: 'barrel', axis: 'z', rise: 3.7, overhang: .58, skylight: 'centerBands' },
                    facade: { type: 'rack', sign: false, loadingDoors: 0, blueRatio: .48 },
                    vent: false, confidence: 'high', evidence: ['factory-satellite', 'factory-aerial', 'S__33005599']
                }),
                gridBuilding('main_office', 'Main Office', 5.45, {
                    // The real entrance/sign facade faces the central yard (+X).
                    // Rotate the long office wing so its depth runs along the site Z axis.
                    rotationY: Math.PI / 2,
                    roof: { type: 'flat-parapet', rise: 0, overhang: .32 }, facade: { type: 'office', sign: true },
                    confidence: 'high', evidence: ['factory-aerial', 'S__33005585', 'S__33005593', 'S__33005601']
                }),
                gridBuilding('canteen', 'Canteen / DV FL 2 / DIE-SET FL 2', 5.19, {
                    rotationY: 0,
                    roof: { type: 'barrel-over-office', axis: 'x', rise: 2.7, overhang: .32 },
                    facade: { type: 'canteen', sign: false }, confidence: 'high',
                    evidence: ['factory-satellite', 'factory-aerial', 'factory-layout', 'S__33005590']
                })
            ];
            export const BUILDING_BY_ID = Object.fromEntries(BUILDINGS.map(item => [item.id, item]));

            export const CAMERA_PRESETS = {
                // Locked to the user-supplied 2026-11-17 aerial-reference shot.
                reference: { position: [140, 125, 160], target: [30, 0, 60], fov: 43 },
                // The initial overview now opens on the same composition to avoid a jump
                // between the landing shot and the Aerial Reference control.
                aerial: { position: [140, 125, 160], target: [30, 0, 60], fov: 43 },
                gate: { position: [-48, 24, 132], target: [-20, 4.5, 60], fov: 42 },
                office: { position: [27, 35, 111], target: [-21.75, 4.5, 60.75], fov: 38 },
                factory: { position: [-132, 58, 83], target: [-2, 7, -22], fov: 43 },
                top: { position: [8, 260, -8], target: [8, 0, -8], orthoHeight: 220 }
            };
            export const ROADS = [
                // Main circulation runs diagonally from the gate through the gap between
                // Main Office and the rack dome, ending at the Store forecourt.
                { id: 'entry', from: [-13.6, 51.3], to: [4, 7.5], width: 8.4 },
                // Long service lane between Doke 2 / rack dome and the east boundary.
                { id: 'east-service', from: [46, 47], to: [46, -53], width: 5.2 }
            ];
            export const WALKWAYS = [
                // Blue access path turns left beside the Main Office.
                {
                    id: 'office-access', type: 'chevron-l',
                    points: [[-13.6, 51.3], [-13.6, 25.8], [-17.7, 25.8]], width: 1.8
                }
            ];
            export const PARKING_AREAS = [
                // Two parallel carports beside the entrance, clear of the gate and access road.
                { id: 'front-carpark-rear', x: -32, z: 52.2, width: 27, depth: 4, spaces: 9, bayAxis: 'x' },
                { id: 'front-carpark-front', x: -32, z: 56.6, width: 27, depth: 4, spaces: 9, bayAxis: 'x' }
            ];
            export const FENCES = [
                [-50, -56.5, -50, 50], [50, -56.5, 50, 50], [-50, -56.5, 50, -56.5],
                [-50, 50, -19.48, 50]
            ];
            export const FRONT_WALLS = [
                // Solid frontage to the right of the gate; the short entry road remains on the left.
                [-4.55, 50, 50, 50]
            ];
            export const VEGETATION = {
                rearTreeSpacing: 4.55,
                boundaryTreeSpacing: 5.19
            };

            // Exposed audit data uses the requested 100-unit site coordinate system.
            const buildingBounds = item => {
                const rotation = item.rotationY || 0;
                const worldWidth = Math.abs(item.size.width * Math.cos(rotation)) +
                    Math.abs(item.size.depth * Math.sin(rotation));
                const worldDepth = Math.abs(item.size.width * Math.sin(rotation)) +
                    Math.abs(item.size.depth * Math.cos(rotation));
                return {
                    minX: item.position.x - worldWidth / 2,
                    maxX: item.position.x + worldWidth / 2,
                    minZ: item.position.z - worldDepth / 2,
                    maxZ: item.position.z + worldDepth / 2
                };
            };
            export const layoutWarnings = [];
            for (let i = 0; i < BUILDINGS.length; i++) {
                const a = buildingBounds(BUILDINGS[i]);
                for (let j = i + 1; j < BUILDINGS.length; j++) {
                    const b = buildingBounds(BUILDINGS[j]);
                    const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
                    const overlapZ = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
                    if (overlapX > .15 && overlapZ > .15) {
                        layoutWarnings.push(`${BUILDINGS[i].id} overlaps ${BUILDINGS[j].id}`);
                    }
                }
            }
