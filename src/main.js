import * as THREE from 'three';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
        import { TransformControls } from 'three/addons/controls/TransformControls.js';
        import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
        import { SITE, GAME_CONFIG } from './app-config.js';
        import { TOP_VIEW_GRID, BUILDINGS, BUILDING_BY_ID, CAMERA_PRESETS, ROADS, WALKWAYS, PARKING_AREAS, FENCES, FRONT_WALLS, VEGETATION, layoutWarnings } from './factory-data.js';
        import { GAME_MOVEMENT_CODES, getMovementInput, movementDelta, clamp } from './game-controls.js';
        import { auditLayoutAgainstBaseline, prepareBaselineRepair, embedLayoutInStandalone } from './threejs-export.js';
        import { createActivityNavigator, positionOnActivityLoop } from './activity-navigation.js';
        import { createAdaptiveRenderQuality } from './render-quality.js';
        import { BUILDING_INTERIORS, EXECUTIVE_TOUR_STOPS, createBuildingInterior } from './building-interiors.js';
        import { EXTERNAL_ASSET_PRESETS, externalAssetPreset, normalizeExternalAsset } from './external-assets.js';
        import {
            presentationGreetings,
            PRESENTATION_GREETING_DURATION,
            PRESENTATION_GREETING_VISIBLE_DURATION,
            PRESENTATION_WEATHER_DURATION,
            PRESENTATION_OPENING_DURATION,
            PRESENTATION_LAYOUT_BRIDGE_DURATION,
            PRESENTATION_LAYOUT_TRANSITION_LEAD,
            PRESENTATION_ENVIRONMENT_TRANSITION_DURATION,
            PRESENTATION_STOP_DURATION,
            PRESENTATION_TRAVEL_DURATION,
            PRESENTATION_CLOSING_DURATION,
            presentationOverviewPositionPoints,
            presentationOverviewTargetPoints,
            presentationEnvironmentLabels,
            presentationWeatherSequence,
            presentationTourDuration
        } from './presentation/presentation-config.js';

        const loading = document.getElementById('loading');

        try {

            // ------------------------------------------------------------
            // Scene and renderer
            // ------------------------------------------------------------
            const scene = new THREE.Scene();
            scene.background = new THREE.Color('#f4f8fa');
            scene.fog = new THREE.Fog('#f4f8fa', 255, 610);

            const startupParams = new URLSearchParams(location.search);
            const startupViewKey = startupParams.get('view');
            const startupPreset = startupViewKey === 'office'
                ? CAMERA_PRESETS.office
                : startupViewKey === 'aerial' || startupViewKey === null
                    ? CAMERA_PRESETS.aerial
                    : CAMERA_PRESETS.reference;
            const viewport = document.getElementById('viewport');
            const getViewportSize = () => ({
                width: Math.max(1, Math.round(viewport.clientWidth)),
                height: Math.max(1, Math.round(viewport.clientHeight))
            });
            const initialViewportSize = getViewportSize();
            const initialAspect = initialViewportSize.width / initialViewportSize.height;
            if (startupParams.get('presentation') === '1') {
                document.body.classList.add('presentation-mode');
            }
            const perspectiveCamera = new THREE.PerspectiveCamera(
                startupPreset.fov, initialAspect, 0.3, 1200
            );
            perspectiveCamera.position.set(...startupPreset.position);
            const topCamera = new THREE.OrthographicCamera(-92, 92, 92, -92, .3, 700);
            const initialTopHalfHeight = 92;
            const initialTopHalfWidth = initialTopHalfHeight * initialAspect;
            topCamera.left = -initialTopHalfWidth;
            topCamera.right = initialTopHalfWidth;
            topCamera.position.set(0, 245, 0);
            topCamera.up.set(0, 0, -1);
            topCamera.lookAt(0, 0, -5);
            let camera = perspectiveCamera;

            const renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(initialViewportSize.width, initialViewportSize.height, false);
            const renderQuality = createAdaptiveRenderQuality({
                devicePixelRatio, width: initialViewportSize.width, height: initialViewportSize.height,
                compact: innerWidth < 700,
                onChange: ratio => renderer.setPixelRatio(ratio)
            });
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            renderer.shadowMap.autoUpdate = false;
            renderer.shadowMap.needsUpdate = true;
            renderer.outputColorSpace = THREE.SRGBColorSpace;
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 1.12;
            renderer.domElement.tabIndex = 0;
            renderer.domElement.setAttribute('aria-label', 'พื้นที่แผนที่สามมิติ');
            viewport.appendChild(renderer.domElement);

            const controls = new OrbitControls(camera, renderer.domElement);
            let overlayEnabled = false;
            let activeInterior = null;
            controls.target.set(...startupPreset.target);
            controls.enableDamping = true;
            controls.dampingFactor = 0.065;
            controls.minDistance = 24;
            controls.maxDistance = 330;
            controls.maxPolarAngle = Math.PI / 2 - 0.025;
            controls.autoRotateSpeed = 0.65;
            controls.enableRotate = true;
            controls.enablePan = true;

            const toRender = value => value * SITE.renderUnitsPerSiteUnit;

            window.TDK_LAYOUT = { SITE, TOP_VIEW_GRID, BUILDINGS, ROADS, WALKWAYS, PARKING_AREAS, FENCES, FRONT_WALLS, VEGETATION, CAMERA_PRESETS, layoutWarnings };
            if (layoutWarnings.length) console.warn('TDK layout audit:', layoutWarnings);

            const ambient = new THREE.HemisphereLight('#ffffff', '#73805f', 2.45);
            scene.add(ambient);

            const sun = new THREE.DirectionalLight('#fff6df', 3.35);
            sun.position.set(-85, 145, 65);
            sun.castShadow = true;
            const shadowSize = 2048;
            sun.shadow.mapSize.set(shadowSize, shadowSize);
            Object.assign(sun.shadow.camera, {
                left: -135, right: 135, top: 135, bottom: -135, near: 1, far: 380
            });
            sun.shadow.normalBias = 0.045;
            sun.shadow.bias = -0.00015;
            sun.shadow.radius = 3;
            sun.target.position.set(0, 0, -5);
            scene.add(sun, sun.target);

            const skyFill = new THREE.DirectionalLight('#b8dcff', .58);
            skyFill.position.set(120, 85, -110);
            scene.add(skyFill);

            const moon = new THREE.DirectionalLight('#83aef5', 0);
            moon.position.set(95, 120, -80);
            moon.castShadow = false;
            moon.shadow.mapSize.set(1024, 1024);
            Object.assign(moon.shadow.camera, {
                left: -145, right: 145, top: 145, bottom: -145, near: 1, far: 400
            });
            moon.target.position.set(0, 0, -5);
            scene.add(moon, moon.target);

            // Deterministic random values keep scenery consistent.
            let seed = 62819;
            function rand() {
                seed = (seed * 1664525 + 1013904223) >>> 0;
                return seed / 4294967296;
            }

            const material = (color, roughness = .8, metalness = 0) =>
                new THREE.MeshStandardMaterial({ color, roughness, metalness });

            const M = {
                blue: material('#0961b6', .49, .32),
                roof: material('#006fb5', .72, .08),
                roofLightBlue: material('#006fb5', .72, .08),
                roofDark: material('#0752a0', .5, .32),
                roofRib: material('#6aa0c7', .52, .3),
                roofSeam: material('#a7c9df', .38, .36),
                paleRoof: material('#c1ccd0', .7, .22),
                wall: material('#ecece4'),
                base: material('#b8bcb6'),
                office: material('#f4f4ed'),
                officeWhite: material('#f2f2f2'),
                officeRoof: material('#c9ced3', .62, .22),
                officeGlass: material('#2f7bd8', .2, .34),
                officeGlassDark: material('#1b3e7a', .2, .42),
                officeBlue: material('#1f4fc8', .42, .28),
                officeStripe: material('#1f4fa8', .42, .2),
                glass: new THREE.MeshStandardMaterial({
                    color: '#234c60', roughness: .25, metalness: .48
                }),
                glassBlue: new THREE.MeshStandardMaterial({
                    color: '#3a8cc2', roughness: .22, metalness: .42
                }),
                frame: material('#d8e4e8', .5, .35),
                chrome: material('#d8e2e5', .16, .9),
                dark: material('#25373c'),
                bayShadow: material('#101b20', .72, .08),
                facadeBlueDark: material('#064a92', .52, .24),
                asphalt: material('#737b7b'),
                concrete: material('#bfc1b8'),
                concreteLight: material('#d0d1ca'),
                concreteDark: material('#9fa5a1'),
                curb: material('#d7d8cb'),
                white: material('#f5f4df'),
                yellow: material('#f1cf4e'),
                safety: material('#e7b92e'),
                pathBlue: material('#2e6fe0'),
                pathMarking: material('#434b58'),
                drain: material('#465258', .48, .58),
                fence: material('#b2b9b5', .7, .5),
                picketWhite: material('#f0f0e8', .7, .1),
                wood: material('#8b5e3c', .75, .05),
                woodDark: material('#6b3a1f', .72, .05),
                woodRoof: material('#7a3b1a', .65, .08),
                containerYellow: material('#e8c83a', .5, .15),
                containerBlue: material('#3566a0', .45, .2),
                blueBox: material('#1a5ea0', .4, .25),
                greenCrate: material('#31864e', .48, .12),
                flagRed: material('#c0392b', .5, .1),
                flagWhite: material('#f5f5f5', .5, .1),
                flagBlue: material('#1a3d7c', .5, .1),
                trunk: material('#76634a'),
                foliage: [
                    material('#39733a'), material('#487d3b'),
                    material('#588942'), material('#2e6636')
                ],
                skylight: new THREE.MeshStandardMaterial({
                    color: '#f4fbff', roughness: .42, metalness: .05,
                    transparent: true, opacity: .74, side: THREE.DoubleSide
                }),
                canopyGlass: new THREE.MeshStandardMaterial({
                    color: '#69c8ef', roughness: .26, metalness: .12,
                    transparent: true, opacity: .72, side: THREE.DoubleSide
                }),
                officeCanopyGlass: new THREE.MeshStandardMaterial({
                    color: '#75c8ef', roughness: .22, metalness: .08,
                    transparent: true, opacity: .85, side: THREE.DoubleSide
                }),
                rubber: material('#22272a'),
                red: material('#ad4543', .4, .3)
            };

            // Procedural concrete grain keeps the single-file build self-contained.
            const concreteCanvas = document.createElement('canvas');
            concreteCanvas.width = concreteCanvas.height = 256;
            const concreteCtx = concreteCanvas.getContext('2d');
            concreteCtx.fillStyle = '#d2d1ca';
            concreteCtx.fillRect(0, 0, 256, 256);
            for (let i = 0; i < 8500; i++) {
                const shade = 148 + Math.floor(rand() * 72);
                concreteCtx.fillStyle = `rgba(${shade},${shade},${shade - 4},${.035 + rand() * .07})`;
                const size = .4 + rand() * 1.7;
                concreteCtx.fillRect(rand() * 256, rand() * 256, size, size);
            }
            for (let i = 0; i < 22; i++) {
                concreteCtx.strokeStyle = `rgba(75,78,76,${.025 + rand() * .035})`;
                concreteCtx.lineWidth = .4 + rand() * .7;
                concreteCtx.beginPath();
                concreteCtx.moveTo(rand() * 256, rand() * 256);
                concreteCtx.bezierCurveTo(rand() * 256, rand() * 256, rand() * 256, rand() * 256, rand() * 256, rand() * 256);
                concreteCtx.stroke();
            }
            const concreteTexture = new THREE.CanvasTexture(concreteCanvas);
            concreteTexture.colorSpace = THREE.SRGBColorSpace;
            concreteTexture.wrapS = concreteTexture.wrapT = THREE.RepeatWrapping;
            concreteTexture.repeat.set(18, 18);
            [M.concrete, M.concreteLight, M.concreteDark].forEach(mat => {
                mat.map = concreteTexture;
                mat.needsUpdate = true;
            });

            // ------------------------------------------------------------
            // Shared geometry helpers
            // ------------------------------------------------------------
            const unitBox = new THREE.BoxGeometry(1, 1, 1);
            const meshesToPick = [];
            const staticColliders = [];
            const EDITOR_STORAGE_KEY = 'tdk-v7-object-layout-v1';
            // Revision 12 resets saved built-in scales that made the west Doke 1 hall oversized.
            const EDITOR_LAYOUT_REVISION = 12;
            const editorRenderModeStates = new WeakMap();
            const editableObjects = new Map();
            let activityObstacleRevision = 0;
            const builtinTemplates = new Map();
            const deletedBuiltinObjects = new Set();
            let externalModelLoader = null;
            let externalTextureLoader = null;
            const getExternalModelLoader = () => externalModelLoader ||= new GLTFLoader();
            const getExternalTextureLoader = () => {
                if (!externalTextureLoader) {
                    externalTextureLoader = new THREE.TextureLoader();
                    externalTextureLoader.setCrossOrigin('anonymous');
                }
                return externalTextureLoader;
            };
            let editorSequence = 0;
            let storedEditorLayout = { revision: EDITOR_LAYOUT_REVISION, objects: {}, added: [], deleted: [], cuts: [] };
            try {
                const previousLayout = window.TDK_FACTORY_LAYOUT_OVERRIDE ||
                    JSON.parse(localStorage.getItem(EDITOR_STORAGE_KEY) || '{}');
                if (previousLayout.revision === EDITOR_LAYOUT_REVISION) {
                    storedEditorLayout = {
                        revision: EDITOR_LAYOUT_REVISION,
                        objects: {}, added: [], deleted: [], cuts: [],
                        ...previousLayout
                    };
                } else {
                    // Keep the user's prior built-in edits recoverable when applying a new base layout.
                    if (previousLayout.revision && Object.keys(previousLayout.objects || {}).length) {
                        try {
                            const backupKey = `${EDITOR_STORAGE_KEY}-backup-r${previousLayout.revision}`;
                            if (!localStorage.getItem(backupKey)) localStorage.setItem(backupKey, JSON.stringify(previousLayout));
                        } catch (error) { /* A full storage quota must not prevent loading custom objects. */ }
                    }
                    const added = Array.isArray(previousLayout.added) ? previousLayout.added : [];
                    const customIds = new Set(added.map(item => typeof item === 'string' ? item : item.id));
                    const objects = Object.fromEntries(Object.entries(previousLayout.objects || {})
                        .filter(([id]) => customIds.has(id)));
                    storedEditorLayout = { revision: EDITOR_LAYOUT_REVISION, objects, added, deleted: [], cuts: [] };
                }
                storedEditorLayout.deleted.forEach(id => deletedBuiltinObjects.add(id));
            } catch (error) {
                console.warn('อ่านตำแหน่งวัตถุที่บันทึกไว้ไม่สำเร็จ', error);
            }
            const labelGroup = new THREE.Group();
            labelGroup.visible = false;
            scene.add(labelGroup);

            function registerCollider(x, z, w, d, padding = .7) {
                staticColliders.push({
                    minX: x - w / 2 - padding, maxX: x + w / 2 + padding,
                    minZ: z - d / 2 - padding, maxZ: z + d / 2 + padding,
                    cameraBox: new THREE.Box3(
                        new THREE.Vector3(x - w / 2 - padding, 0, z - d / 2 - padding),
                        new THREE.Vector3(x + w / 2 + padding, 19, z + d / 2 + padding)
                    )
                });
            }

            function box(parent, w, h, d, x, y, z, mat, shadow = true) {
                const mesh = new THREE.Mesh(unitBox, mat);
                mesh.scale.set(w, h, d);
                mesh.position.set(x, y, z);
                mesh.castShadow = shadow;
                mesh.receiveShadow = true;
                parent.add(mesh);
                return mesh;
            }

            function cyl(parent, r1, r2, h, x, y, z, mat, segments = 10) {
                const mesh = new THREE.Mesh(
                    new THREE.CylinderGeometry(r1, r2, h, segments), mat
                );
                mesh.position.set(x, y, z);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                parent.add(mesh);
                return mesh;
            }

            function stripBetween(parent, x1, z1, x2, z2, width, y, mat, thickness = .045) {
                const dx = x2 - x1;
                const dz = z2 - z1;
                const length = Math.hypot(dx, dz);
                const mesh = box(parent, length, thickness, width,
                    (x1 + x2) / 2, y, (z1 + z2) / 2, mat, false);
                mesh.rotation.y = -Math.atan2(dz, dx);
                return mesh;
            }

            function chevronWalkway(points, width = 3.2) {
                const curvePoints = points.map(([x, z]) => new THREE.Vector3(x, 0, z));
                const curve = curvePoints.length === 2
                    ? new THREE.LineCurve3(curvePoints[0], curvePoints[1])
                    : new THREE.CatmullRomCurve3(curvePoints, false, 'centripetal');
                const sampleCount = Math.max(24, Math.ceil(curve.getLength() / 1.2));
                const pathPoints = Array.from({ length: sampleCount + 1 }, (_, index) =>
                    curve.getPointAt(index / sampleCount)
                );
                const positions = [];
                const indices = [];
                pathPoints.forEach((point, index) => {
                    const tangent = curve.getTangentAt(index / sampleCount).normalize();
                    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
                    positions.push(
                        point.x + normal.x * width / 2, .13, point.z + normal.z * width / 2,
                        point.x - normal.x * width / 2, .13, point.z - normal.z * width / 2
                    );
                    if (index < sampleCount) {
                        const vertex = index * 2;
                        indices.push(vertex, vertex + 2, vertex + 1, vertex + 2, vertex + 3, vertex + 1);
                    }
                });
                const pathGeometry = new THREE.BufferGeometry();
                pathGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                pathGeometry.setIndex(indices);
                pathGeometry.computeVertexNormals();
                scene.add(new THREE.Mesh(pathGeometry, M.pathBlue));

                const pathLength = curve.getLength();
                const edgeStep = .9;
                let edgeIndex = 0;
                for (let distance = 0; distance < pathLength; distance += edgeStep) {
                    const startT = distance / pathLength;
                    const endT = Math.min(1, (distance + edgeStep) / pathLength);
                    const start = curve.getPointAt(startT);
                    const end = curve.getPointAt(endT);
                    const tangent = curve.getTangentAt((startT + endT) / 2).normalize();
                    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
                    const angle = -Math.atan2(tangent.z, tangent.x);
                    const edgeLength = start.distanceTo(end) + .08;
                    const side = -1;
                    const edge = box(scene, edgeLength, .045, .42,
                        (start.x + end.x) / 2 + normal.x * side * (width / 2 + .16),
                        .17,
                        (start.z + end.z) / 2 + normal.z * side * (width / 2 + .16),
                        edgeIndex % 2 ? M.concreteDark : M.white, false);
                    edge.rotation.y = angle;
                    edgeIndex++;
                }

                for (let distance = 2.2; distance < pathLength - .8; distance += 4.5) {
                    const t = distance / pathLength;
                    const point = curve.getPointAt(t);
                    const tangent = curve.getTangentAt(t).normalize();
                    const chevron = new THREE.Group();
                    chevron.position.set(point.x, 0, point.z);
                    chevron.rotation.y = -Math.atan2(tangent.z, tangent.x) + Math.PI;
                    for (const side of [-1, 1]) {
                        const bar = box(chevron, 1.85, .045, .16,
                            .1, .19, side * .3, M.white, false);
                        bar.rotation.y = side * -.37;
                    }
                    scene.add(chevron);
                }
            }

            function chevronLWalkway(points, width) {
                const [start, corner, end] = points.map(([x, z]) => new THREE.Vector2(x, z));
                const firstDirection = corner.clone().sub(start).normalize();
                const secondDirection = end.clone().sub(corner).normalize();
                if (Math.abs(firstDirection.dot(secondDirection)) > .02) {
                    throw new Error('Chevron L walkway segments must meet at a right angle');
                }
                const firstNormal = new THREE.Vector2(-firstDirection.y, firstDirection.x);
                const secondNormal = new THREE.Vector2(-secondDirection.y, secondDirection.x);
                const halfWidth = width / 2;
                const offsetPoint = (point, normal, scale) =>
                    point.clone().addScaledVector(normal, scale * halfWidth);
                const outline = [
                    offsetPoint(start, firstNormal, 1),
                    corner.clone().addScaledVector(firstNormal, halfWidth)
                        .addScaledVector(secondNormal, halfWidth),
                    offsetPoint(end, secondNormal, 1),
                    offsetPoint(end, secondNormal, -1),
                    corner.clone().addScaledVector(firstNormal, -halfWidth)
                        .addScaledVector(secondNormal, -halfWidth),
                    offsetPoint(start, firstNormal, -1)
                ];
                const shape = new THREE.Shape();
                shape.moveTo(outline[0].x, -outline[0].y);
                outline.slice(1).forEach(point => shape.lineTo(point.x, -point.y));
                shape.closePath();
                const path = new THREE.Mesh(
                    new THREE.ShapeGeometry(shape),
                    M.pathBlue
                );
                path.rotation.x = -Math.PI / 2;
                path.position.y = .13;
                scene.add(path);

                for (const [from, to] of [[start, corner], [corner, end]]) {
                    const delta = to.clone().sub(from);
                    const length = delta.length();
                    const tangent = delta.normalize();
                    const normal = new THREE.Vector2(-tangent.y, tangent.x);
                    for (const side of [-1, 1]) {
                        const edgeCenter = from.clone().add(to).multiplyScalar(.5)
                            .addScaledVector(normal, side * (halfWidth - .09));
                        const edge = box(scene, length, .045, .12,
                            edgeCenter.x, .17, edgeCenter.y, M.white, false);
                        edge.rotation.y = -Math.atan2(tangent.y, tangent.x);
                    }

                    const stripeRotation = -Math.atan2(tangent.y, tangent.x) + Math.PI / 4;
                    for (const side of [-1, 1]) {
                        for (let distance = .9; distance < length - .5; distance += 1.25) {
                            const stripeCenter = from.clone().addScaledVector(tangent, distance)
                                .addScaledVector(normal, side * (halfWidth + .48));
                            const stripe = box(scene, 1.05, .045, .14,
                                stripeCenter.x, .18, stripeCenter.y, M.white, false);
                            stripe.rotation.y = stripeRotation;
                        }
                    }
                }

                for (const [from, to] of [[start, corner], [corner, end]]) {
                    const delta = to.clone().sub(from);
                    const length = delta.length();
                    const tangent = delta.normalize();
                    for (let distance = 2.2; distance < length - 2.2; distance += 4.5) {
                        const point = from.clone().addScaledVector(tangent, distance);
                        const chevron = new THREE.Group();
                        chevron.position.set(point.x, 0, point.y);
                        chevron.rotation.y = -Math.atan2(tangent.y, tangent.x) + Math.PI;
                        for (const side of [-1, 1]) {
                            const bar = box(chevron, 1.85, .045, .16,
                                .1, .19, side * .3, M.white, false);
                            bar.rotation.y = side * -.37;
                        }
                        scene.add(chevron);
                    }
                }
            }

            function curvedCrossing(points, width = 4.8) {
                const curve = new THREE.CatmullRomCurve3(
                    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
                    false, 'centripetal'
                );
                const length = curve.getLength();
                const sampleCount = Math.max(24, Math.ceil(length / 1.1));
                const positions = [];
                const indices = [];
                for (let index = 0; index <= sampleCount; index++) {
                    const t = index / sampleCount;
                    const point = curve.getPointAt(t);
                    const tangent = curve.getTangentAt(t).normalize();
                    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
                    positions.push(
                        point.x + normal.x * width / 2, .14, point.z + normal.z * width / 2,
                        point.x - normal.x * width / 2, .14, point.z - normal.z * width / 2
                    );
                    if (index < sampleCount) {
                        const vertex = index * 2;
                        indices.push(vertex, vertex + 2, vertex + 1, vertex + 2, vertex + 3, vertex + 1);
                    }
                }
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                geometry.setIndex(indices);
                geometry.computeVertexNormals();
                scene.add(new THREE.Mesh(geometry, M.canopyGlass));

                for (let distance = 1.1; distance < length - .6; distance += 1.45) {
                    const t = distance / length;
                    const point = curve.getPointAt(t);
                    const tangent = curve.getTangentAt(t).normalize();
                    const stripe = box(scene, .5, .04, width - .35,
                        point.x, .19, point.z, M.white, false);
                    stripe.rotation.y = -Math.atan2(tangent.z, tangent.x);
                }
            }

            function updateEditableBounds(group) {
                group.updateWorldMatrix(true, true);
                group.userData.editorBounds = new THREE.Box3().setFromObject(group).expandByScalar(.18);
                activityObstacleRevision++;
                renderer.shadowMap.needsUpdate = true;
            }

            function unregisterPickMeshes(group) {
                group.traverse(obj => {
                    if (!(obj.isMesh || obj.isLine || obj.isSprite)) return;
                    let index = meshesToPick.indexOf(obj);
                    while (index !== -1) {
                        meshesToPick.splice(index, 1);
                        index = meshesToPick.indexOf(obj);
                    }
                });
            }

            function setEditorRenderMode(group, mode) {
                if (!group || !['front', 'back'].includes(mode)) return;
                group.traverse(object => {
                    if (!(object.isMesh || object.isLine || object.isLineSegments || object.isSprite)) return;
                    if (mode === 'front') {
                        if (editorRenderModeStates.has(object)) return;
                        const originalMaterial = object.material;
                        const frontMaterial = Array.isArray(originalMaterial)
                            ? originalMaterial.map(material => material.clone())
                            : originalMaterial.clone();
                        const materials = Array.isArray(frontMaterial) ? frontMaterial : [frontMaterial];
                        materials.forEach(material => {
                            material.depthTest = false;
                            material.depthWrite = false;
                        });
                        editorRenderModeStates.set(object, {
                            material: originalMaterial,
                            renderOrder: object.renderOrder,
                            frontMaterial
                        });
                        object.material = frontMaterial;
                        object.renderOrder = 1000;
                    } else {
                        const state = editorRenderModeStates.get(object);
                        if (!state) return;
                        object.material = state.material;
                        object.renderOrder = state.renderOrder;
                        const materials = Array.isArray(state.frontMaterial)
                            ? state.frontMaterial : [state.frontMaterial];
                        materials.forEach(material => material.dispose());
                        editorRenderModeStates.delete(object);
                    }
                });
                if (group.userData.editor) group.userData.editor.renderMode = mode;
            }

            function registerEditable(group, {
                id, type, label, builtin = true, collidable = true, sourceId = null, cuttable = false,
                asset = null
            }) {
                if (!group || !id) return group;
                group.name = label || id;
                group.userData.editor = {
                    id, type, label: label || id, builtin, collidable, sourceId, cuttable, renderMode: 'back',
                    baseY: group.position.y,
                    ...(asset ? { asset: structuredClone(asset) } : {})
                };
                if (builtin) builtinTemplates.set(id, group);
                if (builtin && deletedBuiltinObjects.has(id)) {
                    unregisterPickMeshes(group);
                    group.removeFromParent();
                    return group;
                }
                const saved = storedEditorLayout.objects?.[id];
                if (saved) {
                    group.position.set(saved.position.x, saved.position.y, saved.position.z);
                    group.rotation.set(saved.rotation.x, saved.rotation.y, saved.rotation.z);
                    group.scale.set(saved.scale.x, saved.scale.y, saved.scale.z);
                    group.userData.editor.baseY = saved.position.y;
                    if (saved.label) group.userData.editor.label = group.name = saved.label;
                }
                group.traverse(obj => {
                    if (!(obj.isMesh || obj.isLine || obj.isSprite)) return;
                    obj.userData.editRoot = group;
                    obj.userData.info ||= {
                        title: label || id,
                        description: 'วัตถุที่สามารถย้าย หมุน ทำสำเนา หรือลบได้ในโหมดแก้ไข'
                    };
                    if (!meshesToPick.includes(obj)) meshesToPick.push(obj);
                });
                editableObjects.set(id, group);
                if (saved?.renderMode === 'front') setEditorRenderMode(group, 'front');
                updateEditableBounds(group);
                return group;
            }

            function beam(parent, a, b, r, mat) {
                const start = new THREE.Vector3(...a);
                const end = new THREE.Vector3(...b);
                const mesh = new THREE.Mesh(
                    new THREE.CylinderGeometry(r, r, start.distanceTo(end), 6), mat
                );
                mesh.position.copy(start).add(end).multiplyScalar(.5);
                mesh.quaternion.setFromUnitVectors(
                    new THREE.Vector3(0, 1, 0), end.sub(start).normalize()
                );
                mesh.castShadow = true;
                parent.add(mesh);
                return mesh;
            }

            function textTexture(text, options = {}) {
                const canvas = document.createElement('canvas');
                canvas.width = 1024;
                canvas.height = 160;
                const ctx = canvas.getContext('2d');
                if (options.background) {
                    ctx.fillStyle = options.background;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
                ctx.fillStyle = options.color || '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = 'bold ' + (options.size || 66) + 'px Tahoma,Arial,sans-serif';
                if (!options.background) {
                    ctx.shadowColor = '#102a4c';
                    ctx.shadowBlur = 13;
                }
                ctx.fillText(text, 512, 82, 970);
                const texture = new THREE.CanvasTexture(canvas);
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
                return texture;
            }

            function label(text, x, y, z, width = 19) {
                const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
                    map: textTexture(text), depthTest: false, depthWrite: false
                }));
                sprite.position.set(x, y, z);
                sprite.scale.set(width, width * .15625, 1);
                sprite.renderOrder = 10;
                if (text) labelGroup.add(sprite);
            }

            function sign(parent, text, x, y, z, w = 15, h = 1.9, options = {}) {
                const bgColor = options.background || '#eff3ed';
                const textColor = options.color || '#174d81';
                const fontSize = options.fontSize || 56;
                const mesh = new THREE.Mesh(
                    new THREE.PlaneGeometry(w, h),
                    new THREE.MeshBasicMaterial({
                        map: textTexture(text, { background: bgColor, color: textColor, size: fontSize })
                    })
                );
                mesh.position.set(x, y, z);
                if (options.rotationY) mesh.rotation.y = options.rotationY;
                parent.add(mesh);
                return mesh;
            }

            // Multi-line company sign reconstructed from the photographed facade.
            function tdkSign(parent, x, y, z, w = 20, h = 3, rotY = 0) {
                const canvas = document.createElement('canvas');
                canvas.width = 1400;
                canvas.height = 256;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#f4f5f2';
                ctx.fillRect(0, 0, 1400, 256);
                ctx.strokeStyle = '#c7d0d4';
                ctx.lineWidth = 8;
                ctx.strokeRect(4, 4, 1392, 248);
                ctx.fillStyle = '#0b4e8b';
                ctx.font = '900 italic 102px Arial,sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText('TDK', 35, 145);
                ctx.fillStyle = '#173c5d';
                ctx.font = 'bold 27px Tahoma,Arial,sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText('บริษัท ที.ดี.เค. อินดัสเตรียล จำกัด', 265, 78);
                ctx.font = 'bold 49px Arial,sans-serif';
                ctx.fillText('T.D.K. INDUSTRIAL CO., LTD.', 265, 143);
                ctx.fillStyle = '#263c50';
                ctx.font = 'bold 21px Arial,sans-serif';
                ctx.fillText('Precision · Innovation', 1095, 92);
                ctx.fillText('Technology & Future', 1095, 127);
                ctx.fillStyle = '#0a4d8c';
                ctx.fillRect(28, 184, 1344, 7);
                const texture = new THREE.CanvasTexture(canvas);
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
                const mesh = new THREE.Mesh(
                    new THREE.PlaneGeometry(w, h),
                    new THREE.MeshBasicMaterial({ map: texture })
                );
                mesh.name = 'TDK company sign';
                mesh.position.set(x, y, z);
                if (rotY) mesh.rotation.y = rotY;
                parent.add(mesh);
                return mesh;
            }

            function storeFlag(parent, x, z, height, style) {
                const canvas = document.createElement('canvas');
                canvas.width = 300;
                canvas.height = 180;
                const ctx = canvas.getContext('2d');
                if (style === 'thai') {
                    const colors = ['#da1f35', '#ffffff', '#243e8f', '#ffffff', '#da1f35'];
                    const proportions = [1, 1, 2, 1, 1];
                    let y = 0;
                    colors.forEach((color, index) => {
                        const bandHeight = canvas.height * proportions[index] / 6;
                        ctx.fillStyle = color;
                        ctx.fillRect(0, y, canvas.width, bandHeight);
                        y += bandHeight;
                    });
                } else {
                    ctx.fillStyle = '#f7f8f6';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = '#164d83';
                    ctx.font = '900 italic 82px Arial,sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('TDK', canvas.width / 2, canvas.height / 2);
                    ctx.fillRect(0, canvas.height - 15, canvas.width, 15);
                }
                const texture = new THREE.CanvasTexture(canvas);
                texture.colorSpace = THREE.SRGBColorSpace;
                const flag = new THREE.Mesh(
                    new THREE.PlaneGeometry(1.55, .93),
                    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
                );
                flag.position.set(x + .78, height - .7, z + .04);
                parent.add(flag);

                cyl(parent, .065, .065, height, x, height / 2, z, M.frame, 10);
                cyl(parent, .1, .1, .14, x, .07, z, M.concreteDark, 10);
                const finial = new THREE.Mesh(new THREE.SphereGeometry(.11, 8, 6), M.paleRoof);
                finial.position.set(x, height + .07, z);
                parent.add(finial);
            }

            // White picket fence builder
            function picketFence(x1, z1, x2, z2, fenceHeight = 1.2) {
                const dx = x2 - x1;
                const dz = z2 - z1;
                const length = Math.hypot(dx, dz);
                const group = new THREE.Group();
                group.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
                group.rotation.y = -Math.atan2(dz, dx);
                scene.add(group);
                // Top and bottom horizontal rails
                box(group, length, .06, .06, 0, fenceHeight * .3, 0, M.picketWhite, false);
                box(group, length, .06, .06, 0, fenceHeight * .75, 0, M.picketWhite, false);
                // Vertical pickets
                const spacing = .45;
                for (let x = -length / 2 + .15; x < length / 2; x += spacing) {
                    // Pointed top picket
                    box(group, .08, fenceHeight, .06, x, fenceHeight / 2, 0, M.picketWhite, false);
                    // Pointed tip
                    const tip = new THREE.Mesh(
                        new THREE.ConeGeometry(.055, .12, 4),
                        M.picketWhite
                    );
                    tip.position.set(x, fenceHeight + .06, 0);
                    group.add(tip);
                }
                // Posts every ~3m
                for (let x = -length / 2; x <= length / 2; x += 3) {
                    box(group, .12, fenceHeight + .15, .1, x, (fenceHeight + .15) / 2, 0, M.picketWhite, false);
                }
                return group;
            }

            // Wooden pavilion / gazebo builder
            function woodenPavilion(x, z, w = 5, d = 4, h = 3.5) {
                const group = new THREE.Group();
                group.position.set(x, 0, z);
                scene.add(group);
                // Floor platform
                box(group, w + .6, .35, d + .6, 0, .18, 0, M.wood);
                // 4 corner posts
                for (const px of [-w / 2 + .2, w / 2 - .2]) {
                    for (const pz of [-d / 2 + .2, d / 2 - .2]) {
                        box(group, .2, h, .2, px, h / 2 + .35, pz, M.wood);
                    }
                }
                // Horizontal beams at top
                box(group, w, .15, .15, 0, h + .2, -d / 2 + .2, M.wood, false);
                box(group, w, .15, .15, 0, h + .2, d / 2 - .2, M.wood, false);
                box(group, .15, .15, d, -w / 2 + .2, h + .2, 0, M.wood, false);
                box(group, .15, .15, d, w / 2 - .2, h + .2, 0, M.wood, false);
                // Gable roof (A-frame)
                const roofRise = 1.5;
                const roofW = w + 1.2;
                const roofD = d + .8;
                const roofRun = roofW / 2;
                const roofSlopeLength = Math.hypot(roofRun, roofRise);
                const roofEaveY = h + .35;
                // Left slope
                const slopeL = box(group, roofSlopeLength, .12, roofD, -roofRun / 2, roofEaveY + roofRise / 2, 0, M.woodRoof);
                slopeL.rotation.z = Math.atan2(roofRise, roofRun);
                // Right slope
                const slopeR = box(group, roofSlopeLength, .12, roofD, roofRun / 2, roofEaveY + roofRise / 2, 0, M.woodRoof);
                slopeR.rotation.z = -Math.atan2(roofRise, roofRun);
                // Ridge beam
                box(group, .16, .16, roofD, 0, roofEaveY + roofRise + .08, 0, M.woodDark, false);
                // Railing/balustrade
                for (const side of [-1, 1]) {
                    box(group, w - .4, .08, .08, 0, 1.1, side * (d / 2 - .2), M.wood, false);
                    box(group, .08, .08, d - .4, side * (w / 2 - .2), 1.1, 0, M.wood, false);
                }
                identify(group, 'ศาลาพักผ่อน', 'ศาลาไม้สำหรับพักผ่อนของพนักงาน');
                return group;
            }

            // Blue water tank
            function waterTank(x, z, radius = .8, h = 2) {
                const group = new THREE.Group();
                group.position.set(x, 0, z);
                scene.add(group);
                const tankMat = new THREE.MeshStandardMaterial({
                    color: '#2255aa', roughness: .35, metalness: .3
                });
                cyl(group, radius, radius, h, 0, h / 2 + .1, 0, tankMat, 16);
                // Lid
                const lid = new THREE.Mesh(
                    new THREE.CylinderGeometry(radius + .05, radius + .05, .12, 16),
                    M.dark
                );
                lid.position.set(0, h + .16, 0);
                group.add(lid);
                return group;
            }

            // Blue storage crate
            function blueCrate(x, z, rotY = 0) {
                const group = new THREE.Group();
                group.position.set(x, 0, z);
                group.rotation.y = rotY;
                scene.add(group);
                box(group, 1.2, .9, .9, 0, .55, 0, M.blueBox);
                // Pallet underneath
                box(group, 1.3, .12, 1, 0, .06, 0, M.wood, false);
                return group;
            }

            function blueCabinet(x, z, rotY = 0) {
                const group = new THREE.Group();
                group.position.set(x, 0, z);
                group.rotation.y = rotY;
                scene.add(group);
                box(group, 1.45, 2.15, .85, 0, 1.12, 0, M.blueBox);
                box(group, 1.34, .04, .05, 0, 1.14, .45, M.frame, false);
                for (const side of [-1, 1]) {
                    box(group, .05, 1.9, .04, side * .68, 1.12, .45, M.frame, false);
                    box(group, .08, .3, .07, side * .18, 1.18, .48, M.chrome, false);
                }
                box(group, 1.55, .13, .95, 0, .07, 0, M.dark);
                return group;
            }

            function snackBooth(x, z, rotY = 0) {
                const group = new THREE.Group();
                group.position.set(x, 0, z);
                group.rotation.y = rotY;
                scene.add(group);
                box(group, 6, 3, 4, 0, 1.7, 0, M.containerYellow);
                box(group, 6.5, .15, 4.5, 0, 3.25, 0, M.roofDark);
                box(group, 6.1, .4, 4.1, 0, .2, 0, M.dark);
                box(group, 2.5, 1.4, .08, 0, 2, 2.05, M.glassBlue, false);
                box(group, 1.5, 1.4, .08, -1.8, 2, 2.05, M.glassBlue, false);
                box(group, 1.2, 2.2, .08, 2.2, 1.3, 2.05, M.dark, false);
                box(group, 1, .6, .5, 2.5, 2.5, -1.5, M.frame);
                identify(group, 'ร้านค้า / Canteen Booth', 'ตู้ร้านขนมและเครื่องดื่มที่สามารถย้ายได้');
                return group;
            }

            function blueContainerBooth(x, z, rotY = 0) {
                const group = new THREE.Group();
                group.position.set(x, 0, z);
                group.rotation.y = rotY;
                scene.add(group);
                box(group, 10, 3.2, 4, 0, 1.8, 0, M.containerBlue);
                box(group, 10.4, .15, 4.4, 0, 3.45, 0, M.paleRoof);
                box(group, .06, 3.2, .06, -5, 1.6, 2, M.frame, false);
                box(group, .06, 3.2, .06, 5, 1.6, 2, M.frame, false);
                for (let xx = -4; xx < 5; xx += 2.5) {
                    box(group, 1.8, 1.2, .08, xx, 2.2, 2.02, M.glassBlue, false);
                }
                identify(group, 'ตู้สีน้ำเงิน', 'อาคารตู้คอนเทนเนอร์สำนักงานชั่วคราวที่สามารถย้ายได้');
                return group;
            }

            function roadSegment(x, z) {
                const group = new THREE.Group();
                group.position.set(x, 0, z);
                scene.add(group);
                box(group, 14, .12, 6, 0, .06, 0, M.asphalt, false);
                for (const edge of [-2.62, 2.62]) {
                    box(group, 13.7, .025, .12, 0, .135, edge, M.white, false);
                }
                for (let markerX = -5.5; markerX <= 5.5; markerX += 2.75) {
                    box(group, 1.45, .03, .13, markerX, .14, 0, M.yellow, false);
                }
                identify(group, 'ถนนสำเร็จรูป', 'ช่วงถนนที่เพิ่มใหม่ สามารถย้าย หมุน และต่อกันได้');
                return group;
            }

            function roadSign(x, z) {
                const group = new THREE.Group();
                group.position.set(x, 0, z);
                scene.add(group);
                cyl(group, .07, .09, 3.2, 0, 1.6, 0, M.frame, 10);
                box(group, 3.05, 1.65, .13, 0, 3.15, 0, M.officeBlue, false);
                sign(group, 'SLOW · 20', 0, 3.15, .071, 2.8, 1.4, {
                    background: '#ffffff', color: '#1556a5', fontSize: 64
                });
                box(group, .55, .18, .55, 0, .09, 0, M.concreteDark, false);
                identify(group, 'ป้ายจราจร', 'ป้ายจำกัดความเร็วสำหรับถนนภายในโรงงาน');
                return group;
            }

            function spiritHouse(x, z) {
                const group = new THREE.Group();
                group.position.set(x, 0, z);
                scene.add(group);
                const gold = material('#d7a92f', .38, .38);
                const shrineRed = material('#9f342c', .52, .12);
                box(group, 2.8, .28, 2.8, 0, .14, 0, M.concreteLight);
                box(group, 1.15, 1.55, 1.15, 0, 1.02, 0, shrineRed);
                box(group, 2.25, .22, 2.25, 0, 1.85, 0, gold);
                for (const px of [-.78, .78]) {
                    for (const pz of [-.78, .78]) cyl(group, .09, .11, 1.45, px, 1.08, pz, gold, 8);
                }
                const roofLower = new THREE.Mesh(new THREE.ConeGeometry(1.75, .9, 4), shrineRed);
                roofLower.position.y = 2.42;
                roofLower.rotation.y = Math.PI / 4;
                group.add(roofLower);
                const roofUpper = new THREE.Mesh(new THREE.ConeGeometry(1.15, .72, 4), gold);
                roofUpper.position.y = 3.05;
                roofUpper.rotation.y = Math.PI / 4;
                group.add(roofUpper);
                const finial = new THREE.Mesh(new THREE.ConeGeometry(.16, .8, 8), gold);
                finial.position.y = 3.72;
                group.add(finial);
                identify(group, 'ศาลพระภูมิ', 'ศาลขนาดเล็กสำหรับจัดวางในพื้นที่ภูมิทัศน์ของโรงงาน');
                return group;
            }

            // Flagpole with Thai flag
            function flagpole(x, z, height = 9) {
                cyl(scene, .06, .1, height, x, height / 2, z, M.frame, 8);
                // Ball on top
                const ball = new THREE.Mesh(
                    new THREE.SphereGeometry(.12, 8, 6), M.frame
                );
                ball.position.set(x, height, z);
                scene.add(ball);
                // Thai flag (red-white-blue-white-red stripes)
                const flagW = 2.2;
                const flagH = 1.4;
                const flagGroup = new THREE.Group();
                flagGroup.position.set(x + flagW / 2 + .1, height - .3, z);
                scene.add(flagGroup);
                const stripeH = flagH / 6;
                box(flagGroup, flagW, stripeH, .02, 0, stripeH * 2.5, 0, M.flagRed, false);
                box(flagGroup, flagW, stripeH, .02, 0, stripeH * 1.5, 0, M.flagWhite, false);
                box(flagGroup, flagW, stripeH * 2, .02, 0, 0, 0, M.flagBlue, false);
                box(flagGroup, flagW, stripeH, .02, 0, -stripeH * 1.5, 0, M.flagWhite, false);
                box(flagGroup, flagW, stripeH, .02, 0, -stripeH * 2.5, 0, M.flagRed, false);
            }

            function identify(group, title, description) {
                group.traverse(obj => {
                    if (obj.isMesh) {
                        obj.userData.info = { title, description };
                        meshesToPick.push(obj);
                    }
                });
            }

            // ------------------------------------------------------------
            // Site, fields, pavement and drainage
            // ------------------------------------------------------------
            const grassCanvas = document.createElement('canvas');
            grassCanvas.width = grassCanvas.height = 256;
            const grassCtx = grassCanvas.getContext('2d');
            grassCtx.fillStyle = '#748952';
            grassCtx.fillRect(0, 0, 256, 256);
            for (let i = 0; i < 16000; i++) {
                grassCtx.fillStyle = [
                    '#879758', '#687c45', '#91a164', '#566e3f', '#788d4e'
                ][Math.floor(rand() * 5)];
                grassCtx.fillRect(rand() * 256, rand() * 256, 1 + rand() * 3, 1 + rand() * 3);
            }
            const grassMap = new THREE.CanvasTexture(grassCanvas);
            grassMap.colorSpace = THREE.SRGBColorSpace;
            grassMap.wrapS = grassMap.wrapT = THREE.RepeatWrapping;
            grassMap.repeat.set(35, 35);
            const grassMat = new THREE.MeshStandardMaterial({
                map: grassMap, roughness: 1
            });

            box(scene, 700, .6, 700, 0, -.9, 0, grassMat, false);

            const mountainGeometry = new THREE.BufferGeometry();
            const mountainLevels = [
                [0, 1], [.04, .99], [.14, .92], [.27, .79], [.42, .64],
                [.57, .48], [.72, .34], [.84, .22], [.93, .11], [.98, .045]
            ];
            const mountainSegments = 16;
            const mountainPositions = [];
            const mountainIndices = [];
            for (const [height, radius] of mountainLevels) {
                for (let segment = 0; segment < mountainSegments; segment++) {
                    const angle = segment / mountainSegments * Math.PI * 2;
                    const ridge = 1 + .1 * Math.sin(angle * 3 + .4) + .04 * Math.sin(angle * 7);
                    mountainPositions.push(
                        Math.cos(angle) * radius * ridge,
                        height * (1 + .025 * Math.sin(angle * 4)),
                        Math.sin(angle) * radius * ridge
                    );
                }
            }
            for (let level = 0; level < mountainLevels.length - 1; level++) {
                for (let segment = 0; segment < mountainSegments; segment++) {
                    const current = level * mountainSegments + segment;
                    const next = level * mountainSegments + (segment + 1) % mountainSegments;
                    const upper = current + mountainSegments;
                    const upperNext = next + mountainSegments;
                    mountainIndices.push(current, upper, next, next, upper, upperNext);
                }
            }
            const peakIndex = mountainPositions.length / 3;
            mountainPositions.push(-.08, 1, .06);
            const lastRing = (mountainLevels.length - 1) * mountainSegments;
            for (let segment = 0; segment < mountainSegments; segment++) {
                mountainIndices.push(
                    lastRing + segment,
                    peakIndex,
                    lastRing + (segment + 1) % mountainSegments
                );
            }
            mountainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(mountainPositions, 3));
            mountainGeometry.setIndex(mountainIndices);
            mountainGeometry.computeVertexNormals();
            const mountainColors = [];
            const foothillColor = new THREE.Color('#71894b');
            const rockColor = new THREE.Color('#77796d');
            for (let index = 0; index < mountainPositions.length; index += 3) {
                const height = mountainPositions[index + 1];
                const color = foothillColor.clone().lerp(rockColor, THREE.MathUtils.smoothstep(height, .52, .9));
                mountainColors.push(color.r, color.g, color.b);
            }
            mountainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(mountainColors, 3));
            const mountain = new THREE.Mesh(
                mountainGeometry,
                new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })
            );
            mountain.name = 'ภูเขาหลัก';
            mountain.position.set(-12, -.6, -255);
            mountain.scale.set(112, 82, 58);
            mountain.castShadow = true;
            mountain.receiveShadow = true;
            mountain.userData.info = {
                title: 'ภูเขาหลัก',
                description: 'ภูเขาจำลองหนึ่งลูกเป็นฉากหลังของพื้นที่โรงงาน'
            };
            scene.add(mountain);

            box(scene, 157, .75, 166, 0, -.38, -5, M.concrete, false);

            // Concrete zones follow the aerial image: open central court, loading alleys,
            // service road at the right and the front entrance apron.
            box(scene, 67, .055, 71, -20, .02, 26, M.concreteLight, false);
            box(scene, 17, .055, 155, 70.8, .02, -5, M.concreteDark, false);
            box(scene, 83, .055, 15, 18, .028, -1, M.concreteLight, false);
            box(scene, 25, .055, 31, -17, .03, 65, M.concreteLight, false);

            // Fine slab joints make the courtyard read as poured concrete rather than a flat plane.
            for (let x = -64; x < 69; x += 8) box(scene, .055, .018, 151, x, .072, -5, M.concreteDark, false);
            for (let z = -78; z < 75; z += 8) box(scene, 145, .018, .055, 0, .074, z, M.concreteDark, false);

            // Perimeter curbs and drainage.
            for (const x of [-78, 78]) {
                box(scene, .48, .34, 166, x, .12, -5, M.curb, false);
                box(scene, .8, .06, 160, x - Math.sign(x) * 1.15, .025, -5, M.dark, false);
            }
            for (const z of [-88, 78]) {
                box(scene, 157, .34, .48, 0, .12, z, M.curb, false);
            }

            // Only a short approach remains at the lower-left gate. The rest of the
            // frontage reveals the grass field instead of a full-width highway.
            stripBetween(scene, -104, 96, -21, 80.5, 12, -.15, M.asphalt, .06);

            // Circulation roads and drains.
            ROADS.forEach((road, index) => stripBetween(
                scene, toRender(road.from[0]), toRender(road.from[1]), toRender(road.to[0]), toRender(road.to[1]), toRender(road.width),
                .075 + index * .002, road.id === 'entry' ? M.asphalt : M.concreteDark
            ));
            for (let z = -70; z < 70; z += 5.5) box(scene, .58, .035, 1.55, 72.2, .12, z, M.drain, false);

            // Blue directional pedestrian route links the office canopy to the entry-side road.
            WALKWAYS.forEach(walkway => {
                const points = walkway.points.map(point => point.map(toRender));
                const width = toRender(walkway.width);
                if (walkway.type === 'crossing') curvedCrossing(points, width);
                else if (walkway.type === 'blue-link') blueWalkwayLink(points, width);
                else if (walkway.type === 'straight-crossing') straightCrossing(points, width);
                else if (walkway.type === 'chevron-l') chevronLWalkway(points, width);
                else chevronWalkway(points, width);
            });

            // ------------------------------------------------------------
            // Curved industrial roofs
            // ------------------------------------------------------------
            function roofHeight(x, w, eave, rise) {
                const t = Math.min(1, Math.abs(x) / (w / 2));
                return eave + rise * (1 - t * t);
            }

            function roofPatch(parent, w, eave, rise, x1, x2, z1, z2, mat, lift = 0) {
                const count = Math.max(2, Math.ceil((x2 - x1) * 2));
                const positions = [];
                const indices = [];
                for (let i = 0; i <= count; i++) {
                    const x = x1 + (x2 - x1) * i / count;
                    const y = roofHeight(x, w, eave, rise) + lift;
                    positions.push(x, y, z1, x, y, z2);
                }
                for (let i = 0; i < count; i++) {
                    const n = i * 2;
                    indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
                }
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                geometry.setIndex(indices);
                geometry.computeVertexNormals();
                const mesh = new THREE.Mesh(geometry, mat);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                parent.add(mesh);
                return mesh;
            }

            function gable(parent, w, eave, rise, z, mat) {
                const shape = new THREE.Shape();
                shape.moveTo(-w / 2, eave - .2);
                for (let i = 0; i <= 48; i++) {
                    const x = -w / 2 + w * i / 48;
                    shape.lineTo(x, roofHeight(x, w, eave, rise));
                }
                shape.lineTo(w / 2, eave - .2);
                shape.closePath();
                const mesh = new THREE.Mesh(
                    new THREE.ShapeGeometry(shape),
                    new THREE.MeshStandardMaterial({
                        color: mat.color, roughness: .6, metalness: .2,
                        side: THREE.DoubleSide
                    })
                );
                mesh.position.z = z;
                mesh.castShadow = true;
                parent.add(mesh);
            }

            function awning(parent, x, z, w, d, y, roofMaterial = M.roof,
                supportMaterial = M.frame) {
                const top = box(parent, w, .16, d, x, y, z, roofMaterial);
                top.rotation.x = .055;
                for (let px = x - w / 2 + .6; px < x + w / 2; px += 5) {
                    cyl(parent, .08, .08, y, px, y / 2, z + d / 2 - .2,
                        supportMaterial, 8);
                }
            }

            function warehouse({
                id, name, x, z, w, d, h = 10, rise = 3, labelText = name, vent = true,
                rotationY = 0, skylightPattern = 'sparse', facade = {}, evidence = []
            }) {
                const profile = facade.type || 'store';
                const openShed = profile === 'rack';
                const group = new THREE.Group();
                group.name = id || name;
                group.position.set(x, 0, z);
                group.rotation.y = rotationY;
                scene.add(group);
                registerCollider(x, z, w, d, 1.05);

                box(group, w, .6, d, 0, .3, 0, M.base);
                if (openShed) {
                    for (const side of [-1, 1]) {
                        for (let zz = -d / 2; zz <= d / 2; zz += 5.2) {
                            box(group, .22, h, .22, side * (w / 2), h / 2 + .3, zz, M.frame);
                        }
                        box(group, .2, .28, d, side * (w / 2), h + .15, 0, M.blue);
                    }
                    for (let xx = -w / 2; xx <= w / 2; xx += 5.2) {
                        for (const endZ of [-d / 2, d / 2]) {
                            box(group, .22, h, .22, xx, h / 2 + .3, endZ, M.frame);
                        }
                    }
                    box(group, w, .32, .35, 0, h + .15, d / 2, M.blue);
                } else {
                    const isDoke2 = id === 'doke2_assy';
                    box(group, w, h, d, 0, h / 2 + .3, 0,
                        isDoke2 ? M.facadeBlueDark : M.wall);
                    const blueRatio = isDoke2 ? 0 : (facade.blueRatio || .42);
                    const blueHeight = h * blueRatio;
                    if (blueHeight > 0) {
                        box(group, w + .12, blueHeight, d + .12, 0,
                            .3 + h - blueHeight / 2, 0, M.blue);
                    }

                    // Deep projecting blue facade band seen on Doke 1 / Doke 2.
                    box(group, w + .55, .62, .48, 0, h * .72, d / 2 + .22, M.roofDark);
                    box(group, w + .55, .62, .48, 0, h * .72, -d / 2 - .22, M.roofDark);
                    box(group, w + .9, .22, .7, 0, h + .28, d / 2 + .28, M.blue);
                    if (isDoke2) {
                        for (const yy of [h * .22, h * .48, h * .74]) {
                            box(group, w + .8, .34, .68, 0, yy, d / 2 + .3, M.blue);
                        }
                        for (const xx of [-w * .3, w * .3]) {
                            box(group, w * .17, 3.6, .09, xx, 2.45, d / 2 + .36, M.dark, false);
                            for (let yy = 1.05; yy < 4.1; yy += .42) {
                                box(group, w * .17 - .3, .075, .14, xx, yy, d / 2 + .45,
                                    M.frame, false);
                            }
                        }
                    }

                    // Individual wall bays, windows, and structural columns.
                    for (let side of [-1, 1]) {
                        for (let zz = -d / 2 + 2; zz < d / 2; zz += 5) {
                            box(group, .18, h, .23, side * (w / 2 + .1), h / 2, zz,
                                id === 'doke2_assy' ? M.facadeBlueDark : M.frame);
                            // Doke 2 is a mostly solid corrugated blue hall in the reference;
                            // its dark openings belong under the front canopy, not along both sides.
                            if (id !== 'doke2_assy') {
                                box(group, .06, 1.15, 2.8, side * (w / 2 + .13), 3.5, zz, M.glass, false);
                                box(group, .08, .8, 2.15, side * (w / 2 + .16), 6.1, zz, M.glass, false);
                            }
                        }
                    }
                }

                const rw = w + 1.8;
                const rd = d + 1.6;
                const splitRackRoof = false;
                const roofMaterial = id.startsWith('doke1_') ? M.roofLightBlue : M.roof;
                const barrelZ1 = splitRackRoof ? -rd * .17 : -rd / 2;
                if (splitRackRoof) {
                    roofPatch(group, rw, h + .45, rise, -rw / 2, rw / 2,
                        -rd / 2, barrelZ1, M.roofDark);
                    const skylightZ2 = rd * .22;
                    roofPatch(group, rw, h + .45, rise, -rw / 2, rw / 2,
                        barrelZ1, skylightZ2, M.skylight, .04);
                    roofPatch(group, rw, h + .45, rise, -rw / 2, rw / 2,
                        skylightZ2, rd / 2, M.roof);
                    // The open rack bays remain visible through the translucent roof section.
                    gable(group, rw, h + .45, rise, rd / 2, M.roof);
                    gable(group, rw, h + .45, rise, -rd / 2, M.roofDark);
                } else {
                    roofPatch(group, rw, h + .45, rise, -rw / 2, rw / 2, -rd / 2, rd / 2, roofMaterial);
                    gable(group, rw, h + .45, rise, rd / 2, roofMaterial);
                    gable(group, rw, h + .45, rise, -rd / 2, roofMaterial);
                }

                // Fine longitudinal standing seams.
                for (let xx = -rw / 2 + .45; xx < rw / 2; xx += 1.05) {
                    const yy = roofHeight(xx, rw, h + .45, rise) + .045;
                    const seamDepth = rd / 2 - barrelZ1;
                    box(group, .055, .055, seamDepth, xx, yy,
                        barrelZ1 + seamDepth / 2, M.roofRib, false);
                }

                // Shallow arc joints across the long Doke 2 roof are prominent in the aerial photo.
                if (id === 'doke2_assy') {
                    for (let zz = -rd / 2 + 4.8; zz < rd / 2 - 2; zz += 7.4) {
                        roofPatch(group, rw, h + .45, rise,
                            -rw / 2 + .35, rw / 2 - .35, zz, zz + .08, M.roofSeam, .075);
                    }
                }

                // Roof lights vary by building; the front rack dome has transverse translucent bands.
                if (skylightPattern === 'centerBands') {
                    // Five narrow translucent strips match the photographed rack hall;
                    // the rest of the roof stays blue instead of becoming one white panel.
                    const bandCount = 5;
                    const bandWidth = .78;
                    const firstBandZ = -rd * .08;
                    const lastBandZ = rd / 2 - 2 - bandWidth;
                    const bandSpacing = (lastBandZ - firstBandZ) / (bandCount - 1);
                    for (let index = 0; index < bandCount; index++) {
                        const zz = firstBandZ + index * bandSpacing;
                        roofPatch(group, rw, h + .45, rise,
                            -rw / 2 + .5, rw / 2 - .5,
                            zz, zz + bandWidth, M.skylight, .08);
                    }
                } else if (skylightPattern !== 'vents' && skylightPattern !== 'none') {
                    const skylightStep = skylightPattern === 'dense' ? 6.4 : 11.5;
                    for (let zz = -d / 2 + 6; zz < d / 2 - 3; zz += skylightStep) {
                        roofPatch(group, rw, h + .45, rise, -rw / 2 + .45, rw / 2 - .45,
                            zz, zz + .45, M.skylight, .055);
                    }
                }

                // Gutters and downpipes.
                for (let side of [-1, 1]) {
                    box(group, .24, .25, rd, side * (rw / 2), h + .38, 0, M.roofDark);
                    for (let zz = -d / 2 + 1; zz < d / 2; zz += 15) {
                        cyl(group, .08, .08, h, side * (w / 2 + .3), h / 2, zz, M.frame, 8);
                    }
                }

                // Roof ridge ventilation housings.
                const ridgeY = h + .45 + rise;
                if (id === 'doke1_store' && vent) {
                    for (const monitor of [
                        { z: d * .24, length: 6.5 },
                        { z: -d * .24, length: 14.5 }
                    ]) {
                        const monitorHeight = 1.2;
                        const monitorBottom = ridgeY + .04;
                        box(group, 4.1, monitorHeight, monitor.length, 0,
                            monitorBottom + monitorHeight / 2, monitor.z, M.facadeBlueDark);
                        box(group, 4.35, .16, monitor.length + .25, 0,
                            monitorBottom + monitorHeight + .08, monitor.z, M.blue);
                    }
                } else if (id === 'doke2_assy') {
                    for (let zz = -d / 2 + 3.5; zz <= d / 2 - 3.5; zz += 5.5) {
                        cyl(group, .09, .09, .32, 0, ridgeY + .18, zz, M.chrome, 12);
                        cyl(group, .27, .19, .2, 0, ridgeY + .46, zz, M.chrome, 14);
                    }
                } else if (vent) {
                    for (const zz of [-d * .25, d * .23]) {
                        box(group, 4, .8, 7.5, 0, h + rise + .55, zz, M.roofDark);
                        box(group, 4.5, .17, 8, 0, h + rise + 1, zz, M.blue);
                    }
                } else if (!splitRackRoof) {
                    for (let zz = -d / 2 + 5; zz < d / 2; zz += 9) {
                        for (let xx = -w / 2 + 7; xx < w / 2; xx += 9) {
                            const yy = roofHeight(xx, rw, h + .45, rise);
                            cyl(group, .18, .23, .42, xx, yy + .22, zz, M.frame, 10);
                            cyl(group, .34, .22, .18, xx, yy + .48, zz, M.paleRoof, 12);
                        }
                    }
                }

                // The photographed halls have distinct fronts; do not repeat a dock pattern on every hall.
                const doorCount = facade.loadingDoors ?? 1;
                for (let i = 0; i < doorCount; i++) {
                    if (profile === 'store') continue;
                    const spacing = Math.min(7, (w - 5.5) / Math.max(1, doorCount));
                    const xx = (i - (doorCount - 1) / 2) * spacing;
                    box(group, 4.8, 4.5, .1, xx, 2.55, d / 2 + .09, M.dark);
                    box(group, 4.5, 3.8, .12, xx, 2.8, d / 2 + .17,
                        id === 'doke2_assy' ? M.dark : M.base, false);
                    for (let yy = 1.1; yy < 4.6; yy += .28) {
                        box(group, 4.4, .035, .03, xx, yy, d / 2 + .25, M.frame, false);
                    }
                    box(group, 5.15, .38, 2.2, xx, .28, d / 2 + 1.05, M.concreteDark);
                    box(group, .2, 1.05, .2, xx - 2.65, .54, d / 2 + 1.92, M.safety);
                    box(group, .2, 1.05, .2, xx + 2.65, .54, d / 2 + 1.92, M.safety);
                    for (const side of [-1, 1]) {
                        box(group, .18, .65, .22, xx + side * 2.28, 1.1, d / 2 + .38, M.rubber);
                    }
                    const lamp = box(group, .62, .16, .38, xx, 5.22, d / 2 + .48, M.white, false);
                    lamp.rotation.x = -.26;
                }

                if (profile === 'louvered') {
                    const frontZ = d / 2 + .22;

                    // Deep continuous shadow line and loading bays under the low blue canopy.
                    box(group, w - 1.15, 3.65, .18, 0, 2.35, frontZ + .06, M.bayShadow, false);
                    const bayStep = 5.15;
                    for (let xx = -w / 2 + .7; xx <= w / 2 - .7; xx += bayStep) {
                        box(group, .24, 4.35, .32, xx, 2.48, frontZ + .24,
                            M.facadeBlueDark);
                    }
                    let frontBay = 0;
                    for (let xx = -w / 2 + 3; xx < w / 2 - 2; xx += bayStep) {
                        if (Math.abs(xx) < 3) continue;
                        const panelMat = frontBay++ % 3 === 0 ? M.greenCrate : M.blueBox;
                        box(group, 3.55, 1.75, .3, xx, 1.28, frontZ + .27, panelMat);
                        for (const rib of [-1.05, 0, 1.05]) {
                            box(group, .075, 1.55, .06, xx + rib, 1.28, frontZ + .46, M.roofRib, false);
                        }
                    }

                    // The photographed facade has a broad mid-level fascia, then fine
                    // corrugation behind the centered company sign.
                    box(group, w + 1.05, .9, .62, 0, h * .48, frontZ + .28, M.facadeBlueDark);
                    for (let yy = h * .57; yy < h * .88; yy += .28) {
                        box(group, w - 1.7, .075, .13, 0, yy, frontZ + .13, M.roofRib, false);
                    }
                    awning(group, 0, d / 2 + 1.35, w + 1.2, 2.45,
                        h * .52, M.roofDark, M.facadeBlueDark);
                    if (id === 'doke2_assy') {
                        const signX = w / 2 - 6;
                        const signZ = d / 2 + 5.25;
                        const signWidth = 9.1;
                        const signHeight = 2.5;
                        const signPanelWidth = 8.7;
                        const signPanelHeight = 2.15;
                        const signFrame = material('#d8e0e3', .48, .18);
                        box(group, signWidth, signHeight, .32,
                            signX, 2.7, signZ, M.white);
                        box(group, signWidth + .12, .12, .4,
                            signX, 3.95, signZ, M.frame);
                        for (const side of [-1, 1]) {
                            box(group, .13, signHeight, .42,
                                signX + side * (signWidth / 2 - .06), 2.7, signZ, signFrame);
                            const support = box(group, .22, 1.9, .22,
                                signX + side * (signWidth / 2 - .42), .95, signZ, M.officeWhite);
                            support.name = `Doke 2 entrance TDK sign support ${side < 0 ? 'left' : 'right'}`;
                        }
                        const entranceSign = tdkSign(group, signX, 2.7, signZ + .18,
                            signPanelWidth, signPanelHeight);
                        entranceSign.name = 'Doke 2 entrance TDK sign';
                    }
                } else if (profile === 'rack') {
                    const frontZ = d / 2 + .18;

                    // Solid curved fascia and dark rack bays recreate the lower hall in the photo.
                    box(group, w + .95, 1.05, .52, 0, h - .08, frontZ + .16, M.facadeBlueDark);
                    box(group, .62, 1.0, d + .5, -w / 2 - .18, h - .1, 0, M.facadeBlueDark);
                    box(group, .62, 1.0, d + .5, w / 2 + .18, h - .1, 0, M.facadeBlueDark);

                    const bayStep = 5.2;
                    let rackBay = 0;
                    for (let xx = -w / 2 + 2.65; xx < w / 2 - 1.8; xx += bayStep) {
                        box(group, bayStep - .35, 4.55, .16, xx, 2.48, frontZ, M.bayShadow, false);
                        const panelMat = rackBay++ % 3 === 0 ? M.greenCrate : M.blueBox;
                        box(group, bayStep - .85, 2.15, .25, xx, 1.35, frontZ + .18, panelMat);
                        for (const rib of [-1.45, 0, 1.45]) {
                            box(group, .08, 1.92, .06, xx + rib, 1.35, frontZ + .35, M.roofRib, false);
                        }
                    }

                    let crateIndex = 0;
                    for (let xx = -w / 2 + 3; xx <= w / 2 - 3; xx += 5.2) {
                        for (let zz = -d / 2 + 2.4; zz <= d / 2 - 2.4; zz += 5.2) {
                            const crateMat = (crateIndex++ % 2) ? M.blueBox : M.greenCrate;
                            for (let tier = 0; tier < (crateIndex % 3 === 0 ? 3 : 2); tier++) {
                                const crateY = .85 + tier * 1.28;
                                box(group, 2.8, 1.12, 2.25, xx, crateY, zz, crateMat);
                                for (let rib = -1; rib <= 1; rib++) {
                                    box(group, .07, .96, .05, xx + rib * .7, crateY, zz + 1.14, M.roofRib, false);
                                }
                            }
                        }
                    }
                    awning(group, 0, d / 2 + 1.75, w + .7, 3.2, h - .28, M.roofDark);

                    // Rear stepped cap sits below Doke 2's canopy and travels with the rack group.
                    box(group, w * .82, .3, 4.6, 0, h * .75, -d / 2 - 1.65, M.roofDark);
                    box(group, w * .68, .16, 4.15, 0, h * .75 + .23, -d / 2 - 1.65, M.roof);
                } else if (profile === 'quiet') {
                    for (let xx = -w / 2 + 3; xx < w / 2 - 2; xx += 4.5) {
                        box(group, 3.1, .82, .11, xx, 2.4, d / 2 + .2, M.glass, false);
                    }
                    awning(group, w * .24, d / 2 + 1.3, w * .43, 2.8, 4.75);
                } else if (profile === 'store') {
                    const entranceX = w * .28;
                    for (let xx = -w / 2 + 3; xx < w / 2 - 2; xx += 4.5) {
                        if (Math.abs(xx + w * .18) < 2.8 || Math.abs(xx - entranceX) < 2.8) continue;
                        box(group, 3.1, .78, .11, xx, 2.25, d / 2 + .2, M.glass, false);
                    }
                    box(group, 4.35, 3.75, .16, entranceX, 2.2, d / 2 + .18, M.dark);
                    for (const side of [-1, 1]) {
                        box(group, .22, 4.05, .24, entranceX + side * 2.28, 2.2, d / 2 + .3, M.white);
                    }
                    box(group, 4.7, .28, .34, entranceX, 4.28, d / 2 + .28, M.blue);
                    awning(group, entranceX, d / 2 + 1.5, w * .48, 3.5, 5.1);

                    const screenX = -w * .16;
                    const screenZ = d / 2 + 2.5;
                    const screenFrame = material('#202a2d', .56, .12);
                    box(group, 3.95, 2.65, .18, screenX, 2.8, screenZ, screenFrame);
                    box(group, 3.7, 2.4, .045, screenX, 2.8, screenZ + .115,
                        new THREE.MeshBasicMaterial({ color: '#101820' }), false);
                    box(group, .34, 1.45, .34, screenX, .72, screenZ - .02, screenFrame);
                    box(group, .82, .14, .7, screenX, .07, screenZ - .02, screenFrame);

                    const flagLineZ = d / 2 + 4.1;
                    storeFlag(group, -2.45, flagLineZ, 10.1, 'company');
                    storeFlag(group, .2, flagLineZ, 11.2, 'thai');
                    storeFlag(group, 2.85, flagLineZ, 10.5, 'company');
                } else {
                    for (let xx = -w / 2 + 3; xx < w / 2 - 2; xx += 4.5) {
                        box(group, 3.1, .78, .11, xx, 2.25, d / 2 + .2, M.glass, false);
                    }
                    awning(group, 0, d / 2 + 1.5, w * .72, 3.5, 5.1);
                }

                if (facade.sign) {
                    if (id === 'doke1_store') {
                        // Mount the photographed sign high on the blue curved gable,
                        // with its top still below the roof arc at both ends.
                        tdkSign(group, 0, h + .45 + rise * .43, d / 2 + .9, 19.5, 3.55);
                    } else if (id === 'doke2_assy') {
                        const doke2FacadeSign = sign(group, 'DK  T.D.K. INDUSTRIAL CO., LTD.',
                            0, h + .45 + rise * .45, d / 2 + .9, Math.min(30, w * .78), 2.35,
                            { background: '#ffffff', color: '#0b4e8b', fontSize: 64 });
                        doke2FacadeSign.name = 'TDK company sign';
                    } else {
                        tdkSign(group, 0, h + .62, d / 2 + .43,
                            Math.min(22, w * .68), 2.2);
                    }
                }

                // Rear service canopy and utility doors make the long alleys read like the photo.
                box(group, w * .58, .18, 2.3, 0, 3.9, -d / 2 - 1.12, M.paleRoof);
                for (let xx = -w * .25; xx <= w * .25; xx += Math.max(5, w * .18)) {
                    cyl(group, .075, .075, 3.8, xx, 1.9, -d / 2 - 2.05, M.frame, 8);
                    box(group, 2.4, 2.7, .09, xx, 1.65, -d / 2 - .08, M.dark);
                }
                label(labelText, x, h + rise + 4, z, Math.max(15, w * .56));

                identify(group, name,
                    `หลังคาโลหะโค้งสีน้ำเงิน · facade ${profile} · อ้างอิง ${evidence.join(', ') || 'ภาพถ่าย'}`);
                return group;
            }

            // Building geometry is generated from the central layout table above.
            const warehouseLabels = {
                doke1_west: 'Doke 1', doke1_store: 'Store',
                doke2_assy: 'Doke 2', rack_dome: 'โดมเก็บแร็ค'
            };
            const warehouseGroups = {};
            BUILDINGS.filter(item => item.roof.type === 'barrel').forEach(item => {
                warehouseGroups[item.id] = warehouse({
                    id: item.id, name: item.name, labelText: warehouseLabels[item.id],
                    x: toRender(item.position.x), z: toRender(item.position.z),
                    w: toRender(item.size.width), d: toRender(item.size.depth), h: toRender(item.size.height),
                    rise: toRender(item.roof.rise), vent: item.vent, rotationY: item.rotationY,
                    skylightPattern: item.roof.skylight, facade: item.facade, evidence: item.evidence
                });
            });

            // Store loading canopy runs along the right-hand side where delivery trucks dock.
            const storeData = BUILDING_BY_ID.doke1_store;
            const storeGroup = warehouseGroups.doke1_store;
            const storeW = toRender(storeData.size.width);
            const storeD = toRender(storeData.size.depth);
            const storeCanopyX = storeW / 2 + 2.9;
            box(storeGroup, 5.9, .24, storeD * .76, storeCanopyX, 5.45, 1.2, M.paleRoof);
            box(storeGroup, 6.1, .12, storeD * .76, storeCanopyX, 5.62, 1.2, M.roofDark);
            for (let zz = -storeD * .34; zz <= storeD * .34; zz += 8.2) {
                cyl(storeGroup, .11, .11, 5.35, storeW / 2 + 5.35, 2.68, zz + 1.2, M.frame, 8);
            }

            // Covered connector between Doke 2 and the rear flat-roof zone of the rack dome.
            const doke2Data = BUILDING_BY_ID.doke2_assy;
            const rackData = BUILDING_BY_ID.rack_dome;
            const doke2FrontZ = toRender(doke2Data.position.z + doke2Data.size.depth / 2);
            const rackRearZ = toRender(rackData.position.z - rackData.size.depth / 2);
            const connectorDepth = Math.max(4, rackRearZ - doke2FrontZ + 1.1);
            const connectorZ = (doke2FrontZ + rackRearZ) / 2;
            const connectorX = toRender(rackData.position.x);
            const connectorWidth = toRender(rackData.size.width) * .72;
            box(scene, connectorWidth, .3, connectorDepth, connectorX, 6.65, connectorZ, M.roofDark);
            box(scene, connectorWidth - .7, .12, connectorDepth - .4, connectorX, 6.82, connectorZ, M.skylight);
            for (const xx of [connectorX - connectorWidth / 2 + .8, connectorX + connectorWidth / 2 - .8]) {
                for (const zz of [doke2FrontZ + .5, rackRearZ - .5]) {
                    cyl(scene, .11, .11, 6.55, xx, 3.28, zz, M.frame, 8);
                }
            }
            label('Assy Hanon', toRender(doke2Data.position.x + 9),
                toRender(doke2Data.size.height + doke2Data.roof.rise) + 4,
                toRender(doke2Data.position.z - 10), 18);

            // Connector roofs and covered loading areas.
            box(scene, 7, .24, 62, 17, 6.4, -40, M.paleRoof);
            for (let z = -68; z < -10; z += 8) {
                cyl(scene, .11, .11, 6.4, 17, 3.2, z, M.frame);
            }

            // Covered loading spine and dock lamps between the main halls.
            for (let z = -70; z < -12; z += 7.5) {
                cyl(scene, .08, .08, 6.2, 15.7, 3.1, z, M.frame, 8);
                box(scene, .7, .16, .45, 15.7, 6.18, z, M.white, false);
            }

            // Utility tanks and service plant visible behind Assy Hanon.
            for (let i = 0; i < 4; i++) {
                const tank = cyl(scene, 1.2, 1.2, 4.4, 75, 2.3, -71 + i * 3.5, M.frame, 18);
                const cap = new THREE.Mesh(new THREE.SphereGeometry(1.2, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.paleRoof);
                cap.position.set(75, 4.5, -71 + i * 3.5);
                cap.castShadow = true;
                scene.add(cap);
                box(scene, 2.7, .18, 2.7, 75, .15, -71 + i * 3.5, M.concreteDark);
            }

            // Yellow-black safety curbs along the two busiest loading alleys.
            for (let z = -71; z < -12; z += 2.4) {
                box(scene, .8, .16, .72, 20.8, .12, z, Math.round(z / 2.4) % 2 ? M.yellow : M.dark, false);
            }

            // ------------------------------------------------------------
            // Office block and rear canteen
            // ------------------------------------------------------------
            function officeBlock(name, x, z, w, d, h, roofMat = M.paleRoof, id = name, rotationY = 0) {
                const group = new THREE.Group();
                const isMainOffice = id === 'main_office';
                const isCanteen = id === 'canteen';
                group.name = id;
                group.position.set(x, 0, z);
                group.rotation.y = rotationY;
                scene.add(group);
                const colliderW = Math.abs(w * Math.cos(rotationY)) + Math.abs(d * Math.sin(rotationY));
                const colliderD = Math.abs(w * Math.sin(rotationY)) + Math.abs(d * Math.cos(rotationY));
                registerCollider(x, z, colliderW, colliderD, .85);

                box(group, w + 1, .48, d + 1, 0, .24, 0, M.base);
                box(group, w, h, d, 0, h / 2, 0, isMainOffice ? M.officeWhite : M.office);

                if (isMainOffice) {
                    // Close-up reference: light corrugated metal roof inside a one-metre parapet.
                    box(group, w + .35, .24, d + .35, 0, h + .08, 0, M.officeRoof);
                    for (let zz = -d / 2 + .5; zz <= d / 2 - .5; zz += .55) {
                        box(group, w - .7, .035, .035, 0, h + .225, zz, M.frame, false);
                    }
                    const parapetY = h + .62;
                    for (const side of [-1, 1]) {
                        box(group, .28, 1.05, d + .55, side * (w / 2 + .02), parapetY, 0, M.officeWhite);
                        box(group, w + .55, 1.05, .28, 0, parapetY, side * (d / 2 + .02), M.officeWhite);
                        box(group, .42, .11, d + .7, side * (w / 2 + .02), h + 1.18, 0, M.officeRoof, false);
                        box(group, w + .7, .11, .42, 0, h + 1.18, side * (d / 2 + .02), M.officeRoof, false);
                    }
                    identify(group, name, 'Two-storey Main Office reconstructed from the close-up reference');
                    return group;
                }

                // Horizontal facade bands.
                for (const yy of [1, 4.3, h - .2]) {
                    box(group, w + .12, .24, d + .12, 0, yy, 0,
                        id === 'canteen' ? M.officeWhite : M.frame);
                }

                const windowRows = isCanteen ? [2.05, 5.55] : [1.65, 4.05];
                const windowFrameMaterial = isCanteen ? M.officeWhite : M.frame;
                for (const yy of windowRows) {
                    for (let xx = -w / 2 + 1.45; xx < w / 2 - 1; xx += 2.55) {
                        for (const side of [-1, 1]) {
                            box(group, 2.15, 1.7, .07, xx, yy, side * (d / 2 + .045), M.glass, false);
                            box(group, .065, 1.7, .10, xx, yy, side * (d / 2 + .10), windowFrameMaterial, false);
                            box(group, 2.3, .1, .15, xx, yy - .9, side * (d / 2 + .1),
                                windowFrameMaterial, false);
                        }
                    }
                    for (let zz = -d / 2 + 1.5; zz < d / 2 - 1; zz += 2.65) {
                        for (const side of [-1, 1]) {
                            box(group, .07, 1.7, 2.15, side * (w / 2 + .045), yy, zz, M.glass, false);
                            box(group, .12, 1.7, .07, side * (w / 2 + .1), yy, zz,
                                windowFrameMaterial, false);
                        }
                    }
                }

                if (!isCanteen) {
                    box(group, w + 1, .25, d + 1, 0, h + .1, 0, roofMat);
                    for (const side of [-1, 1]) {
                        box(group, .2, .65, d + .5, side * w / 2, h + .35, 0, M.office);
                        box(group, w, .65, .2, 0, h + .35, side * d / 2, M.office);
                    }
                    // Deep stepped parapet seen on the real two-storey office.
                    box(group, w + 1.1, .48, .5, 0, h + .72, d / 2 + .08, M.office);
                    box(group, 4.2, .85, .55, 0, h + .95, d / 2 + .12, M.office);
                    for (const xx of [-w / 2 + .4, w / 2 - .4]) {
                        box(group, .75, h + .75, .42, xx, (h + .75) / 2, d / 2 + .12, M.office);
                    }
                    for (let xx = -w / 2; xx <= w / 2; xx += 1.5) {
                        box(group, .045, .04, d, xx, h + .25, 0, M.frame, false);
                    }
                }

                identify(group, name, 'อาคารสำนักงานและส่วนสนับสนุน จำลองจากภาพภายนอก');
                return group;
            }

            const officeData = BUILDING_BY_ID.main_office;
            const office = officeBlock(
                'Main Office — T.D.K INDUSTRIAL CO., LTD.',
                toRender(officeData.position.x), toRender(officeData.position.z),
                toRender(officeData.size.width), toRender(officeData.size.depth), toRender(officeData.size.height),
                M.paleRoof, officeData.id, officeData.rotationY
            );
            label('Main Office', toRender(officeData.position.x), 15.2, toRender(officeData.position.z), 18);

            // Two long blue glazing ribbons on the car-park side.
            const officeHalfW = toRender(officeData.size.width) / 2;
            const officeHalfD = toRender(officeData.size.depth) / 2;
            const officeLongWallX = -officeHalfW - .055;
            for (const y of [2.05, 5.55]) {
                box(office, .1, 1.55, officeHalfD * 2 - 1.35,
                    officeLongWallX, y, 0, M.officeGlassDark, false);
                for (let zz = -officeHalfD + 1.05; zz < officeHalfD - .6; zz += 1.2) {
                    box(office, .16, 1.66, .075, officeLongWallX - .04, y, zz, M.officeWhite, false);
                }
                box(office, .16, .09, officeHalfD * 2 - 1.25,
                    officeLongWallX - .04, y, 0, M.officeWhite, false);
            }

            // The yard-facing elevation has the same two-story horizontal glazing
            // bands, with a white company sign above the entrance canopy.
            const officeFacadeZ = toRender(officeData.size.depth) / 2;
            const officeFrontWindowWidth = officeHalfW * 2 - 3.2;
            for (const y of [2.05, 5.55]) {
                box(office, officeFrontWindowWidth, 1.55, .1,
                    0, y, officeFacadeZ + .06, M.officeGlassDark, false);
                for (let x = -officeFrontWindowWidth / 2 + 1.2;
                    x < officeFrontWindowWidth / 2; x += 2.4) {
                    box(office, .13, 1.68, .15, x, y, officeFacadeZ + .12,
                        M.officeWhite, false);
                }

                box(office, officeFrontWindowWidth + .12, .12, .16,
                    0, y - .86, officeFacadeZ + .12, M.officeWhite, false);
                box(office, officeFrontWindowWidth + .12, .12, .16,
                    0, y + .86, officeFacadeZ + .12, M.officeWhite, false);
            }
            const officeBandY = 3.8;
            const officeBandWidth = .34;
            for (const side of [-1, 1]) {
                box(office, officeHalfW * 2 + .12, officeBandWidth, .12,
                    0, officeBandY, side * (officeHalfD + .12), M.officeStripe, false);
                box(office, .12, officeBandWidth, officeHalfD * 2 - .12,
                    side * (officeHalfW + .12), officeBandY, 0, M.officeStripe, false);
            }

            // Concrete service ledge and evenly spaced outdoor AC condenser units
            // beneath the upper windows on the long side elevation.
            box(office, .78, .16, officeHalfD * 2 - 1.25,
                officeLongWallX - .34, 4.65, 0, M.officeWhite);
            for (let index = 0; index < 11; index++) {
                const zz = -officeHalfD + 1.25 + index * (officeHalfD * 2 - 2.5) / 10;
                box(office, .62, .58, .92, officeLongWallX - .55, 4.98, zz, M.officeWhite);
                const fan = cyl(office, .21, .21, .035,
                    officeLongWallX - .88, 4.98, zz, M.frame, 18);
                fan.rotation.z = Math.PI / 2;
            }

            // Projecting blue-glass entrance canopy on the right half of the facade.
            const officeEntranceX = 4.2;
            const officeCanopyZ = officeFacadeZ + 4.2;
            const officeCanopy = new THREE.Group();
            officeCanopy.name = 'Main Office entrance canopy';
            officeCanopy.position.set(officeEntranceX, 0, officeCanopyZ);
            office.add(officeCanopy);
            roofPatch(officeCanopy, 13.2, 4.08, .82, -6.6, 6.6, -4.2, 4.2, M.officeCanopyGlass, .06);
            gable(officeCanopy, 13.2, 4.08, .82, 4.2, M.officeBlue);
            gable(officeCanopy, 13.2, 4.08, .82, -4.2, M.officeBlue);
            for (let xx = -6; xx <= 6; xx += 1.2) {
                const yy = roofHeight(xx, 13.2, 4.08, .82) + .08;
                box(officeCanopy, .09, .09, 8.4, xx, yy, 0, M.officeWhite, false);
            }
            for (const offset of [-5.7, 5.7]) {
                cyl(office, .34, .34, 4.05,
                    officeEntranceX + offset, 2.03, officeFacadeZ + 7.4, M.officeWhite, 24);
            }
            box(officeCanopy, 13.5, .28, .34, 0, 3.92, 4.28, M.officeBlue);
            // Recessed entrance doors sit below the canopy.
            box(office, 3.2, 2.8, .14,
                officeEntranceX, 1.5, officeFacadeZ + .18, M.officeGlassDark);
            for (const offset of [-1.05, 0, 1.05]) {
                box(office, .08, 2.8, .18,
                    officeEntranceX + offset, 1.5, officeFacadeZ + .24, M.officeWhite, false);
            }
            for (let i = 0; i < 3; i++) {
                box(office, 8.6 - i * .45, .16, 1.1, officeEntranceX, .11 + i * .14,
                    officeFacadeZ - .35 + i * .6, M.curb);
            }

            tdkSign(office, -1.2, 7.75, officeFacadeZ + .2, 14.5, 2.2);

            const hatchStripe = (x, z, rotation) => {
                const stripe = box(office, .92, .025, .14, x, .14, z,
                    Math.round((x + z) * 2) % 2 ? M.yellow : M.dark, false);
                stripe.rotation.y = rotation;
            };
            for (let x = -officeHalfW + .85; x <= officeHalfW - .85; x += 1.15) {
                hatchStripe(x, officeHalfD + .85, Math.PI / 4);
                hatchStripe(x, -officeHalfD - .85, -Math.PI / 4);
            }
            for (let z = -officeHalfD + .85; z <= officeHalfD - .85; z += 1.15) {
                hatchStripe(officeHalfW + .85, z, -Math.PI / 4);
                hatchStripe(-officeHalfW - .85, z, Math.PI / 4);
            }

            // Low shrubs at the rear-right corner.
            const rearCornerX = officeHalfW - 1.9;
            const rearCornerZ = -officeHalfD - 1.35;
            for (const [dx, dz, scale] of [[-1.6, .2, .62], [0, -.15, .72], [1.5, .15, .58]]) {
                const shrub = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), M.foliage[1]);
                shrub.position.set(rearCornerX + dx, .48, rearCornerZ + dz);
                shrub.scale.set(1.05 * scale, .62 * scale, .82 * scale);
                shrub.castShadow = true;
                office.add(shrub);
            }

            function blueWalkwayLink(points, width) {
                for (let index = 0; index < points.length - 1; index++) {
                    const [x1, z1] = points[index];
                    const [x2, z2] = points[index + 1];
                    stripBetween(scene, x1, z1, x2, z2, width, .14, M.pathBlue, .055);
                }
            }

            function straightCrossing(points, width) {
                const start = points[0];
                const end = points[points.length - 1];
                const dx = end[0] - start[0];
                const dz = end[1] - start[1];
                const length = Math.hypot(dx, dz);
                const tangentX = dx / length;
                const tangentZ = dz / length;
                const angle = -Math.atan2(dz, dx);
                for (let distance = .45; distance < length; distance += 1.05) {
                    const stripe = box(scene, .58, .045, width,
                        start[0] + tangentX * distance, .18,
                        start[1] + tangentZ * distance, M.white, false);
                    stripe.rotation.y = angle;
                }
            }

            // Office forecourt follows the east-facing entrance toward the central yard.
            // Keep the centre of the canopy clear so landscaping never hides the sign/door.
            for (let i = 0; i < 4; i++) {
                box(scene, 1.55 - i * .15, .14, 7.2 - i * .45,
                    -33.35 - i * .42, .1 + i * .14, toRender(officeData.position.z), M.curb);
            }

            // ==========================================================
            // Container canteen booth (yellow/blue - photo 2)
            // ==========================================================
            const canteenData = BUILDING_BY_ID.canteen;
            const canteenCenterX = toRender(canteenData.position.x);
            const canteenCenterZ = toRender(canteenData.position.z);
            const officeMinX = toRender(officeData.position.x - officeData.size.depth / 2);
            const canteenMaxZ = toRender(canteenData.position.z + canteenData.size.depth / 2);
            const officeMinZ = toRender(officeData.position.z - officeData.size.width / 2);
            const boothX = Math.min(
                canteenCenterX + toRender(canteenData.size.width) / 2,
                officeMinX
            ) - 3.8;
            const boothZ = (canteenMaxZ + officeMinZ) / 2;
            const containerBooth = registerEditable(
                snackBooth(boothX, boothZ),
                { id: 'snack-booth-main', type: 'snackBooth', label: 'กล่อง/ร้านขนม' }
            );
            label('กล่องขนม', boothX, 5.8, boothZ, 14);

            // ==========================================================
            // Flagpoles with Thai flags (photo 3, 4, 5)
            // ==========================================================
            flagpole(38, 12, 10);
            flagpole(41, 12, 10);
            flagpole(44, 12, 10);

            // ==========================================================
            // Info/company sign board near entrance (photo 3)
            // ==========================================================
            const signBoard = new THREE.Group();
            signBoard.position.set(52, 0, 14);
            scene.add(signBoard);
            // Posts
            box(signBoard, .1, 2, .1, -.8, 1, 0, M.frame);
            box(signBoard, .1, 2, .1, .8, 1, 0, M.frame);
            // Sign panel
            sign(signBoard, 'T.D.K INDUSTRIAL', 0, 1.5, .08, 2, 1.2, { background: '#ffffff', color: '#0a4d8c', fontSize: 42 });

            const canteenWidth = toRender(canteenData.size.width);
            const canteenDepth = toRender(canteenData.size.depth);
            const canteenHeight = toRender(canteenData.size.height);
            const canteenRise = toRender(canteenData.roof.rise);
            const canteen = officeBlock(
                'Canteen / DV FL 2 / DIE-SET FL 2', toRender(canteenData.position.x), toRender(canteenData.position.z),
                canteenWidth, canteenDepth, canteenHeight, M.officeWhite,
                canteenData.id, canteenData.rotationY
            );
            const canteenRoofWidth = canteenWidth + 1;
            const canteenRoofDepth = canteenDepth + 1.2;
            roofPatch(canteen, canteenRoofWidth, canteenHeight + .12, canteenRise,
                -canteenRoofWidth / 2, canteenRoofWidth / 2,
                -canteenRoofDepth / 2, canteenRoofDepth / 2, M.roof);
            gable(canteen, canteenRoofWidth, canteenHeight + .12, canteenRise, canteenRoofDepth / 2, M.blue);
            gable(canteen, canteenRoofWidth, canteenHeight + .12, canteenRise, -canteenRoofDepth / 2, M.blue);
            label('Canteen / DV FL 2 / DIE-SET FL 2', toRender(canteenData.position.x), canteenHeight + canteenRise + 3,
                toRender(canteenData.position.z), 34);

            // The canteen keeps its layered white facade; blue is reserved for the roof edge.
            box(canteen, canteenWidth + 1.25, .32, .48, 0, canteenHeight + .17,
                canteenDepth / 2 + .2, M.blue);
            awning(canteen, 0, canteenDepth / 2 + 1.45, canteenWidth * .58, 2.5, 4.45);

            // Small service buildings.
            box(scene, 7, 3.1, 8, -72, 1.55, -2, M.wall);
            box(scene, 8, .2, 9, -72, 3.2, -2, M.paleRoof);
            registerCollider(-72, -2, 7, 8, .6);
            label('ห้องปั๊ม', -72, 5.5, -2, 11);

            // ------------------------------------------------------------
            // Parking shelters, cars and security gate
            // ------------------------------------------------------------
            function car(parent, x, z, color, rotation = 0, carrier = false) {
                const group = new THREE.Group();
                group.position.set(x, .25, z);
                group.rotation.y = rotation;
                parent.add(group);
                const paint = material(color, .35, .45);
                box(group, 1.85, .72, 4.1, 0, .65, 0, paint);
                box(group, 1.58, .63, 2.15, 0, 1.25, -.17, M.glass);
                box(group, 1.62, .12, 2.2, 0, 1.58, -.17, paint);
                const wheels = [];
                for (const xx of [-.94, .94]) {
                    for (const zz of [-1.28, 1.28]) {
                        const wheel = cyl(group, .36, .36, .19, xx, .39, zz, M.rubber, 12);
                        wheel.rotation.z = Math.PI / 2;
                        wheels.push(wheel);
                    }
                }
                for (const xx of [-.58, .58]) {
                    box(group, .42, .22, .06, xx, .79, 2.07, M.white, false);
                    box(group, .42, .20, .06, xx, .79, -2.07, M.red, false);
                }
                if (carrier) {
                    box(group, 1.72, .85, 1.85, 0, 1.12, -1.05, paint);
                    box(group, 1.82, .11, 2.05, 0, 1.62, -1.05, M.officeRoof);
                    for (const zz of [-1.72, -.38]) {
                        box(group, 2.0, .08, .08, 0, 1.78, zz, M.dark, false);
                    }
                }
                group.userData.wheels = wheels;
                return group;
            }

            function parking(x, z, w, d, count, bayAxis = 'x') {
                box(scene, w, .06, d, x, .055, z, M.asphalt, false);
                for (let i = 0; i <= count; i++) {
                    if (bayAxis === 'z') {
                        const zz = z - d / 2 + i * d / count;
                        box(scene, w - .6, .02, .09, x, .1, zz, M.yellow, false);
                    } else {
                        const xx = x - w / 2 + i * w / count;
                        box(scene, .09, .02, d - .6, xx, .1, z, M.yellow, false);
                    }
                }
                const roof = box(scene, w + 1, .18, d + 1, x, 3.65, z, M.paleRoof);
                roof.rotation.x = .065;
                if (bayAxis === 'z') {
                    for (let zz = z - d / 2; zz <= z + d / 2; zz += 1.1) {
                        const seam = box(scene, w + .8, .045, .045, x, 3.78, zz, M.frame, false);
                        seam.rotation.x = .065;
                    }
                } else {
                    for (let xx = x - w / 2; xx <= x + w / 2; xx += 1.1) {
                        const seam = box(scene, .045, .045, d + .8, xx, 3.78, z, M.frame, false);
                        seam.rotation.x = .065;
                    }
                }
                if (bayAxis === 'z') {
                    for (let zz = z - d / 2; zz <= z + d / 2 + .1; zz += d / 4) {
                        for (const xx of [x - w / 2 + .4, x + w / 2 - .4]) {
                            cyl(scene, .085, .085, 3.55, xx, 1.775, zz, M.frame);
                        }
                    }
                } else {
                    for (let xx = x - w / 2; xx <= x + w / 2 + .1; xx += w / 4) {
                        for (const zz of [z - d / 2 + .4, z + d / 2 - .4]) {
                            cyl(scene, .085, .085, 3.55, xx, 1.775, zz, M.frame);
                        }
                    }
                }
                const colors = ['#f2f2ef', '#242b31', '#a5adb1'];
                for (let i = 0; i < count; i++) {
                    if (bayAxis === 'z') {
                        car(scene, x, z - d / 2 + (i + .5) * d / count,
                            colors[i % colors.length], Math.PI / 2, i % 4 === 3);
                    } else {
                        car(scene, x - w / 2 + (i + .5) * w / count,
                            z, colors[i % colors.length], 0, i % 4 === 3);
                    }
                }
            }
            PARKING_AREAS.forEach(area => parking(
                toRender(area.x), toRender(area.z), toRender(area.width), toRender(area.depth),
                area.spaces, area.bayAxis
            ));

            // Short visitor parking row beside the Main Office, separate from the long carport.
            box(scene, 23, .055, 7, -49, .075, 63.5, M.concreteLight, false);
            for (const x of [-57.5, -51.8, -46.1, -40.4]) {
                box(scene, .09, .025, 6.4, x, .11, 63.5, M.yellow, false);
            }
            car(scene, -54.7, 63.5, '#f0f0ec');
            car(scene, -49, 63.5, '#343b40');
            car(scene, -43.3, 63.5, '#8d969c', 0, true);
            label('ลานจอดรถ', -61, 6.7, 66, 18);

            // Low service / bicycle shelter visible in the gap behind the parking row.
            const parkingAnnex = new THREE.Group();
            parkingAnnex.name = 'Parking service shelter';
            parkingAnnex.position.set(-68, 0, 62);
            scene.add(parkingAnnex);
            box(parkingAnnex, 8.2, 2.45, 4.8, 0, 1.23, 0, M.wall);
            box(parkingAnnex, 7.4, 1.35, .08, 0, 1.65, 2.44, M.glass, false);
            box(parkingAnnex, 9.2, .16, 5.4, 0, 2.58, 0, M.paleRoof);
            for (const xx of [-4, 4]) {
                for (const zz of [-2.1, 2.1]) cyl(parkingAnnex, .08, .08, 2.5, xx, 1.25, zz, M.frame, 8);
            }

            function hipRoof(parent, x, y, z, w, d, roofMaterial = M.roof) {
                const eave = box(parent, w + .7, .16, d + .7, x, y - .05, z, roofMaterial);
                eave.name = 'Roof eave';
                const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4), roofMaterial);
                roof.name = 'Hip roof cap';
                roof.position.set(x, y + .48, z);
                roof.rotation.y = Math.PI / 4;
                roof.scale.set(w * .73, 1.15, d * .73);
                roof.castShadow = true;
                roof.receiveShadow = true;
                parent.add(roof);
                return roof;
            }

            function speedLimitSign(x, z, rotationY = 0) {
                const group = new THREE.Group();
                group.position.set(x, 0, z);
                group.rotation.y = rotationY;
                scene.add(group);
                cyl(group, .07, .09, 3.6, 0, 1.8, 0, M.dark, 10);
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 256;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#f7f7f2'; ctx.beginPath(); ctx.arc(128, 128, 112, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#b43b39'; ctx.lineWidth = 18; ctx.stroke();
                ctx.fillStyle = '#172c38'; ctx.font = '900 92px Arial'; ctx.textAlign = 'center'; ctx.fillText('20', 128, 135);
                ctx.font = 'bold 28px Tahoma'; ctx.fillText('กม./ชม.', 128, 178);
                const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
                const face = new THREE.Mesh(new THREE.CircleGeometry(.92, 40), new THREE.MeshBasicMaterial({ map: texture }));
                face.position.set(0, 3.4, .04); group.add(face);
            }

            function trafficLight(x, z) {
                const group = new THREE.Group();
                group.position.set(x, 0, z); scene.add(group);
                cyl(group, .08, .11, 4.7, 0, 2.35, 0, M.dark, 10);
                box(group, .65, 1.65, .5, .42, 3.7, 0, M.dark);
                ['#ef443c', '#f2c84b', '#42bc63'].forEach((color, i) => {
                    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.18, 12, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: i === 2 ? 1.1 : .15 }));
                    lamp.position.set(.42, 4.18 - i * .48, .28); group.add(lamp);
                });
            }

            function solarLamp(x, z, rotationY = 0) {
                const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = rotationY; scene.add(group);
                cyl(group, .08, .12, 7.5, 0, 3.75, 0, M.dark, 10);
                beam(group, [0, 7.1, 0], [1.7, 7.1, 0], .075, M.dark);
                const panel = box(group, 1.35, .09, .7, .15, 7.55, 0, M.glassBlue); panel.rotation.z = -.18;
                box(group, .8, .15, .35, 1.68, 7.02, 0, M.white, false);
            }

            function utilityPole(x, z, poleMaterial = M.trunk) {
                box(scene, .24, 9.4, .24, x, 4.7, z, poleMaterial);
                box(scene, 3.5, .2, .2, x, 8.35, z, poleMaterial);
                for (const offset of [-1.25, 0, 1.25]) {
                    cyl(scene, .09, .09, .42, x + offset, 8.66, z, M.frame, 8);
                }
            }

            // Guard booth and canopy.
            const GUARD_X = -33.5;
            const GUARD_Z = 70.5;
            const guard = new THREE.Group();
            guard.name = 'Security guard booth';
            guard.position.set(GUARD_X, 0, GUARD_Z);
            scene.add(guard);
            registerCollider(GUARD_X, GUARD_Z, 5, 4.5, .45);
            box(guard, 5, 3.2, 4.5, 0, 1.6, 0, M.wall);
            box(guard, 4.5, 1.4, .1, 0, 2.1, 2.28, M.glass);
            box(guard, .1, 1.4, 3.6, 2.53, 2.1, 0, M.glass);
            hipRoof(guard, 0, 3.42, 0, 7.1, 6.5, M.officeBlue);
            sign(guard, 'SECURITY', 0, 3.02, 2.32, 4.4, .7);

            // Three-lane pedestrian access control based on the stainless card-reader
            // turnstiles in the guardhouse reference. It is a separate editable object.
            const accessControl = new THREE.Group();
            accessControl.name = 'Security card access turnstiles';
            accessControl.position.set(GUARD_X, 0, GUARD_Z + 2.72);
            scene.add(accessControl);
            box(accessControl, 4.6, .12, 1.72, 0, .06, 0, M.concreteLight, false);
            const accessBlue = new THREE.MeshStandardMaterial({
                color: '#075eb4', roughness: .42, metalness: .2, side: THREE.DoubleSide
            });
            const accessPostXs = [-1.65, -.55, .55, 1.65];
            accessPostXs.forEach((postX, index) => {
                box(accessControl, .38, 1.25, 1.36, postX, .68, 0, M.chrome);
                box(accessControl, .43, .1, 1.42, postX, 1.32, 0, M.frame);
                // Black RFID reader with a small green ready indicator.
                box(accessControl, .23, .28, .055, postX, .93, .71, M.dark, false);
                box(accessControl, .08, .035, .065, postX, .98, .75,
                    index % 2 ? M.greenCrate : M.pathBlue, false);
            });
            const flapShape = new THREE.Shape();
            flapShape.moveTo(0, 0);
            flapShape.lineTo(.48, .36);
            flapShape.lineTo(0, .76);
            flapShape.closePath();
            const flapGeometry = new THREE.ShapeGeometry(flapShape);
            for (let lane = 0; lane < 3; lane++) {
                const leftX = accessPostXs[lane] + .21;
                const rightX = accessPostXs[lane + 1] - .21;
                const leftFlap = new THREE.Mesh(flapGeometry, accessBlue);
                leftFlap.position.set(leftX, .48, .73);
                accessControl.add(leftFlap);
                const rightFlap = new THREE.Mesh(flapGeometry, accessBlue);
                rightFlap.position.set(rightX, .48, .735);
                rightFlap.scale.x = -1;
                accessControl.add(rightFlap);
            }
            label('Gate / Security', GUARD_X, 6.3, GUARD_Z + 2, 18);
            identify(guard, 'Gate / Security', 'ทางเข้าโรงงานและป้อมรักษาความปลอดภัย');
            identify(accessControl, 'เครื่องทาบบัตร / ประตูกั้นทางเข้า',
                'เครื่องอ่านบัตรและประตูกั้นทางเดิน แยกจากป้อม รปภ. และย้ายได้อิสระ');

            // Yellow box junction in front of the booth.
            const junction = { minX: -40.5, maxX: -27.5, minZ: 65.8, maxZ: 75.5 };
            for (const [x1, z1, x2, z2] of [
                [junction.minX, junction.minZ, junction.maxX, junction.minZ],
                [junction.maxX, junction.minZ, junction.maxX, junction.maxZ],
                [junction.maxX, junction.maxZ, junction.minX, junction.maxZ],
                [junction.minX, junction.maxZ, junction.minX, junction.minZ],
                [junction.minX, junction.minZ, junction.maxX, junction.maxZ],
                [junction.minX, junction.maxZ, junction.maxX, junction.minZ]
            ]) stripBetween(scene, x1, z1, x2, z2, .18, .16, M.yellow, .04);

            // Twin opposing boom barriers: one for each vehicle lane.
            const barrierOrange = material('#df8a2e', .5, .18);
            function boomBarrier(baseX, z, direction) {
                const barrier = new THREE.Group();
                barrier.name = direction > 0 ? 'Entry boom barrier' : 'Exit boom barrier';
                barrier.position.set(baseX, 0, z);
                scene.add(barrier);
                box(barrier, .78, .16, .82, 0, .08, 0, M.dark);
                box(barrier, .66, 1.42, .7, 0, .82, 0, barrierOrange);
                box(barrier, .74, .16, .76, 0, 1.55, 0, M.dark);
                cyl(barrier, .12, .12, .2, 0, 1.73, 0, M.yellow, 12);

                const armLength = 9.9;
                box(barrier, armLength, .15, .18,
                    direction * armLength / 2, 1.54, 0, M.white);
                for (let offset = .35; offset < armLength - .2; offset += 1.38) {
                    box(barrier, .62, .17, .2,
                        direction * (offset + .31), 1.54, 0, M.red, false);
                }
                cyl(barrier, .2, .2, .24, direction * .08, 1.54, 0, M.frame, 12);
                return barrier;
            }
            boomBarrier(-28.4, 74.2, 1);
            boomBarrier(-8.6, 74.2, -1);
            const utilityLine = [48, 18, -12, -42];
            const rightBoundaryX = 80;
            utilityLine.forEach(z => utilityPole(rightBoundaryX, z));
            for (let index = 0; index < utilityLine.length - 1; index++) {
                beam(scene, [rightBoundaryX, 8.75, utilityLine[index]], [rightBoundaryX, 8.75, utilityLine[index + 1]],
                    .035, M.dark);
            }

            // Red/white curbs along the entrance edge shown in the ground-level photos.
            for (let z = 19; z < 70; z += 2.4) {
                box(scene, .48, .26, 2.35, 72.7, .13, z + 1.15, Math.round(z / 2.4) % 2 ? M.red : M.white, false);
            }

            // Sliding steel gate, guide rail and road edge paint.
            box(scene, 25, .08, .16, -18.5, .06, 77.1, M.dark, false);
            for (const offset of [-1, 1]) {
                const gateX = offset < 0 ? -29.5 : -8.0;
                const gate = new THREE.Group();
                gate.position.set(gateX, 0, 76.8);
                scene.add(gate);
                box(gate, 8.5, .18, .18, 0, 2.65, 0, M.fence);
                box(gate, 8.5, .18, .18, 0, .55, 0, M.fence);
                box(gate, .2, 4.3, .2, -4.15, 2.45, 0, M.fence);
                box(gate, .2, 4.3, .2, 4.15, 2.45, 0, M.fence);
                for (let gx = -3.8; gx < 4; gx += .55) box(gate, .055, 3.8, .055, gx, 2.45, 0, M.fence, false);
            }
            stripBetween(scene, -30, 75.1, -7, 75.1, .14, .12, M.yellow, .05);
            for (let x = -28; x < -8; x += 2.8) box(scene, 1.4, .025, .16, x, .12, 69.8, M.white, false);

            function createEntranceMonument() {
                const group = new THREE.Group();
                group.name = 'TDK entrance monument';
                group.position.set(-2.4, 0, 84.5);
                // Face approaching traffic while keeping the sign parallel to the driveway edge.
                group.rotation.y = -1.385;
                scene.add(group);

                const islandGreen = material('#679244', .92, .04);
                const monumentBlue = material('#073f91', .46, .24);
                const monumentCyan = material('#0879dc', .38, .22);
                const footing = box(group, 6.8, .42, 2.2, 0, .21, 0, M.concreteDark);
                footing.name = 'Entrance monument footing';
                const body = box(group, 5.8, 14.8, .72, 0, 7.85, 0, M.officeWhite);
                body.name = 'Entrance monument panel';
                box(group, 5.82, 5.9, .76, 0, 3.4, 0, monumentBlue);

                const addFaceShape = (points, faceMaterial, side) => {
                    const shape = new THREE.Shape();
                    shape.moveTo(points[0][0], points[0][1]);
                    points.slice(1).forEach(([x, y]) => shape.lineTo(x, y));
                    shape.closePath();
                    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), faceMaterial);
                    mesh.position.z = side * .385;
                    if (side < 0) mesh.rotation.y = Math.PI;
                    mesh.castShadow = true;
                    group.add(mesh);
                    return mesh;
                };
                for (const side of [-1, 1]) {
                    addFaceShape([
                        [-2.9, .45], [2.9, .45], [2.9, 9.45], [-2.9, 6.85]
                    ], monumentBlue, side).name = 'Entrance monument blue face';
                    addFaceShape([
                        [-2.9, 6.85], [2.9, 9.45], [2.9, 10.2], [-2.9, 7.6]
                    ], monumentCyan, side).name = 'Entrance monument cyan stripe';
                }

                const logoBlue = material('#0872d7', .24, .48);
                const logoEdge = material('#173e68', .32, .58);
                const polygonShape = (points, holes = []) => {
                    const shape = new THREE.Shape();
                    shape.moveTo(points[0][0], points[0][1]);
                    points.slice(1).forEach(([x, y]) => shape.lineTo(x, y));
                    shape.closePath();
                    holes.forEach(holePoints => {
                        const hole = new THREE.Path();
                        hole.moveTo(holePoints[0][0], holePoints[0][1]);
                        holePoints.slice(1).forEach(([x, y]) => hole.lineTo(x, y));
                        hole.closePath();
                        shape.holes.push(hole);
                    });
                    return shape;
                };
                const addExtrudedLogoShape = (parent, name, points, holes = []) => {
                    const geometry = new THREE.ExtrudeGeometry(polygonShape(points, holes), {
                        depth: .28,
                        bevelEnabled: true,
                        bevelSegments: 2,
                        bevelSize: .035,
                        bevelThickness: .035,
                        curveSegments: 2
                    });
                    const mesh = new THREE.Mesh(geometry, [logoBlue, logoEdge]);
                    mesh.name = name;
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    parent.add(mesh);
                };
                const add3DLogo = side => {
                    const logo = new THREE.Group();
                    logo.name = 'Entrance monument TDK 3D logo';
                    logo.position.set(0, 12.65, side * .4);
                    if (side < 0) logo.rotation.y = Math.PI;
                    group.add(logo);

                    // Custom italic TDK silhouette. Closed faces keep the D counter
                    // and K arms crisp while the extrusion provides real side depth.
                    addExtrudedLogoShape(logo, 'Entrance monument logo T', [
                        [-2.25, .72], [-.76, .72], [-.86, .36], [-1.34, .36],
                        [-1.68, -.78], [-2.12, -.78], [-1.78, .36], [-2.35, .36]
                    ]);
                    addExtrudedLogoShape(logo, 'Entrance monument logo D', [
                        [-.49, .72], [.27, .72], [.66, .58], [.82, .3],
                        [.6, -.48], [.25, -.78], [-.88, -.78]
                    ], [[
                        [-.41, -.41], [.05, -.41], [.2, -.32], [.39, .13],
                        [.34, .27], [.16, .36], [-.2, .36]
                    ]]);
                    addExtrudedLogoShape(logo, 'Entrance monument logo K stem', [
                        [1.15, .72], [1.59, .72], [1.24, -.78], [.8, -.78]
                    ]);
                    addExtrudedLogoShape(logo, 'Entrance monument logo K upper arm', [
                        [1.37, .08], [1.93, .72], [2.46, .72], [1.52, -.08]
                    ]);
                    addExtrudedLogoShape(logo, 'Entrance monument logo K lower arm', [
                        [1.34, .09], [1.82, -.78], [2.35, -.78], [1.58, .29]
                    ]);
                };

                const brandCanvas = document.createElement('canvas');
                brandCanvas.width = 1024;
                brandCanvas.height = 180;
                const brandContext = brandCanvas.getContext('2d');
                brandContext.textAlign = 'center';
                brandContext.textBaseline = 'middle';
                brandContext.shadowColor = 'rgba(22,58,92,.35)';
                brandContext.shadowBlur = 10;
                brandContext.fillStyle = '#164d86';
                brandContext.font = 'italic 900 86px Arial,sans-serif';
                brandContext.fillText('TDK Industrial', 512, 92);
                const brandTexture = new THREE.CanvasTexture(brandCanvas);
                brandTexture.colorSpace = THREE.SRGBColorSpace;
                brandTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

                const taglineCanvas = document.createElement('canvas');
                taglineCanvas.width = 1024;
                taglineCanvas.height = 360;
                const taglineContext = taglineCanvas.getContext('2d');
                taglineContext.textAlign = 'center';
                taglineContext.textBaseline = 'middle';
                taglineContext.shadowColor = 'rgba(0,0,0,.45)';
                taglineContext.shadowBlur = 12;
                taglineContext.fillStyle = '#ffffff';
                taglineContext.font = '700 72px Arial,sans-serif';
                taglineContext.fillText('Global Leading Company', 512, 125);
                taglineContext.font = '700 58px Tahoma,Arial,sans-serif';
                taglineContext.fillText('บริษัทชั้นนำระดับโลก', 512, 245);
                const taglineTexture = new THREE.CanvasTexture(taglineCanvas);
                taglineTexture.colorSpace = THREE.SRGBColorSpace;
                taglineTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

                const addPrintedFace = (texture, width, height, y, side, name) => {
                    const face = new THREE.Mesh(
                        new THREE.PlaneGeometry(width, height),
                        new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
                    );
                    face.name = name;
                    face.position.set(0, y, side * .395);
                    if (side < 0) face.rotation.y = Math.PI;
                    face.renderOrder = 2;
                    group.add(face);
                };
                for (const side of [-1, 1]) {
                    add3DLogo(side);
                    addPrintedFace(brandTexture, 4.8, .72, 10.95, side, 'Entrance monument brand line');
                    addPrintedFace(taglineTexture, 4.9, 1.8, 3.75, side, 'Entrance monument tagline');
                }

                // Landscaped roadside island inspired by the reference entrance.
                const plantingBed = box(group, 12, .14, 4.2, 0, .07, -1.25, islandGreen, false);
                plantingBed.name = 'Entrance monument planting bed';
                for (let index = 0; index < 8; index++) {
                    box(group, 1.48, .28, .32, -5.2 + index * 1.48, .14, .93,
                        index % 2 ? M.white : M.red, false);
                }
                box(group, 12, .28, .32, 0, .14, -3.4, M.white, false);
                for (const x of [-5, -3.8, 3.8, 5]) {
                    const shrub = new THREE.Mesh(
                        new THREE.SphereGeometry(1, 12, 8),
                        M.foliage[Math.abs(Math.round(x)) % M.foliage.length]
                    );
                    shrub.name = 'Entrance monument hedge';
                    shrub.position.set(x, .56, -1.65);
                    shrub.scale.set(1.05, .55, .72);
                    shrub.castShadow = true;
                    shrub.receiveShadow = true;
                    group.add(shrub);
                }
                for (const x of [-5.25, 5.25]) {
                    cyl(group, .12, .18, 1.1, x, .55, -1.55, M.trunk, 8);
                    const topiary = new THREE.Mesh(
                        new THREE.ConeGeometry(.78, 2.8, 14), M.foliage[0]
                    );
                    topiary.name = 'Entrance monument topiary';
                    topiary.position.set(x, 2.05, -1.55);
                    topiary.castShadow = true;
                    topiary.receiveShadow = true;
                    group.add(topiary);
                }

                group.userData.info = {
                    title: 'ป้าย TDK ทางเข้าโรงงาน',
                    description: 'ป้าย landmark และสวนต้อนรับบริเวณทางเข้า อ้างอิงจากภาพทางเข้าโรงงาน'
                };
                return group;
            }

            function createEntranceAvenue() {
                const group = new THREE.Group();
                group.name = 'Landscaped entrance avenue';
                group.position.set(-62.5, 0, 88.25);
                group.rotation.y = .1846;
                scene.add(group);

                const avenueGreen = material('#6f994c', .96, .02);
                box(group, 81, .1, 3.8, 0, .02, -8.15, avenueGreen, false);
                box(group, 81, .1, 3.8, 0, .02, 8.15, avenueGreen, false);

                const addInstances = (name, geometry, instanceMaterial, transforms, castShadow = true) => {
                    const mesh = new THREE.InstancedMesh(geometry, instanceMaterial, transforms.length);
                    mesh.name = name;
                    mesh.castShadow = castShadow;
                    mesh.receiveShadow = true;
                    const dummy = new THREE.Object3D();
                    transforms.forEach((transform, index) => {
                        dummy.position.set(...transform.position);
                        dummy.rotation.set(0, transform.rotationY || 0, 0);
                        dummy.scale.set(...(transform.scale || [1, 1, 1]));
                        dummy.updateMatrix();
                        mesh.setMatrixAt(index, dummy.matrix);
                    });
                    mesh.instanceMatrix.needsUpdate = true;
                    group.add(mesh);
                    return mesh;
                };

                const redCurbs = [];
                const whiteCurbs = [];
                let curbIndex = 0;
                for (let x = -39.2; x <= 36; x += 2.2) {
                    for (const z of [-6.35, 6.35]) {
                        const entry = { position: [x, .14, z] };
                        (curbIndex % 2 ? whiteCurbs : redCurbs).push(entry);
                    }
                    curbIndex++;
                }
                const curbGeometry = new THREE.BoxGeometry(2.16, .28, .34);
                addInstances('Entrance avenue red curbs', curbGeometry, M.red, redCurbs, false);
                addInstances('Entrance avenue white curbs', curbGeometry, M.white, whiteCurbs, false);

                const hedges = [];
                for (let x = -37; x <= 31; x += 4.25) {
                    for (const z of [-8.05, 8.05]) {
                        const variation = 1 + ((Math.round(x * 10) + Math.round(z)) % 3) * .08;
                        hedges.push({
                            position: [x, .58, z],
                            scale: [1.5 * variation, .58, .78]
                        });
                    }
                }
                addInstances('Entrance avenue hedges',
                    new THREE.SphereGeometry(1, 10, 7), M.foliage[1], hedges);

                const trunks = [];
                const crowns = [];
                for (let x = -34; x <= 25; x += 11.8) {
                    for (const z of [-9.55, 9.55]) {
                        trunks.push({ position: [x, 1.5, z] });
                        crowns.push({
                            position: [x, 4.05, z],
                            scale: [1.28, 1.72, 1.28]
                        });
                    }
                }
                addInstances('Entrance avenue tree trunks',
                    new THREE.CylinderGeometry(.15, .22, 3, 8), M.trunk, trunks);
                addInstances('Entrance avenue tree crowns',
                    new THREE.IcosahedronGeometry(1, 1), M.foliage[2], crowns);

                group.userData.info = {
                    title: 'ภูมิทัศน์ถนนทางเข้าโรงงาน',
                    description: 'ขอบทางแดง-ขาว พุ่มไม้ และแนวต้นไม้ต้อนรับตามภาพอ้างอิง'
                };
                return group;
            }

            // Parked delivery trucks (matching photo 3 - trucks at loading dock)
            function deliveryTruck(x, z, rotY = 0, bodyColor = '#ecece4') {
                const trk = new THREE.Group();
                trk.position.set(x, 0, z);
                trk.rotation.y = rotY;
                scene.add(trk);
                box(trk, 2.7, 3.3, 7.8, 0, 2.2, -.7, material(bodyColor));
                box(trk, 2.65, 2.6, 2.5, 0, 1.8, 4.4, M.white);
                box(trk, 2.2, .95, .08, 0, 2.35, 5.68, M.glass);
                const wheels = [];
                for (const xx of [-1.33, 1.33]) {
                    for (const zz of [-3.3, 1.7, 4.4]) {
                        const wheel = cyl(trk, .56, .56, .3, xx, .57, zz, M.rubber, 12);
                        wheel.rotation.z = Math.PI / 2;
                        wheels.push(wheel);
                    }
                }
                trk.userData.wheels = wheels;
                return trk;
            }
            // Truck at central loading area
            deliveryTruck(15, 1, 0);
            const storeLoadingX = toRender(storeData.position.x) + storeW / 2 + 3.1;
            const storeLoadingCenterZ = toRender(storeData.position.z);
            deliveryTruck(storeLoadingX, storeLoadingCenterZ + 13, 0, '#f4f4f0');
            deliveryTruck(storeLoadingX, storeLoadingCenterZ - 2, 0, '#f4f4f0');
            // Trucks at Doke 2 loading dock (visible in photo 3)
            deliveryTruck(73.5, 40, 0, '#f0f0e8');
            deliveryTruck(73.5, 23, 0, '#e8e8e0');
            // Large container truck parked at front (photo 4)
            const containerTruck = new THREE.Group();
            containerTruck.position.set(34, 0, 48);
            containerTruck.rotation.y = Math.PI * .5;
            scene.add(containerTruck);
            box(containerTruck, 2.8, 3.5, 12, 0, 2.25, 0, M.wall);
            box(containerTruck, 2.6, 2.4, 2.5, 0, 1.7, 7.5, M.white);
            box(containerTruck, 2.2, .9, .08, 0, 2.2, 8.78, M.glass);
            for (const xx of [-1.38, 1.38]) {
                for (const zz of [-4.5, 2, 7.5]) {
                    const wh = cyl(containerTruck, .58, .58, .32, xx, .58, zz, M.rubber, 12);
                    wh.rotation.z = Math.PI / 2;
                }
            }

            // ------------------------------------------------------------
            // Moving workers and forklifts add scale and activity
            // ------------------------------------------------------------
            const workers = [];
            const movingForklifts = [];
            const movingVehicles = [];
            let activityEnabled = true;
            let activityTime = 0;
            let activityObstacles = [];
            let activityObstacleSignature = '';
            let plannedObstacleRevision = -1;

            function addNpcHealthBar(group) {
                const canvas = document.createElement('canvas');
                canvas.width = 128; canvas.height = 24;
                const texture = new THREE.CanvasTexture(canvas);
                texture.colorSpace = THREE.SRGBColorSpace;
                const bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
                bar.position.set(0, 4.45, 0);
                bar.scale.set(1.75, .33, 1);
                group.add(bar);
                group.userData.healthCanvas = canvas;
                group.userData.healthTexture = texture;
                group.userData.healthBar = bar;
                group.userData.health = 100;
                group.userData.dead = false;
                drawNpcHealthBar(group);
            }

            function drawNpcHealthBar(group) {
                const canvas = group.userData.healthCanvas;
                if (!canvas) return;
                const ctx = canvas.getContext('2d');
                const amount = THREE.MathUtils.clamp(group.userData.health / 100, 0, 1);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#101820dd'; ctx.fillRect(1, 3, 126, 18);
                ctx.fillStyle = '#ffffff'; ctx.fillRect(2, 4, 124, 16);
                ctx.fillStyle = amount > .5 ? '#38c172' : amount > .25 ? '#f5bd3d' : '#df4b4b';
                ctx.fillRect(4, 6, 120 * amount, 12);
                group.userData.healthTexture.needsUpdate = true;
            }

            function route(points, closed = true) {
                return new THREE.CatmullRomCurve3(
                    points.map(p => new THREE.Vector3(p[0], 0, p[1])), closed, 'catmullrom', .18
                );
            }

            function worker(color = '#1677a8', helmet = '#f4d34a') {
                const group = new THREE.Group();
                group.scale.setScalar(.58);
                box(group, .85, 1.45, .55, 0, 2.25, 0, material(color, .55, .05));
                box(group, .9, .5, .08, 0, 2.35, .31, M.yellow, false);
                const head = new THREE.Mesh(
                    new THREE.SphereGeometry(.34, 12, 8), material('#d99e78', .65)
                );
                head.position.y = 3.32; head.castShadow = true; group.add(head);
                const hardHat = new THREE.Mesh(
                    new THREE.SphereGeometry(.38, 12, 7, 0, Math.PI * 2, 0, Math.PI * .55),
                    material(helmet, .42, .1)
                );
                hardHat.position.y = 3.43; hardHat.castShadow = true; group.add(hardHat);
                const arms = [];
                const legs = [];
                for (const side of [-1, 1]) {
                    const arm = cyl(group, .105, .115, 1.2, side * .51, 2.2, 0, material('#d99e78', .65), 8);
                    const leg = cyl(group, .13, .145, 1.35, side * .23, .78, 0, M.dark, 8);
                    arms.push(arm); legs.push(leg);
                }
                group.userData = { arms, legs };
                addNpcHealthBar(group);
                group.traverse(node => { node.userData.npcRoot = group; });
                scene.add(group);
                return group;
            }

            function forklift(color = '#efb72d') {
                const group = new THREE.Group();
                box(group, 1.9, .7, 3.2, 0, .72, 0, material(color, .42, .22));
                box(group, 1.82, 1.35, 1.35, 0, 1.45, -.72, material(color, .42, .22));
                for (const x of [-.76, .76]) for (const z of [-1.08, .82]) {
                    box(group, .11, 2.35, .11, x, 2.18, z, M.dark);
                }
                box(group, 1.72, .15, 1.55, 0, 3.35, -.25, M.dark);
                for (const x of [-.58, .58]) box(group, .15, 3.45, .15, x, 2.05, 1.43, M.dark);
                const carrier = new THREE.Group(); carrier.position.set(0, .62, 1.5); group.add(carrier);
                box(carrier, 1.48, .18, .2, 0, .2, 0, M.dark);
                box(carrier, .14, .12, 2.45, -.48, 0, 1.15, M.dark);
                box(carrier, .14, .12, 2.45, .48, 0, 1.15, M.dark);
                const wheels = [];
                for (const x of [-1, 1]) for (const z of [-1.08, .9]) {
                    const wheel = cyl(group, .38, .38, .27, x, .45, z, M.rubber, 12);
                    wheel.rotation.z = Math.PI / 2; wheels.push(wheel);
                }
                box(group, .68, .88, .48, 0, 2.12, -.52, material('#187da8'));
                const driverHead = new THREE.Mesh(new THREE.SphereGeometry(.27, 10, 8), material('#d99e78'));
                driverHead.position.set(0, 2.82, -.52); group.add(driverHead);
                const beaconMaterial = new THREE.MeshStandardMaterial({
                    color: '#ffc83d', emissive: '#ff8a00', emissiveIntensity: 1.2, roughness: .3
                });
                const beacon = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 6), beaconMaterial);
                beacon.position.set(0, 3.55, -.25); group.add(beacon);
                group.userData = { carrier, wheels, beacon };
                scene.add(group);
                return group;
            }

            const workerRoutes = [
                route([[-17, 8], [3, 9], [26, 10], [55, 9], [61, 17], [49, 17], [19, 16]]),
                route([[-64, 54], [-52, 52], [-37, 51], [-34, 31], [-40, 20], [-60, 22]])
            ];
            for (let i = 0; i < 10; i++) {
                const actor = {
                    mesh: worker(['#1677a8', '#287b55', '#d7633f', '#7652a4'][i % 4], i % 3 ? '#f6f7f0' : '#f4d34a'),
                    curve: workerRoutes[i % workerRoutes.length], phase: (i * .147) % 1, speed: .018 + (i % 3) * .003,
                    clearance: .65,
                    dead: false
                };
                actor.mesh.userData.actor = actor;
                workers.push(actor);
            }

            const forkliftRoutes = [
                route([[64, -74], [66, -48], [66, -14], [64, 8], [67, 29], [68, 63], [63, 70], [61, 25]]),
                route([[-17, 8], [5, 8], [27, 9], [54, 9], [59, 4], [34, 4], [8, 4], [-14, 4]])
            ];
            for (let i = 0; i < 2; i++) movingForklifts.push({
                mesh: forklift(i ? '#ef9d2d' : '#efbd32'), curve: forkliftRoutes[i],
                phase: i * .47, speed: i ? .010 : .008, clearance: 3.2
            });

            const vehicleRoutes = [
                route([[-24, 74], [-22, 60], [-20, 39], [-17, 19], [3, 11], [31, 11], [55, 13], [64, 26], [65, 57], [49, 71], [10, 73]]),
                route([[-7, 70], [-6, 53], [-5, 31], [1, 18], [24, 15], [48, 16], [61, 27], [62, 55], [44, 67], [15, 69]])
            ];
            const presentationCars = [
                car(scene, 0, 0, '#f4f5f3', 0, false),
                car(scene, 0, 0, '#1f68b5', 0, true),
                car(scene, 0, 0, '#d9a928', 0, false)
            ];
            presentationCars.forEach((mesh, index) => {
                const headlight = new THREE.PointLight('#dff3ff', 0, 15, 2);
                headlight.position.set(0, .9, 2.15);
                mesh.add(headlight);
                movingVehicles.push({
                    mesh,
                    curve: vehicleRoutes[index % vehicleRoutes.length],
                    phase: [0.08, .42, .72][index],
                    speed: [.014, .012, .013][index],
                    rideHeight: .25,
                    clearance: 2.6,
                    wheelSpeed: 8,
                    headlight
                });
            });

            const movingTruck = deliveryTruck(0, 0, 0, '#f4f4ec');
            const truckHeadlight = new THREE.PointLight('#e7f5ff', 0, 22, 2);
            truckHeadlight.position.set(0, 2.1, 5.8);
            movingTruck.add(truckHeadlight);
            movingVehicles.push({
                mesh: movingTruck,
                curve: route([[68, 69], [69, 48], [69, 20], [68, -12], [67, -48], [62, -69], [58, -42], [59, 3], [62, 43]]),
                phase: .31,
                speed: .0065,
                rideHeight: 0,
                clearance: 4.2,
                wheelSpeed: 5,
                headlight: truckHeadlight
            });

            function refreshActivityNavigation() {
                const obstacles = [];
                editableObjects.forEach(group => {
                    const box = group.userData.editorBounds;
                    if (!isGameplayCollider(group, box)) return;
                    obstacles.push({
                        minX: box.min.x, maxX: box.max.x,
                        minZ: box.min.z, maxZ: box.max.z
                    });
                });
                const signature = obstacles.map(box =>
                    [box.minX, box.maxX, box.minZ, box.maxZ].map(n => n.toFixed(2)).join(',')).join(';');
                plannedObstacleRevision = activityObstacleRevision;
                if (signature === activityObstacleSignature) return;
                activityObstacleSignature = signature;
                activityObstacles = obstacles;
                const navigators = new Map();
                const loops = new Map();
                for (const actor of [...workers, ...movingForklifts, ...movingVehicles]) {
                    const clearance = actor.clearance || .6;
                    if (!navigators.has(clearance)) navigators.set(clearance,
                        createActivityNavigator(SITE.renderBounds, obstacles, clearance));
                    const navigator = navigators.get(clearance);
                    if (!loops.has(actor.curve)) loops.set(actor.curve, new Map());
                    const curveLoops = loops.get(actor.curve);
                    if (!curveLoops.has(clearance)) {
                        const samples = Math.max(8, Math.ceil(actor.curve.getLength() / 5));
                        const points = actor.curve.getSpacedPoints(samples).slice(0, -1)
                            .map(point => ({ x: point.x, z: point.z }));
                        curveLoops.set(clearance, navigator.buildLoop(points));
                    }
                    const previous = actor.navLoop;
                    actor.navLoop = curveLoops.get(clearance);
                    if (!actor.navLoop) {
                        const safe = navigator.project(actor.mesh.position);
                        actor.mesh.visible = !!safe;
                        if (safe) actor.mesh.position.set(safe.x, actor.rideHeight || 0, safe.z);
                        continue;
                    }
                    actor.mesh.visible = true;
                    if (!previous) actor.navDistance = actor.phase * actor.navLoop.total;
                    else {
                        // Preserve the actor's location when an object moves in the editor.
                        let closest = Infinity, distance = 0;
                        const path = actor.navLoop;
                        for (let i = 1; i < path.points.length; i++) {
                            const a = path.points[i - 1], b = path.points[i];
                            const dx = b.x - a.x, dz = b.z - a.z;
                            const span = dx * dx + dz * dz;
                            const t = span ? THREE.MathUtils.clamp(
                                ((actor.mesh.position.x - a.x) * dx + (actor.mesh.position.z - a.z) * dz) / span, 0, 1) : 0;
                            const x = a.x + dx * t, z = a.z + dz * t;
                            const error = Math.hypot(actor.mesh.position.x - x, actor.mesh.position.z - z);
                            if (error < closest) {
                                closest = error;
                                distance = path.lengths[i - 1] + Math.sqrt(span) * t;
                            }
                        }
                        actor.navDistance = distance;
                    }
                }
            }

            function placeActivityActor(actor, dt) {
                if (!actor.navLoop || !actor.mesh.visible) return;
                const loop = actor.navLoop;
                const nextDistance = (actor.navDistance + dt * actor.speed * actor.curve.getLength()) % loop.total;
                const next = positionOnActivityLoop(loop, nextDistance / loop.total);
                // An editor move can invalidate a path between navigation refreshes.
                const blocked = activityObstacles.some(box =>
                    next.x >= box.minX - actor.clearance && next.x <= box.maxX + actor.clearance &&
                    next.z >= box.minZ - actor.clearance && next.z <= box.maxZ + actor.clearance);
                if (blocked) {
                    plannedObstacleRevision = -1;
                    return;
                }
                actor.navDistance = nextDistance;
                actor.mesh.position.set(next.x, actor.rideHeight || 0, next.z);
                actor.mesh.rotation.y = next.heading;
            }

            function updateActivity(dt) {
                if (!activityEnabled) return;
                activityTime += dt;
                if (activityObstacleRevision !== plannedObstacleRevision) {
                    refreshActivityNavigation();
                }
                workers.forEach((actor, index) => {
                    if (actor.dead) return;
                    placeActivityActor(actor, dt);
                    const step = Math.sin(activityTime * 8 + index * .7);
                    actor.mesh.userData.arms[0].rotation.x = step * .72;
                    actor.mesh.userData.arms[1].rotation.x = -step * .72;
                    actor.mesh.userData.legs[0].rotation.x = -step * .72;
                    actor.mesh.userData.legs[1].rotation.x = step * .72;
                    actor.mesh.position.y = Math.abs(step) * .035;
                });
                movingForklifts.forEach((actor, index) => {
                    placeActivityActor(actor, dt);
                    actor.mesh.userData.wheels.forEach(w => w.rotation.x -= dt * 5);
                    actor.mesh.userData.carrier.position.y = .62 + Math.sin(activityTime * .8 + index) * .11;
                    actor.mesh.userData.beacon.material.emissiveIntensity = 1.1 + Math.sin(activityTime * 8 + index) * .8;
                });
                movingVehicles.forEach(actor => {
                    placeActivityActor(actor, dt);
                    actor.mesh.userData.wheels.forEach(wheel => {
                        wheel.rotation.x -= dt * actor.wheelSpeed;
                    });
                });
            }

            // ------------------------------------------------------------
            // Presentation environment: day, night, rain and atmospheric fog
            // ------------------------------------------------------------
            const environmentStatus = document.getElementById('environment-status');
            let environmentMode = 'day';

            const lampEmitterMaterial = new THREE.MeshStandardMaterial({
                color: '#fff1cc', emissive: '#ffb947', emissiveIntensity: 0,
                roughness: .35, toneMapped: false
            });
            const buildingNightLights = [];
            BUILDINGS.forEach(item => {
                const group = scene.getObjectByName(item.id);
                if (!group) return;
                const width = toRender(item.size.width);
                const depth = toRender(item.size.depth);
                const height = toRender(item.size.height);
                const fixtureY = Math.max(4.6, height * .68);
                for (const x of [-width * .32, width * .32]) {
                    box(group, .92, .18, .24, x, fixtureY, depth / 2 + .2, M.frame, false);
                    box(group, .68, .1, .045, x, fixtureY - .02, depth / 2 + .345,
                        lampEmitterMaterial, false);
                    const light = new THREE.PointLight('#ffcf7a', 0, 48, 1.7);
                    light.position.set(x, fixtureY - .5, depth / 2 + .85);
                    group.add(light);
                    buildingNightLights.push(light);
                }
            });

            const streetLightGroup = new THREE.Group();
            streetLightGroup.name = 'Factory streetlights';
            scene.add(streetLightGroup);
            const siteNightLights = [
                [-27, 8, 73], [-10, 8, 72], [-43, 8, 51], [-18, 8, 18],
                [18, 9, 11], [52, 10, 12], [69, 11, 40], [68, 10, -22],
                [45, 9, -65], [6, 10, -69], [-38, 9, -63], [-63, 8, 24]
            ].map(([x, y, z]) => {
                const height = y + 1;
                cyl(streetLightGroup, .12, .17, height, x, height / 2, z, M.frame, 8);
                beam(streetLightGroup, [x, height - .35, z], [x + 1.35, height - .2, z],
                    .075, M.frame);
                box(streetLightGroup, .9, .18, .42, x + 1.45, height - .2, z, M.dark, false);
                box(streetLightGroup, .68, .1, .3, x + 1.45, height - .31, z,
                    lampEmitterMaterial, false);
                const light = new THREE.PointLight('#ffcf7a', 0, 48, 1.6);
                light.position.set(x + 1.45, height - .6, z);
                streetLightGroup.add(light);
                return light;
            });

            const rainCount = 3200;
            const rainPositions = new Float32Array(rainCount * 6);
            for (let i = 0; i < rainCount; i++) {
                const offset = i * 6;
                const x = (rand() - .5) * 245;
                const y = rand() * 125 + 2;
                const z = (rand() - .5) * 220;
                rainPositions[offset] = x;
                rainPositions[offset + 1] = y;
                rainPositions[offset + 2] = z;
                rainPositions[offset + 3] = x + .18;
                rainPositions[offset + 4] = y - 2.4;
                rainPositions[offset + 5] = z + .08;
            }
            const rainGeometry = new THREE.BufferGeometry();
            rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
            const rainMaterial = new THREE.LineBasicMaterial({
                color: '#d7efff', transparent: true, opacity: .42,
                depthWrite: false
            });
            const rainField = new THREE.LineSegments(rainGeometry, rainMaterial);
            rainField.visible = false;
            rainField.frustumCulled = false;
            scene.add(rainField);

            const weatherMaterials = [
                M.concrete, M.concreteLight, M.concreteDark, M.asphalt,
                M.roof, M.roofDark, M.roofLightBlue, M.paleRoof
            ];
            weatherMaterials.forEach(mat => {
                mat.userData.dryRoughness = mat.roughness;
                mat.userData.dryMetalness = mat.metalness;
            });
            const glowMaterials = [M.glass, M.glassBlue, M.officeGlass, M.officeGlassDark];

            function setWetSurface(wet) {
                weatherMaterials.forEach(mat => {
                    mat.roughness = wet ? Math.min(.3, mat.userData.dryRoughness) : mat.userData.dryRoughness;
                    mat.metalness = wet ? Math.min(1, mat.userData.dryMetalness + .2) : mat.userData.dryMetalness;
                });
            }

            function setWindowGlow(enabled) {
                glowMaterials.forEach((mat, index) => {
                    mat.emissive.set(enabled ? (index < 2 ? '#245d8c' : '#438db7') : '#000000');
                    mat.emissiveIntensity = enabled ? (index < 2 ? 1.25 : 1.9) : 0;
                });
                lampEmitterMaterial.emissiveIntensity = enabled ? 3.2 : 0;
            }

            function setVehicleLights(intensity) {
                movingVehicles.forEach(actor => {
                    actor.headlight.intensity = intensity;
                    actor.headlight.visible = intensity > 0;
                });
            }

            function setNightLights(lights, intensity) {
                lights.forEach(light => {
                    light.intensity = intensity;
                    light.visible = intensity > 0;
                });
            }

            function applyEnvironment(mode) {
                environmentMode = mode;
                sun.castShadow = mode === 'day';
                moon.castShadow = mode === 'night';
                renderer.shadowMap.needsUpdate = true;
                const warmToggle = document.getElementById('warm');
                if (mode !== 'day') warmToggle.checked = false;
                rainMaterial.opacity = .42;
                rainField.visible = mode === 'rain';
                setWetSurface(mode === 'rain');
                setWindowGlow(mode === 'night');

                if (mode === 'night') {
                    scene.background.set('#061426');
                    scene.fog = new THREE.FogExp2('#07192b', .0023);
                    ambient.color.set('#91b1db'); ambient.groundColor.set('#263b4d'); ambient.intensity = 1.2;
                    sun.color.set('#8b9fbd'); sun.position.set(-85, 145, 65); sun.intensity = .1;
                    skyFill.color.set('#3c5f91'); skyFill.intensity = .2;
                    moon.intensity = 2.4;
                    renderer.toneMappingExposure = 1.12;
                    setNightLights(siteNightLights, 24);
                    setNightLights(buildingNightLights, 28);
                    setVehicleLights(3.4);
                    environmentStatus.textContent = 'กลางคืน · เปิดไฟอาคารและเสาไฟทั่วบริเวณ';
                } else if (mode === 'rain') {
                    scene.background.set('#718896');
                    scene.fog = new THREE.FogExp2('#8295a0', .0034);
                    ambient.color.set('#c5d8e2'); ambient.groundColor.set('#566266'); ambient.intensity = 1.18;
                    sun.color.set('#c8d8e0'); sun.position.set(-55, 110, 70); sun.intensity = .7;
                    skyFill.color.set('#9cb6c4'); skyFill.intensity = .34;
                    moon.intensity = 0;
                    renderer.toneMappingExposure = .96;
                    setNightLights(siteNightLights, 2.8);
                    setNightLights(buildingNightLights, 0);
                    setVehicleLights(2.5);
                    environmentStatus.textContent = 'ฝนตก · พื้นผิวเปียกและทัศนวิสัยลดลง';
                } else if (mode === 'fog') {
                    scene.background.set('#d3dde0');
                    scene.fog = new THREE.FogExp2('#d3dde0', .0062);
                    ambient.color.set('#f2f7f7'); ambient.groundColor.set('#9ba6a2'); ambient.intensity = 1.85;
                    sun.color.set('#e6eeee'); sun.position.set(-70, 120, 65); sun.intensity = .82;
                    skyFill.color.set('#d9e5e8'); skyFill.intensity = .4;
                    moon.intensity = 0;
                    renderer.toneMappingExposure = 1.02;
                    setNightLights(siteNightLights, 1.2);
                    setNightLights(buildingNightLights, 0);
                    setVehicleLights(2.1);
                    environmentStatus.textContent = 'หมอก · บรรยากาศนุ่มและมีมิติ';
                } else {
                    scene.background.set('#c8e4f3');
                    scene.fog = null;
                    ambient.color.set('#ffffff'); ambient.groundColor.set('#73805f'); ambient.intensity = 2.45;
                    sun.color.set('#fff6df'); sun.position.set(-85, 145, 65); sun.intensity = 3.35;
                    skyFill.color.set('#b8dcff'); skyFill.intensity = .58;
                    moon.intensity = 0;
                    renderer.toneMappingExposure = 1.12;
                    setNightLights(siteNightLights, 0);
                    setNightLights(buildingNightLights, 0);
                    setVehicleLights(0);
                    environmentStatus.textContent = 'กลางวัน · แสงสดใสสำหรับงานพรีเซนต์';
                }

                document.querySelectorAll('.environment-mode').forEach(button => {
                    const active = button.dataset.environment === mode;
                    button.classList.toggle('active', active);
                    button.setAttribute('aria-pressed', String(active));
                });
            }

            let rainUpdateElapsed = 0;
            function updateWeather(dt) {
                if (!rainField.visible) {
                    rainUpdateElapsed = 0;
                    return;
                }
                rainUpdateElapsed += dt;
                if (rainUpdateElapsed < 1 / 30) return;
                dt = Math.min(rainUpdateElapsed, .1);
                rainUpdateElapsed = 0;
                const positions = rainGeometry.attributes.position.array;
                for (let i = 0; i < rainCount; i++) {
                    const offset = i * 6;
                    positions[offset] += dt * 4.5;
                    positions[offset + 1] -= dt * 64;
                    positions[offset + 3] += dt * 4.5;
                    positions[offset + 4] -= dt * 64;
                    if (positions[offset + 4] < 0) {
                        const x = (rand() - .5) * 245;
                        const z = (rand() - .5) * 220;
                        positions[offset] = x;
                        positions[offset + 1] = 125;
                        positions[offset + 2] = z;
                        positions[offset + 3] = x + .18;
                        positions[offset + 4] = 122.6;
                        positions[offset + 5] = z + .08;
                    }
                }
                rainGeometry.attributes.position.needsUpdate = true;
            }

            // ------------------------------------------------------------
            // Playable third-person character / GTA-style controller
            // ------------------------------------------------------------
            const playerKeys = {};
            let gameMode = false;
            let playerHeading = Math.PI;
            let gameCameraYaw = Math.PI;
            let gameCameraPitch = .08;
            let gameCameraDistance = 10.8;
            let gameFirstPerson = GAME_CONFIG.firstPerson;
            let playerWalkTime = 0;
            let playerVerticalVelocity = 0;
            let playerGrounded = true;
            let jumpQueued = false;
            let gameTouchLook = null;
            let gameMouseLook = null;
            let playerDropActive = false;
            let playerHasSpawned = false;
            let activeWeapon = 'unarmed';
            let attackTime = 0;
            let lastAttackAt = 0;
            let aiming = false;
            const weaponEffects = [];
            const combatRaycaster = new THREE.Raycaster();

            function playableCharacter() {
                const group = new THREE.Group();
                group.name = 'TDK Player';
                const model = new THREE.Group();
                model.scale.setScalar(.68);
                group.add(model);
                const torso = box(model, 1.02, 1.6, .64, 0, 2.42, 0, material('#0b78b8', .47, .08));
                box(model, 1.07, .42, .08, 0, 2.6, .37, M.white, false);
                const logo = new THREE.Mesh(
                    new THREE.PlaneGeometry(.62, .22),
                    new THREE.MeshBasicMaterial({ map: textTexture('TDK', { background: '#f7f8f4', color: '#0c5c9c', size: 72 }) })
                );
                logo.position.set(0, 2.62, .415); model.add(logo);
                const belt = box(model, 1.07, .16, .68, 0, 1.67, 0, M.dark);
                const head = new THREE.Mesh(new THREE.SphereGeometry(.41, 16, 12), material('#dfa47d', .66));
                head.position.y = 3.62; head.castShadow = true; model.add(head);
                const helmet = new THREE.Mesh(
                    new THREE.SphereGeometry(.45, 16, 8, 0, Math.PI * 2, 0, Math.PI * .56),
                    material('#f5f6ef', .34, .12)
                );
                helmet.position.y = 3.76; helmet.castShadow = true; model.add(helmet);
                box(model, .82, .12, .12, 0, 3.83, .34, M.blue, false);
                const arms = [];
                const legs = [];
                for (const side of [-1, 1]) {
                    const arm = cyl(model, .12, .135, 1.36, side * .63, 2.38, 0, material('#dfa47d', .66), 9);
                    const leg = cyl(model, .16, .17, 1.52, side * .27, .86, 0, M.dark, 10);
                    arms.push(arm); legs.push(leg);
                }

                const weaponMount = new THREE.Group();
                weaponMount.position.set(.62, 1.92, .2);
                model.add(weaponMount);

                const knife = new THREE.Group();
                knife.name = 'Knife';
                const knifeHandle = box(knife, .16, .48, .14, 0, .12, 0, material('#17212a', .42, .58));
                const blade = box(knife, .11, .82, .055, 0, .76, 0, material('#dce8ec', .22, .8));
                blade.rotation.z = -.08;
                knife.rotation.x = -.35;
                knife.visible = false;
                weaponMount.add(knife);

                const pistol = new THREE.Group();
                pistol.name = 'Pistol';
                box(pistol, .2, .3, .72, 0, .16, .3, material('#222b30', .32, .72));
                const grip = box(pistol, .18, .5, .2, 0, -.18, .1, material('#11171b', .5, .45));
                grip.rotation.x = -.2;
                const muzzle = new THREE.Object3D();
                muzzle.position.set(0, .16, .72);
                pistol.add(muzzle);
                const muzzleFlash = new THREE.Mesh(
                    new THREE.SphereGeometry(.18, 7, 5),
                    new THREE.MeshBasicMaterial({ color: '#ffd45c', transparent: true, opacity: .95 })
                );
                muzzleFlash.scale.set(1, 1, 2.4);
                muzzleFlash.position.set(0, 0, .14);
                muzzleFlash.visible = false;
                muzzle.add(muzzleFlash);
                pistol.rotation.x = -.14;
                pistol.visible = false;
                weaponMount.add(pistol);

                group.userData = { torso, belt, arms, legs, model, weaponMount, knife, pistol, muzzle, muzzleFlash };
                group.position.set(GAME_CONFIG.spawn.x, GAME_CONFIG.spawn.y, GAME_CONFIG.spawn.z);
                group.rotation.y = playerHeading;
                group.visible = false;
                scene.add(group);
                return group;
            }

            const player = playableCharacter();
            const cameraCollisionRay = new THREE.Ray();
            const firstPersonWeapon = new THREE.Group();
            firstPersonWeapon.position.set(.46, -.43, -.82);
            firstPersonWeapon.visible = false;
            perspectiveCamera.add(firstPersonWeapon);
            const viewKnife = new THREE.Group();
            box(viewKnife, .075, .48, .06, .02, .03, 0, material('#161f26', .35, .65));
            const viewBlade = box(viewKnife, .055, .72, .025, .02, .58, 0, material('#dfe8ea', .18, .86));
            viewBlade.rotation.z = -.12;
            viewKnife.rotation.set(.2, -.38, -.62);
            firstPersonWeapon.add(viewKnife);
            const viewPistol = new THREE.Group();
            box(viewPistol, .16, .22, .58, 0, .13, 0, material('#1c252c', .32, .75));
            const viewGrip = box(viewPistol, .14, .42, .16, 0, -.18, -.12, material('#0b1116', .48, .45));
            viewGrip.rotation.x = -.18;
            viewPistol.rotation.set(.05, -.25, -.12);
            firstPersonWeapon.add(viewPistol);

            function syncFirstPersonWeapon() {
                firstPersonWeapon.visible = gameMode && gameFirstPerson && activeWeapon !== 'unarmed';
                viewKnife.visible = activeWeapon === 'knife';
                viewPistol.visible = activeWeapon === 'pistol';
            }

            function setGameView(firstPerson) {
                gameFirstPerson = firstPerson;
                player.visible = gameMode && !gameFirstPerson;
                syncFirstPersonWeapon();
                if (gameMode) {
                    const label = gameFirstPerson ? 'First-person' : 'Third-person (เห็นตัวละคร)';
                    const status = document.getElementById('game-status');
                    status.textContent = `มุมมอง: ${label} · กด V เพื่อสลับมุมมอง`;
                    status.classList.add('show');
                    clearTimeout(setGameView.statusTimer);
                    setGameView.statusTimer = setTimeout(() => {
                        if (gameMode && document.pointerLockElement === renderer.domElement) status.classList.remove('show');
                    }, 1500);
                }
            }

            function clearPlayerInput() {
                Object.keys(playerKeys).forEach(key => playerKeys[key] = false);
                jumpQueued = false;
            }

            function spawnPlayerFromSky() {
                const spawn = findNearestWalkablePosition(GAME_CONFIG.spawn.x, GAME_CONFIG.spawn.z);
                player.position.set(spawn.x, GAME_CONFIG.spawn.y, spawn.z);
                playerVerticalVelocity = 0;
                playerGrounded = false;
                playerDropActive = true;
                playerHasSpawned = true;
            }

            function selectWeapon(name) {
                if (!['unarmed', 'knife', 'pistol'].includes(name)) return;
                activeWeapon = name;
                player.userData.knife.visible = name === 'knife';
                player.userData.pistol.visible = name === 'pistol';
                syncFirstPersonWeapon();
                document.querySelectorAll('.weapon-slot').forEach(slot => {
                    slot.classList.toggle('active', slot.dataset.weapon === name);
                });
                const names = { unarmed: 'มือเปล่า', knife: 'มีด', pistol: 'ปืน' };
                const status = document.getElementById('game-status');
                status.textContent = `เลือก: ${names[name]}`;
                status.classList.add('show');
                clearTimeout(selectWeapon.statusTimer);
                selectWeapon.statusTimer = setTimeout(() => {
                    if (gameMode && document.pointerLockElement === renderer.domElement) status.classList.remove('show');
                }, 900);
            }

            document.querySelectorAll('.weapon-slot').forEach(slot => {
                slot.addEventListener('click', () => {
                    if (gameMode) selectWeapon(slot.dataset.weapon);
                });
            });

            function isPlayerPart(object) {
                for (let node = object; node; node = node.parent) if (node === player) return true;
                return false;
            }

            function npcFromObject(object) {
                for (let node = object; node; node = node.parent) {
                    if (node.userData?.npcRoot) return node.userData.npcRoot;
                }
                return null;
            }

            function damageNpc(npc, amount) {
                if (!npc || npc.userData.dead) return;
                npc.userData.health = Math.max(0, npc.userData.health - amount);
                drawNpcHealthBar(npc);
                npc.userData.healthBar.material.color.set(npc.userData.health > 0 ? '#ffffff' : '#777777');
                if (npc.userData.health > 0) return;
                npc.userData.dead = true;
                npc.userData.actor.dead = true;
                npc.userData.healthBar.visible = false;
                npc.rotation.z = Math.PI / 2;
                npc.position.y = .18;
                document.getElementById('game-status').textContent = 'NPC ถูกกำจัดแล้ว';
                document.getElementById('game-status').classList.add('show');
            }

            function damageNpcInFront(range, amount) {
                const direction = new THREE.Vector3();
                camera.getWorldDirection(direction);
                // NPC health bars are Sprites. Three.js requires the active camera
                // on a raycaster before a Sprite can be intersected safely.
                combatRaycaster.camera = camera;
                combatRaycaster.set(camera.position, direction);
                combatRaycaster.far = range;
                const hit = combatRaycaster.intersectObjects(scene.children, true)
                    .find(result => !isPlayerPart(result.object) && result.object.visible && result.distance > .25);
                if (hit) damageNpc(npcFromObject(hit.object), amount);
            }

            function addShotEffect() {
                const muzzle = new THREE.Vector3();
                player.userData.muzzle.getWorldPosition(muzzle);
                const direction = new THREE.Vector3();
                camera.getWorldDirection(direction);
                combatRaycaster.camera = camera;
                combatRaycaster.set(camera.position, direction);
                combatRaycaster.far = 120;
                const hit = combatRaycaster.intersectObjects(scene.children, true)
                    .find(result => !isPlayerPart(result.object) && result.object.visible &&
                        result.object.type !== 'Line' && result.distance > 1.5);
                if (hit) damageNpc(npcFromObject(hit.object), GAME_CONFIG.weaponDamage.pistol);
                const end = hit ? hit.point.clone() : camera.position.clone().add(direction.multiplyScalar(120));
                const geometry = new THREE.BufferGeometry().setFromPoints([muzzle, end]);
                const tracer = new THREE.Line(
                    geometry,
                    new THREE.LineBasicMaterial({ color: '#ffe78a', transparent: true, opacity: .95 })
                );
                scene.add(tracer);
                const spark = new THREE.Mesh(
                    new THREE.SphereGeometry(.12, 6, 4),
                    new THREE.MeshBasicMaterial({ color: '#ffb331', transparent: true, opacity: .95 })
                );
                spark.position.copy(end);
                scene.add(spark);
                weaponEffects.push({ tracer, spark, life: .095 });
            }

            function performAttack() {
                if (!gameMode) return;
                const now = performance.now() / 1000;
                const delay = activeWeapon === 'pistol' ? .2 : activeWeapon === 'knife' ? .42 : .32;
                if (now - lastAttackAt < delay) return;
                lastAttackAt = now;
                attackTime = activeWeapon === 'pistol' ? .16 : .34;
                if (activeWeapon === 'pistol') {
                    player.userData.muzzleFlash.visible = true;
                    addShotEffect();
                } else {
                    damageNpcInFront(
                        GAME_CONFIG.weaponRange[activeWeapon],
                        GAME_CONFIG.weaponDamage[activeWeapon]
                    );
                }
            }

            function updateWeaponEffects(dt) {
                for (let i = weaponEffects.length - 1; i >= 0; i--) {
                    const fx = weaponEffects[i];
                    fx.life -= dt;
                    fx.tracer.material.opacity = Math.max(0, fx.life * 10);
                    fx.spark.material.opacity = Math.max(0, fx.life * 10);
                    fx.spark.scale.multiplyScalar(.94);
                    if (fx.life <= 0) {
                        scene.remove(fx.tracer, fx.spark);
                        fx.tracer.geometry.dispose();
                        fx.tracer.material.dispose();
                        fx.spark.geometry.dispose();
                        fx.spark.material.dispose();
                        weaponEffects.splice(i, 1);
                    }
                }
            }

            function playerCollisionCount(x, z) {
                const radius = GAME_CONFIG.playerRadius;
                const b = SITE.renderBounds;
                let collisions = 0;
                if (x < b.minX + 2 + radius || x > b.maxX - 2 - radius ||
                    z < b.rearZ + 2 + radius || z > b.entranceZ - 1 - radius) collisions += 1000;
                staticColliders.forEach(c => {
                    if (
                    x + radius > c.minX && x - radius < c.maxX && z + radius > c.minZ && z - radius < c.maxZ
                    ) collisions++;
                });
                editableObjects.forEach(group => {
                    const box = group.userData.editorBounds;
                    if (!isGameplayCollider(group, box)) return;
                    if (box && x + radius > box.min.x && x - radius < box.max.x &&
                        z + radius > box.min.z && z - radius < box.max.z) collisions++;
                });
                return collisions;
            }

            function isGameplayCollider(group, box = group.userData.editorBounds) {
                if (!group.userData.editor?.collidable || !box || box.isEmpty()) return false;
                // Ground slabs, road paint and long guide lines are selectable in the
                // editor but must never behave like full-height walls in walk mode.
                return box.max.y - box.min.y > 1.25 && box.min.y < GAME_CONFIG.eyeHeight + .5;
            }

            function playerBlocked(x, z) {
                return playerCollisionCount(x, z) > 0;
            }

            function findNearestWalkablePosition(originX, originZ) {
                const spacing = Math.max(2, GAME_CONFIG.playerRadius * 2.5);
                const hasMovementClearance = (x, z) => !playerBlocked(x, z) &&
                    !playerBlocked(x + spacing, z) && !playerBlocked(x - spacing, z) &&
                    !playerBlocked(x, z + spacing) && !playerBlocked(x, z - spacing);
                if (hasMovementClearance(originX, originZ)) return { x: originX, z: originZ };
                for (let radius = spacing; radius <= 70; radius += spacing) {
                    const samples = Math.max(12, Math.ceil(Math.PI * 2 * radius / spacing));
                    for (let index = 0; index < samples; index++) {
                        const angle = index / samples * Math.PI * 2;
                        const x = originX + Math.cos(angle) * radius;
                        const z = originZ + Math.sin(angle) * radius;
                        if (hasMovementClearance(x, z)) return { x, z };
                    }
                }
                return { x: 0, z: SITE.renderBounds.entranceZ - 8 };
            }

            function updatePlayer(dt) {
                if (!gameMode) return;
                const { forward, strafe } = getMovementInput(playerKeys);
                const running = playerKeys.ShiftLeft || playerKeys.ShiftRight;
                const speed = running ? GAME_CONFIG.runSpeed : GAME_CONFIG.walkSpeed;
                const { x: dx, z: dz } = movementDelta({
                    forward, strafe, yaw: gameCameraYaw, speed, dt
                });

                // Resolve each axis independently so the character slides along walls.
                // If an edited/saved object encloses the spawn point, also allow steps
                // that reduce the overlap so the player can escape instead of freezing.
                let collisionCount = playerCollisionCount(player.position.x, player.position.z);
                const nextXCollisionCount = playerCollisionCount(player.position.x + dx, player.position.z);
                if (nextXCollisionCount === 0 || nextXCollisionCount < collisionCount) {
                    player.position.x += dx;
                    collisionCount = nextXCollisionCount;
                }
                const nextZCollisionCount = playerCollisionCount(player.position.x, player.position.z + dz);
                if (nextZCollisionCount === 0 || nextZCollisionCount < collisionCount) player.position.z += dz;
                playerHeading = gameCameraYaw;
                player.rotation.y = playerHeading;

                if (jumpQueued && playerGrounded) {
                    playerVerticalVelocity = GAME_CONFIG.jumpVelocity;
                    playerGrounded = false;
                }
                jumpQueued = false;
                playerVerticalVelocity -= GAME_CONFIG.gravity * dt;
                player.position.y += playerVerticalVelocity * dt;
                if (player.position.y <= 0) {
                    player.position.y = 0;
                    playerVerticalVelocity = 0;
                    playerGrounded = true;
                    if (playerDropActive) {
                        playerDropActive = false;
                        const status = document.getElementById('game-status');
                        status.textContent = 'ลงถึงจุดกลางแผนที่แล้ว · กดเมาส์ขวาค้างแล้วลากเพื่อหมุนมุมมอง';
                        status.classList.add('show');
                    }
                }

                const moving = Math.abs(forward) + Math.abs(strafe) > .05;
                const model = player.userData.model;
                if (moving && playerGrounded) {
                    playerWalkTime += dt * (running ? 13 : 8);
                    const stride = Math.sin(playerWalkTime);
                    player.userData.arms[0].rotation.x = stride * .78;
                    player.userData.arms[1].rotation.x = -stride * .78;
                    player.userData.legs[0].rotation.x = -stride * .82;
                    player.userData.legs[1].rotation.x = stride * .82;
                    model.position.y = Math.abs(Math.sin(playerWalkTime * 2)) * .055;
                } else {
                    player.userData.arms.forEach(limb => limb.rotation.x *= .78);
                    player.userData.legs.forEach(limb => limb.rotation.x *= .78);
                    model.position.y *= .72;
                }

                attackTime = Math.max(0, attackTime - dt);
                const attackPhase = attackTime > 0 ? Math.sin((attackTime / (activeWeapon === 'pistol' ? .16 : .34)) * Math.PI) : 0;
                if (activeWeapon === 'knife') {
                    player.userData.arms[1].rotation.x = -1.05 - attackPhase * 1.55;
                    player.userData.arms[1].rotation.z = -.25 - attackPhase * .65;
                    player.userData.weaponMount.rotation.z = -attackPhase * 1.05;
                } else if (activeWeapon === 'pistol') {
                    player.userData.arms[1].rotation.x = -1.25 - attackPhase * .18;
                    player.userData.arms[0].rotation.x = -.72;
                    player.userData.weaponMount.position.z = .2 - attackPhase * .16;
                } else if (attackTime > 0) {
                    player.userData.arms[1].rotation.x = -attackPhase * 1.65;
                }
                if (activeWeapon !== 'knife') {
                    player.userData.arms[1].rotation.z *= .76;
                    player.userData.weaponMount.rotation.z *= .72;
                }
                if (activeWeapon !== 'pistol') player.userData.weaponMount.position.z += (.2 - player.userData.weaponMount.position.z) * .25;
                player.userData.muzzleFlash.visible = activeWeapon === 'pistol' && attackTime > .105;
                if (playerKeys.Mouse0) performAttack();
                updateWeaponEffects(dt);

                const cameraOrigin = player.position.clone().add(new THREE.Vector3(0, GAME_CONFIG.eyeHeight, 0));
                const lookDirection = new THREE.Vector3(
                    Math.sin(gameCameraYaw) * Math.cos(gameCameraPitch),
                    Math.sin(gameCameraPitch),
                    Math.cos(gameCameraYaw) * Math.cos(gameCameraPitch)
                );
                if (gameFirstPerson) {
                    camera.position.copy(cameraOrigin);
                    camera.lookAt(cameraOrigin.clone().add(lookDirection));
                    return;
                }
                const followDistance = aiming && activeWeapon === 'pistol' ? 6.4 : gameCameraDistance;
                const horizontalDistance = Math.cos(gameCameraPitch) * followDistance;
                const desiredCamera = new THREE.Vector3(
                    -Math.sin(gameCameraYaw) * horizontalDistance,
                    2.55 + Math.sin(gameCameraPitch) * followDistance,
                    -Math.cos(gameCameraYaw) * horizontalDistance
                ).add(player.position);
                const cameraVector = desiredCamera.clone().sub(cameraOrigin);
                const cameraDistance = cameraVector.length();
                cameraCollisionRay.set(cameraOrigin, cameraVector.normalize());
                let nearestCameraHit = cameraDistance;
                const cameraHitPoint = new THREE.Vector3();
                staticColliders.forEach(collider => {
                    const hit = cameraCollisionRay.intersectBox(collider.cameraBox, cameraHitPoint);
                    if (hit) {
                        const distance = hit.distanceTo(cameraOrigin);
                        if (distance > .4 && distance < nearestCameraHit) nearestCameraHit = distance;
                    }
                });
                editableObjects.forEach(group => {
                    if (!isGameplayCollider(group)) return;
                    const hit = cameraCollisionRay.intersectBox(group.userData.editorBounds, cameraHitPoint);
                    if (hit) {
                        const distance = hit.distanceTo(cameraOrigin);
                        if (distance > .4 && distance < nearestCameraHit) nearestCameraHit = distance;
                    }
                });
                if (nearestCameraHit < cameraDistance) {
                    desiredCamera.copy(cameraOrigin).add(
                        cameraVector.multiplyScalar(Math.max(1.8, nearestCameraHit - .7))
                    );
                }
                const followStrength = 1 - Math.pow(.0015, dt);
                camera.position.lerp(desiredCamera, followStrength);
                const lookAt = player.position.clone().add(new THREE.Vector3(
                    Math.sin(gameCameraYaw) * (aiming ? 9 : 3.8), 2.25,
                    Math.cos(gameCameraYaw) * (aiming ? 9 : 3.8)
                ));
                camera.lookAt(lookAt);
            }

            function setGameMode(enabled) {
                if (enabled) closeInterior({ restoreCamera: false });
                if (enabled && editorMode) setEditorMode(false);
                if (enabled && camera !== perspectiveCamera) {
                    setActiveCamera(perspectiveCamera);
                    controls.enableRotate = true;
                }
                gameMode = enabled;
                player.visible = enabled && !gameFirstPerson;
                syncFirstPersonWeapon();
                controls.enabled = !enabled && !overlayEnabled;
                controls.autoRotate = false;
                transition = null;
                document.getElementById('rotate').checked = false;
                document.body.classList.toggle('game-active', enabled);
                document.getElementById('game-hud').classList.toggle('show', enabled);
                document.getElementById('crosshair').classList.toggle('show', enabled);
                document.getElementById('weapon-hud').classList.toggle('show', enabled);
                document.getElementById('game-pad').classList.toggle('show', enabled && innerWidth <= 900);
                const button = document.getElementById('game-toggle');
                button.classList.toggle('active', enabled);
                button.textContent = enabled ? '✕ ออกจากโหมดเดิน' : '🎮 เข้าโหมดเดินในแมพ';
                if (enabled) {
                    clearPlayerInput();
                    if (!playerHasSpawned) spawnPlayerFromSky();
                    else if (playerBlocked(player.position.x, player.position.z)) {
                        const safePosition = findNearestWalkablePosition(player.position.x, player.position.z);
                        player.position.x = safePosition.x;
                        player.position.z = safePosition.z;
                    }
                    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
                    gameCameraYaw = playerHeading;
                    gameCameraPitch = .08;
                    gameCameraDistance = 10.8;
                    camera.position.set(player.position.x, 7.2, player.position.z + 11);
                    camera.lookAt(player.position.x, 2.5, player.position.z - 3);
                    document.getElementById('info-title').textContent = 'โหมดเกม — เดินสำรวจโรงงาน';
                    document.getElementById('info-text').textContent = 'คลิกฉากเพื่อจับเมาส์ · WASD เดิน · Space กระโดด · Shift วิ่ง · V สลับมุมมอง (เห็นตัวละคร) · 1/2/3 เลือกมือเปล่า/มีด/ปืน · คลิกซ้ายโจมตี · Esc ออก';
                    document.getElementById('game-status').textContent = 'ตัวละครกำลังลงสู่จุดกลางแผนที่ · กดเมาส์ขวาค้างแล้วลากเพื่อหมุนมุมมอง';
                    document.getElementById('game-status').classList.add('show');
                    renderer.domElement.focus({ preventScroll: true });
                } else {
                    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
                    clearPlayerInput();
                    gameTouchLook = null;
                    gameMouseLook = null;
                    aiming = false;
                    controls.target.copy(player.position).setY(2.2);
                    controls.enabled = !overlayEnabled;
                    document.getElementById('game-status').classList.remove('show');
                    document.getElementById('info-title').textContent = 'TDK Industrial — Factory Campus';
                    document.getElementById('info-text').textContent = 'กลับสู่โหมดสำรวจด้วยเมาส์แล้ว';
                }
            }

            renderer.domElement.addEventListener('wheel', event => {
                if (!gameMode) return;
                event.preventDefault();
                gameCameraDistance = THREE.MathUtils.clamp(gameCameraDistance + event.deltaY * .012, 4.6, 16);
            }, { passive: false });

            // ------------------------------------------------------------
            // Trees, palms, gardens and boundary walls
            // ------------------------------------------------------------
            const leafGeo = new THREE.IcosahedronGeometry(1, 1);

            function tree(x, z, size = 1) {
                const group = new THREE.Group();
                group.name = 'Tree';
                group.position.set(x, 0, z);
                scene.add(group);
                cyl(group, .13 * size, .23 * size, 2.8 * size, 0, 1.4 * size, 0, M.trunk, 7);
                for (let i = 0; i < 4; i++) {
                    const leaf = new THREE.Mesh(leafGeo, M.foliage[Math.floor(rand() * 4)]);
                    leaf.position.set(
                        (rand() - .5) * 1.8 * size,
                        (2.9 + rand() * 1.2) * size,
                        (rand() - .5) * 1.8 * size
                    );
                    leaf.scale.set(
                        (1.2 + rand() * .6) * size,
                        (1.6 + rand() * .6) * size,
                        (1.2 + rand() * .6) * size
                    );
                    leaf.castShadow = true;
                    leaf.receiveShadow = true;
                    group.add(leaf);
                }
                return group;
            }

            function palm(x, z, s = 1) {
                cyl(scene, .1 * s, .21 * s, 5.5 * s, x, 2.75 * s, z, M.trunk, 8);
                for (let i = 0; i < 8; i++) {
                    const angle = i * Math.PI / 4 + rand() * .15;
                    const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
                    const start = new THREE.Vector3(x, 5.45 * s, z);
                    const mid = start.clone().addScaledVector(dir, 1.25 * s);
                    mid.y += .7 * s;
                    const tip = start.clone().addScaledVector(dir, 2.7 * s);
                    tip.y -= .65 * s;
                    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(.38 * s);
                    const p1 = mid.clone().add(side);
                    const p2 = mid.clone().sub(side);
                    const geometry = new THREE.BufferGeometry();
                    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
                        ...start.toArray(), ...p1.toArray(), ...tip.toArray(),
                        ...start.toArray(), ...tip.toArray(), ...p2.toArray()
                    ], 3));
                    geometry.computeVertexNormals();
                    const mat = new THREE.MeshStandardMaterial({
                        color: i % 2 ? '#467a3e' : '#588b45',
                        side: THREE.DoubleSide, roughness: 1
                    });
                    const leaf = new THREE.Mesh(geometry, mat);
                    leaf.castShadow = true;
                    scene.add(leaf);
                    beam(scene, start.toArray(), mid.toArray(), .025 * s, M.trunk);
                }
            }

            function storeOrnamentalTree(x, z, size = 1) {
                const trunkHeight = 3.2 * size;
                cyl(scene, .16 * size, .28 * size, trunkHeight, x, trunkHeight / 2, z, M.trunk, 9);
                for (const [dx, dz] of [[-1.5, -.8], [-1.25, .75], [1.35, -.65], [1.45, .8]]) {
                    beam(scene,
                        [x, trunkHeight * .64, z],
                        [x + dx * size, trunkHeight + .28 * size, z + dz * size],
                        .1 * size, M.trunk);
                }
                for (let i = 0; i < 9; i++) {
                    const angle = i * Math.PI * 2 / 9;
                    const radius = (1.15 + (i % 3) * .28) * size;
                    const crown = new THREE.Mesh(leafGeo, M.foliage[i % M.foliage.length]);
                    crown.position.set(
                        x + Math.cos(angle) * radius,
                        trunkHeight + (i % 2) * .18 * size,
                        z + Math.sin(angle) * radius * .62
                    );
                    crown.scale.set(1.05 * size, .62 * size, .85 * size);
                    crown.castShadow = true;
                    crown.receiveShadow = true;
                    scene.add(crown);
                }
            }

            function storeWeighbridge(x, z) {
                const deckW = 4.2;
                const deckD = 12.4;
                box(scene, deckW + 1.4, .18, deckD + 3.8, x, .08, z, M.concreteDark, false);
                box(scene, deckW, .32, deckD, x, .31, z, M.dark);
                box(scene, deckW - .24, .12, deckD - .3, x, .52, z, M.concrete);
                for (const side of [-1, 1]) {
                    box(scene, .12, .09, deckD + 1.2, x + side * (deckW / 2 + .08),
                        .63, z, M.chrome, false);
                    for (let end = -1; end <= 1; end += 2) {
                        box(scene, .38, .2, .5, x + side * (deckW / 2 - .18),
                            .17, z + end * (deckD * .34), M.concreteDark);
                    }
                }
                for (const end of [-1, 1]) {
                    const ramp = box(scene, deckW, .16, 1.8, x, .14, z + end * (deckD / 2 + .9), M.concreteDark, false);
                    ramp.rotation.x = end * -.035;
                    box(scene, deckW - .35, .045, 1.5, x, .24, z + end * (deckD / 2 + .9), M.concrete, false);
                }
                for (const offset of [-1.25, 1.25]) {
                    box(scene, .045, .025, deckD - .8, x + offset, .59, z, M.frame, false);
                }

                const indicator = new THREE.Group();
                indicator.position.set(x + deckW / 2 + 1.2, 0, z - deckD / 2 + 1.4);
                scene.add(indicator);
                box(indicator, .75, 1.5, .65, 0, .75, 0, M.frame);
                box(indicator, .5, .3, .06, 0, 1.08, .36,
                    new THREE.MeshBasicMaterial({ color: '#18332e' }), false);
                box(indicator, .95, .12, .85, 0, .08, 0, M.concreteDark);
                identify(indicator, 'แท่นชั่งรถบรรทุก', 'แท่นชั่งพร้อมจอแสดงค่าน้ำหนักและทางลาดขึ้นลง');
            }

            const storeSceneData = BUILDING_BY_ID.doke1_store;
            const storeFrontX = toRender(storeSceneData.position.x);
            const storeFrontZ = toRender(storeSceneData.position.z + storeSceneData.size.depth / 2);
            const storeFrontWidth = toRender(storeSceneData.size.width);
            const storeGardenWidth = 21;
            const storeGardenX = storeFrontX - 7;
            const storeGardenDepth = 4.8;
            box(scene, storeGardenWidth, .12, storeGardenDepth,
                storeGardenX, .1, storeFrontZ + storeGardenDepth / 2, M.foliage[1], false);
            storeOrnamentalTree(storeGardenX - 5.2, storeFrontZ + 2.2, .68);

            const flagPlinth = box(scene, 12.4, .34, 1.35,
                storeFrontX + .2, .19, storeFrontZ + 6.8, M.concreteDark, false);
            flagPlinth.name = 'Store flagpole plinth';

            // The truck scale sits on the paved apron in front of the Store.
            storeWeighbridge(storeFrontX + storeFrontWidth / 2 + 6.8, storeFrontZ + 15.8);

            // Boundary walls with slim fence bars.
            function boundary(x1, z1, x2, z2) {
                const length = Math.hypot(x2 - x1, z2 - z1);
                const group = new THREE.Group();
                group.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
                group.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
                scene.add(group);
                box(group, length, .75, .3, 0, .375, 0, M.base);
                for (let x = -length / 2; x <= length / 2; x += 3.5) {
                    box(group, .2, 2.6, .22, x, 1.3, 0, M.fence);
                }
                for (const y of [1.1, 2.3]) {
                    box(group, length, .06, .06, 0, y, 0, M.fence, false);
                }
                for (let x = -length / 2; x < length / 2; x += .65) {
                    box(group, .035, 1.35, .035, x, 1.65, 0, M.fence, false);
                }
                return group;
            }
            FENCES.forEach((segment, index) =>
                boundary(...segment.map(toRender)).name = `Perimeter fence ${index + 1}`);

            let concreteWallIndex = 0;
            function concreteBoundary(x1, z1, x2, z2, name = '') {
                const length = Math.hypot(x2 - x1, z2 - z1);
                const group = new THREE.Group();
                group.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
                group.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
                group.name = name || `Front concrete wall ${++concreteWallIndex}`;
                scene.add(group);
                box(group, length, 1.7, .55, 0, .85, 0, M.base);
                box(group, length + .25, .16, .72, 0, 1.73, 0, M.concreteLight);
                for (let x = -length / 2; x <= length / 2; x += 6.5) {
                    box(group, .7, 2.15, .8, x, 1.08, 0, M.concreteDark);
                }
            }
            FRONT_WALLS.forEach(segment => concreteBoundary(...segment.map(toRender)));

            // Main Office entrance edge: concrete wall with a green field beyond it.
            const officeWallStart = [-18.5, 78];
            const officeWallEnd = [-4.8, 18];
            concreteBoundary(...officeWallStart, ...officeWallEnd, 'Main Office side wall');
            const wallDx = officeWallEnd[0] - officeWallStart[0];
            const wallDz = officeWallEnd[1] - officeWallStart[1];
            const wallLength = Math.hypot(wallDx, wallDz);
            const outsideNormal = [-wallDz / wallLength, wallDx / wallLength];
            stripBetween(scene,
                officeWallStart[0] + outsideNormal[0] * 5,
                officeWallStart[1] + outsideNormal[1] * 5,
                officeWallEnd[0] + outsideNormal[0] * 5,
                officeWallEnd[1] + outsideNormal[1] * 5,
                10, .08, M.concreteLight, .12);

            const rackSideBuilding = BUILDING_BY_ID.rack_dome;
            const rackSideX = toRender(rackSideBuilding.position.x - rackSideBuilding.size.width / 2) - 3.5;
            const rackSideCenterZ = toRender(rackSideBuilding.position.z);
            const rackSidePolePoints = [-10, 0, 10].map(offset => [
                rackSideX, rackSideCenterZ + offset
            ]);
            rackSidePolePoints.forEach(([x, z]) => utilityPole(x, z, M.concreteDark));
            for (let index = 0; index < rackSidePolePoints.length - 1; index++) {
                const [x1, z1] = rackSidePolePoints[index];
                const [x2, z2] = rackSidePolePoints[index + 1];
                for (const offset of [-1.15, 0, 1.15]) {
                    beam(scene, [x1 + offset, 8.68, z1], [x2 + offset, 8.68, z2], .035, M.dark);
                }
            }

            // Palms alternate with utility poles in a straight line along the right fence.
            for (const z of [33, 3, -27, -57]) palm(rightBoundaryX, z, .82);

            // Tall narrow trees along the left and rear boundaries.
            for (let z = -70; z < 62; z += toRender(VEGETATION.rearTreeSpacing)) tree(-81, z, 1.45 + rand() * .35);
            for (let x = -75; x < 85; x += toRender(VEGETATION.rearTreeSpacing)) tree(x, -94, 1.5 + rand() * .6);

            const fieldCanvas = document.createElement('canvas');
            fieldCanvas.width = fieldCanvas.height = 256;
            const fieldContext = fieldCanvas.getContext('2d');
            fieldContext.fillStyle = '#748550';
            fieldContext.fillRect(0, 0, 256, 256);
            for (let index = 0; index < 13000; index++) {
                const shade = Math.floor(rand() * 36) - 18;
                const red = 116 + shade;
                const green = 134 + shade;
                const blue = 76 + Math.floor(shade * .55);
                fieldContext.fillStyle = `rgba(${red},${green},${blue},${.12 + rand() * .28})`;
                const size = .5 + rand() * 2.4;
                fieldContext.fillRect(rand() * 256, rand() * 256, size, size);
            }
            const fieldTexture = new THREE.CanvasTexture(fieldCanvas);
            fieldTexture.colorSpace = THREE.SRGBColorSpace;
            fieldTexture.wrapS = fieldTexture.wrapT = THREE.RepeatWrapping;
            fieldTexture.repeat.set(3, 5);
            const fieldBedMaterial = new THREE.MeshStandardMaterial({
                color: '#b5c29a', map: fieldTexture, roughness: 1
            });
            const cropMaterials = ['#b5c29a', '#b9c49b', '#b1bf94'].map(color =>
                new THREE.MeshStandardMaterial({
                    color, map: fieldTexture, roughness: 1
                })
            );
            function agriculturalPlot(x, z, width, depth, shrubsAlongZ = true) {
                box(scene, width, .12, depth, x, -.54, z, fieldBedMaterial, false);
                const plotColumns = 3;
                const plotRows = Math.ceil(depth / 22);
                const plotWidth = width / plotColumns;
                const plotDepth = depth / plotRows;
                for (let column = 0; column < plotColumns; column++) {
                    for (let row = 0; row < plotRows; row++) {
                        const patchWidth = plotWidth - 1.1 - rand() * .7;
                        const patchDepth = plotDepth - 1.1 - rand() * .7;
                        const patchX = x - width / 2 + plotWidth * (column + .5) +
                            (rand() - .5) * .8;
                        const patchZ = z - depth / 2 + plotDepth * (row + .5) +
                            (rand() - .5) * .8;
                        const patch = box(scene, patchWidth, .012, patchDepth,
                            patchX, -.474, patchZ,
                            cropMaterials[Math.floor(rand() * cropMaterials.length)], false);
                        patch.castShadow = false;
                        patch.receiveShadow = false;
                    }
                }

                const shrubs = (sx, sz) => {
                    const shrub = new THREE.Mesh(leafGeo, M.foliage[Math.floor(rand() * M.foliage.length)]);
                    shrub.position.set(sx + (rand() - .5) * 1.2, -.12, sz + (rand() - .5) * 1.2);
                    shrub.scale.set(.8 + rand() * .45, .26 + rand() * .18, .65 + rand() * .4);
                    shrub.castShadow = true;
                    shrub.receiveShadow = true;
                    scene.add(shrub);
                };
                if (shrubsAlongZ) {
                    for (const edgeX of [x - width / 2 - 1.8, x + width / 2 + 1.8]) {
                        for (let index = 0; index <= plotRows; index++) {
                            shrubs(edgeX, z - depth / 2 + index * depth / plotRows);
                        }
                    }
                } else {
                    for (const edgeZ of [z - depth / 2 - 1.8, z + depth / 2 + 1.8]) {
                        for (let index = 0; index <= Math.ceil(width / 18); index++) {
                            shrubs(x - width / 2 + index * width / Math.ceil(width / 18), edgeZ);
                        }
                    }
                }
            }
            agriculturalPlot(-108, 0, 42, 160);
            agriculturalPlot(108, 0, 42, 160);
            agriculturalPlot(0, -122, 170, 32, false);

            // A shaded pedestrian lane runs behind the Main Office, framed by two
            // planted tree rows like the reference while staying clear of the car park.
            const officeCenterX = toRender(officeData.position.x);
            const officeCenterZ = toRender(officeData.position.z);
            const officeSideX = toRender(officeData.size.depth) / 2;
            const forestPathX = officeCenterX - officeSideX - 10.2;
            const forestPathLength = toRender(officeData.size.width) + 10;
            const forestBeds = box(scene, 19, .09, forestPathLength + 5,
                forestPathX - 1.6, .04, officeCenterZ, M.foliage[1], false);
            forestBeds.name = 'Main Office forest planting';
            const forestPath = box(scene, 4.2, .08, forestPathLength,
                forestPathX, .12, officeCenterZ, M.concreteDark, false);
            forestPath.name = 'Main Office forest path';
            for (const side of [-1, 1]) {
                box(scene, .18, .12, forestPathLength,
                    forestPathX + side * 2.2, .12, officeCenterZ, M.curb, false);
            }
            for (const rowOffset of [-7.1, 7.1]) {
                for (let index = 0; index < 6; index++) {
                    const z = officeCenterZ - forestPathLength * .39 + index * forestPathLength * .156;
                    const forestTree = tree(forestPathX + rowOffset + (rand() - .5) * .8,
                        z + (rand() - .5) * 1.3, 1.25 + rand() * .3);
                    forestTree.name = `Main Office forest tree ${rowOffset < 0 ? 'west' : 'east'} ${index + 1}`;
                    forestTree.userData.info = {
                        title: 'ต้นไม้แนวทางหลังสำนักงาน',
                        description: 'ต้นไม้ในแนวทางเดินร่มรื่นด้านหลัง Main Office'
                    };
                }
            }

            // Agricultural surroundings.
            for (let row = 0; row < 6; row++) {
                for (let col = 0; col < 16; col++) {
                    tree(-145 + col * 17 + (rand() - .5) * 5, -111 - row * 15, 1.1 + rand() * .8);
                }
            }
            for (let i = 0; i < 45; i++) {
                tree(-95 - rand() * 65, -85 + rand() * 150, .85 + rand() * 1.3);
            }

            // Keep the horizon level; rear tree rows provide the distant backdrop.
            for (let x = -135; x <= 135; x += 11) {
                const shrub = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), M.foliage[1]);
                shrub.position.set(x, .85, -124 + (Math.abs(x / 11) % 2) * 3);
                shrub.scale.set(3.2, 1.6, 2.4);
                shrub.castShadow = true;
                shrub.receiveShadow = true;
                scene.add(shrub);
            }

            // Utility poles and lamps.
            for (const z of [16, 43, 68]) {
                cyl(scene, .11, .16, 9.4, 73, 4.7, z, M.base, 8);
                box(scene, 3, .12, .14, 73, 8.7, z, M.dark);
                for (const x of [72, 73, 74]) {
                    cyl(scene, .09, .09, .3, x, 8.95, z, M.frame, 8);
                }
            }
            for (const z of [17, 51]) {
                cyl(scene, .07, .1, 7, -17, 3.5, z, M.frame, 8);
                beam(scene, [-17, 6.8, z], [-15.4, 7, z], .065, M.frame);
                box(scene, .8, .12, .4, -15.35, 7, z, M.white);
            }

            // Inspection layer: coordinates, proportional grid, footprint edges and IDs.
            const debugGroup = new THREE.Group();
            debugGroup.name = 'Debug layout';
            debugGroup.visible = false;
            scene.add(debugGroup);
            const grid = new THREE.GridHelper(170, 34, '#ffb42b', '#5b7687');
            grid.position.y = .24;
            debugGroup.add(grid);
            const axes = new THREE.AxesHelper(25);
            axes.position.set(0, .3, 75);
            debugGroup.add(axes);
            const debugLineMaterial = new THREE.LineBasicMaterial({ color: '#ff9f1c', depthTest: false });
            const confidenceColors = { high: '#164e36', medium: '#765514', low: '#782727' };
            BUILDINGS.forEach(item => {
                const shape = new THREE.BoxGeometry(toRender(item.size.width), .12, toRender(item.size.depth));
                const edge = new THREE.LineSegments(new THREE.EdgesGeometry(shape), debugLineMaterial);
                edge.position.set(toRender(item.position.x), .36, toRender(item.position.z));
                edge.rotation.y = item.rotationY;
                edge.renderOrder = 20;
                debugGroup.add(edge);
                const marker = new THREE.Sprite(new THREE.SpriteMaterial({
                    map: textTexture(`${item.id} · ${item.confidence.toUpperCase()}`, {
                        background: confidenceColors[item.confidence] || '#102439', color: '#ffffff', size: 52
                    }),
                    depthTest: false, depthWrite: false
                }));
                marker.position.set(
                    toRender(item.position.x),
                    toRender(item.size.height + item.roof.rise) + 1.3,
                    toRender(item.position.z)
                );
                marker.scale.set(15, 2.35, 1);
                marker.renderOrder = 21;
                debugGroup.add(marker);
            });

            // ------------------------------------------------------------
            // In-page object editor (move / rotate / add / duplicate / delete)
            // ------------------------------------------------------------
            const viewerOnly = window.TDK_VIEWER_ONLY === true;
            let editorMode = false;
            let selectedEditable = null;
            const selectedEditables = new Set();
            const selectionPivot = new THREE.Group();
            const selectionHighlightGroup = new THREE.Group();
            const editorUndoStack = [];
            const editorRedoStack = [];
            let editorTransformBefore = null;
            let editorSaveTimer = 0;
            let editorTransformPointerActive = false;
            const editorPanel = document.getElementById('editor-panel');
            const editorToggle = document.getElementById('editor-toggle');
            if (viewerOnly) {
                editorToggle.hidden = true;
                editorToggle.disabled = true;
                editorToggle.setAttribute('aria-hidden', 'true');
                document.body.classList.add('viewer-only');
            }
            const editorSelected = document.getElementById('editor-selected');
            const editorStatus = document.getElementById('editor-status');
            const editorX = document.getElementById('editor-x');
            const editorZ = document.getElementById('editor-z');
            const editorY = document.getElementById('editor-y');
            const editorScales = ['x','y','z'].map(axis => document.getElementById(`editor-s${axis}`));
            const editorName = document.getElementById('editor-name');
            const editorAngle = document.getElementById('editor-angle');
            const editorFront = document.getElementById('editor-front');
            const editorBack = document.getElementById('editor-back');
            const editorMarquee = document.createElement('div');
            editorMarquee.className = 'editor-marquee';
            document.body.append(editorMarquee);
            let editorBoxSelection = null;

            const transformControls = new TransformControls(camera, renderer.domElement);
            transformControls.setMode('translate');
            transformControls.setTranslationSnap(.25);
            transformControls.setScaleSnap(.05);
            transformControls.setRotationSnap(THREE.MathUtils.degToRad(5));
            transformControls.showY = false;
            const transformHelper = transformControls.getHelper();
            scene.add(transformHelper);

            function firstObjectInfo(root) {
                let info = null;
                root.traverse(obj => {
                    if (!info && obj.userData?.info) info = obj.userData.info;
                });
                return info;
            }

            function objectIdToken(value) {
                return String(value || 'object')
                    .normalize('NFKD').toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '') || 'object';
            }

            function registerEverySceneObject() {
                // Presentation-only objects must not change the legacy scene index used by
                // saved editor IDs. Keeping this index stable restores user-positioned objects.
                const identityNeutralObjects = new Set([
                    skyFill, moon, moon.target,
                    ...siteNightLights,
                    streetLightGroup,
                    ...movingVehicles.map(actor => actor.mesh),
                    rainField
                ]);
                const runtimeObjects = new Set([
                    labelGroup, debugGroup, player, transformHelper,
                    ...workers.map(actor => actor.mesh),
                    ...movingForklifts.map(actor => actor.mesh),
                    ...identityNeutralObjects
                ]);
                const idCounts = new Map();
                const sceneObjects = [...scene.children];
                const namedSceneObjects = {
                    'Security guard booth': { id: 'security-booth', label: 'ป้อม รปภ.' },
                    'Security card access turnstiles': {
                        id: 'security-card-access', label: 'เครื่องทาบบัตร / ประตูกั้นทางเข้า'
                    }
                };
                let registered = 0;
                let identityNeutralBefore = 0;
                sceneObjects.forEach((original, index) => {
                    let child = original;
                    if (identityNeutralObjects.has(child)) {
                        identityNeutralBefore++;
                        return;
                    }
                    if (child.userData?.editor || runtimeObjects.has(child) || child.isLight || child.isCamera) return;
                    if (!(child.isMesh || child.isGroup || child.isLine || child.isLineSegments || child.isSprite)) return;
                    const bounds = new THREE.Box3().setFromObject(child);
                    if (bounds.isEmpty()) return;
                    const size = bounds.getSize(new THREE.Vector3());
                    const info = firstObjectInfo(child);
                    const stableSceneIndex = index - identityNeutralBefore;
                    const title = info?.title || child.name || `${child.type} ${stableSceneIndex + 1}`;
                    const wallCutInfo = child.userData.wallCutInfo;
                    const wallSide = wallCutInfo?.side === 'left' ? 'ซ้าย' : 'ขวา';
                    const identity = wallCutInfo
                        ? {
                            id: `${wallCutInfo.cutId}-${wallCutInfo.side}`,
                            label: `${wallCutInfo.sourceName} · ช่วง${wallSide}`
                        }
                        : namedSceneObjects[child.name];
                    const cuttable = child.name.startsWith('Perimeter fence ') ||
                        child.name.startsWith('Front concrete wall ') || child.name === 'Main Office side wall';
                    const descriptor = [
                        objectIdToken(title),
                        child.position.x.toFixed(2), child.position.z.toFixed(2),
                        size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2)
                    ].join('-').replace(/\./g, 'p').replace(/-/g, 'm');
                    const count = (idCounts.get(descriptor) || 0) + 1;
                    idCounts.set(descriptor, count);
                    const id = `scene-${descriptor}-${count}`;
                    const semanticGroup = child.isGroup;
                    // Primitive mesh scales encode geometry dimensions. Wrap them so editor scale
                    // starts at 1, like buildings, without clamping a 700-unit ground mesh to 20.
                    if (!child.isGroup) {
                        const root = new THREE.Group();
                        root.position.copy(child.position);
                        root.quaternion.copy(child.quaternion);
                        child.position.set(0, 0, 0);
                        child.quaternion.identity();
                        root.add(child);
                        scene.add(root);
                        child = root;
                    }
                    // Only semantic scene groups become gameplay blockers.  The old
                    // size-only rule turned curbs, lane paint, roof details and
                    // other loose meshes into invisible walls for the player.
                    const collidable = semanticGroup && size.y > 1.2 && bounds.min.y < 2.6 &&
                        size.x * size.z > 1.5 && size.x * size.z < 6500;
                    registerEditable(child, {
                        id: identity?.id || id, type: 'sceneObject',
                        label: identity?.label || title, builtin: true, collidable, cuttable
                    });
                    registered++;
                });
                // Every blocker is now represented by a live object-space bounding box.
                // Clearing the old fixed boxes prevents invisible collisions after a move/delete.
                staticColliders.length = 0;
                if (!viewerOnly) window.TDK_OBJECT_EDITOR = { editableObjects, registered };
            }

            const anchoredBuildingLabels = [];
            // Stable building IDs allow selection and saved clones to survive decorative scene changes.
            for (const item of BUILDINGS) {
                const group = warehouseGroups[item.id] || (item.id === 'main_office' ? office : canteen);
                labelGroup.children.forEach(sprite => {
                    const primary = Math.abs(sprite.position.x - toRender(item.position.x)) < .01 &&
                        Math.abs(sprite.position.z - toRender(item.position.z)) < .01;
                    const secondary = item.id === 'doke2_assy' &&
                        Math.abs(sprite.position.x - toRender(item.position.x + 9)) < .01 &&
                        Math.abs(sprite.position.z - toRender(item.position.z - 10)) < .01;
                    if (primary || secondary) anchoredBuildingLabels.push({ sprite, group, offset: group.worldToLocal(sprite.position.clone()) });
                });
                registerEditable(group, { id: `building-${item.id}`, type: 'sceneObject', label: item.name });
            }
            applyStoredWallCuts();
            registerEverySceneObject();
            registerEditable(createEntranceMonument(), {
                id: 'entrance-tdk-monument-v1',
                type: 'entranceMonument',
                label: 'ป้าย TDK ทางเข้าโรงงาน',
                builtin: false,
                collidable: true
            });
            registerEditable(createEntranceAvenue(), {
                id: 'entrance-landscaped-avenue-v1',
                type: 'entranceAvenue',
                label: 'ภูมิทัศน์ถนนทางเข้าโรงงาน',
                builtin: false,
                collidable: false
            });
            selectionPivot.name = 'Editor multi-selection pivot';
            selectionHighlightGroup.name = 'Editor selection highlights';
            scene.add(selectionPivot, selectionHighlightGroup);

            function externalAssetPlaceholder(point, asset) {
                const group = new THREE.Group();
                group.position.copy(point);
                const placeholder = new THREE.Group();
                placeholder.name = 'External asset loading placeholder';
                const size = Math.min(4, Math.max(1.25, asset.targetSize * .5));
                box(placeholder, size, size, size, 0, size / 2, 0,
                    new THREE.MeshStandardMaterial({
                        color: '#80a9d8', roughness: .72, metalness: .08,
                        transparent: true, opacity: .62, wireframe: true
                    }), false);
                group.add(placeholder);
                group.userData.externalPlaceholder = placeholder;
                scene.add(group);
                return group;
            }

            function clearExternalAssetPlaceholder(group) {
                const placeholder = group.userData.externalPlaceholder;
                if (!placeholder) return;
                unregisterPickMeshes(placeholder);
                placeholder.traverse(object => {
                    object.geometry?.dispose?.();
                    const materials = Array.isArray(object.material) ? object.material : [object.material];
                    materials.filter(Boolean).forEach(material => material.dispose?.());
                });
                placeholder.removeFromParent();
                delete group.userData.externalPlaceholder;
            }

            function registerExternalAssetMeshes(group, asset) {
                group.traverse(object => {
                    if (!(object.isMesh || object.isLine || object.isSprite)) return;
                    object.userData.editRoot = group;
                    object.userData.info ||= {
                        title: asset.name,
                        description: [asset.credit, asset.license].filter(Boolean).join(' · ') ||
                            'วัตถุที่โหลดจาก URL ภายนอก'
                    };
                    if (!meshesToPick.includes(object)) meshesToPick.push(object);
                    if (object.isMesh) {
                        object.castShadow = true;
                        object.receiveShadow = true;
                    }
                });
                if (group.userData.editor?.renderMode === 'front') setEditorRenderMode(group, 'front');
                updateEditableBounds(group);
                updateSelectionHighlights();
                refreshObjectList();
            }

            function showExternalAssetError(group, asset, error) {
                if (editableObjects.get(group.userData.editor?.id) !== group) return;
                const placeholder = group.userData.externalPlaceholder;
                placeholder?.traverse(object => {
                    if (!object.material) return;
                    object.material.color?.set('#c84c4c');
                    object.material.wireframe = true;
                });
                console.error(`External asset failed: ${asset.url}`, error);
                editorStatus.textContent = `โหลด “${asset.name}” ไม่สำเร็จ · ตรวจ URL และ CORS ของเว็บต้นทาง`;
            }

            function hydrateExternalAsset(group, asset) {
                const isCurrent = () => editableObjects.get(group.userData.editor?.id) === group;
                if (asset.kind === 'image') {
                    getExternalTextureLoader().load(asset.url, texture => {
                        if (!isCurrent()) { texture.dispose(); return; }
                        texture.colorSpace = THREE.SRGBColorSpace;
                        const image = texture.image;
                        const aspect = image?.naturalWidth && image?.naturalHeight
                            ? image.naturalWidth / image.naturalHeight
                            : (image?.width && image?.height ? image.width / image.height : 1.5);
                        const width = asset.targetSize;
                        const height = width / Math.max(.1, aspect);
                        const mesh = new THREE.Mesh(
                            new THREE.PlaneGeometry(width, height),
                            new THREE.MeshBasicMaterial({
                                map: texture, transparent: true, side: THREE.DoubleSide, alphaTest: .02
                            })
                        );
                        mesh.position.y = height / 2;
                        clearExternalAssetPlaceholder(group);
                        group.add(mesh);
                        registerExternalAssetMeshes(group, asset);
                        editorStatus.textContent = `โหลดรูปภาพ “${asset.name}” แล้ว`;
                    }, undefined, error => showExternalAssetError(group, asset, error));
                    return;
                }

                getExternalModelLoader().load(asset.url, gltf => {
                    if (!isCurrent()) return;
                    const model = gltf.scene || gltf.scenes?.[0];
                    if (!model) {
                        showExternalAssetError(group, asset, new Error('ไฟล์ไม่มี scene ที่แสดงผลได้'));
                        return;
                    }
                    model.updateWorldMatrix(true, true);
                    const initialBox = new THREE.Box3().setFromObject(model);
                    const initialSize = initialBox.getSize(new THREE.Vector3());
                    const longestSide = Math.max(initialSize.x, initialSize.y, initialSize.z);
                    if (!Number.isFinite(longestSide) || longestSide <= 0) {
                        showExternalAssetError(group, asset, new Error('โมเดลไม่มีขนาดที่ใช้งานได้'));
                        return;
                    }
                    model.scale.multiplyScalar(asset.targetSize / longestSide);
                    model.updateWorldMatrix(true, true);
                    const fittedBox = new THREE.Box3().setFromObject(model);
                    const center = fittedBox.getCenter(new THREE.Vector3());
                    model.position.x -= center.x;
                    model.position.y -= fittedBox.min.y;
                    model.position.z -= center.z;
                    clearExternalAssetPlaceholder(group);
                    group.add(model);
                    registerExternalAssetMeshes(group, asset);
                    editorStatus.textContent = `โหลดโมเดล “${asset.name}” จาก CDN/URL แล้ว`;
                }, undefined, error => showExternalAssetError(group, asset, error));
            }

            function editorLabel(type) {
                return {
                    blueCrate: 'ลังสีน้ำเงิน', blueCabinet: 'ตู้สีน้ำเงิน',
                    snackBooth: 'กล่อง/ร้านขนม', pavilion: 'ศาลาพักผ่อน',
                    waterTank: 'ถังน้ำสีน้ำเงิน', blueContainer: 'ตู้คอนเทนเนอร์สีน้ำเงิน', building: 'อาคารโรงงาน',
                    roadSegment: 'ถนนสำเร็จรูป', roadSign: 'ป้ายจราจร', spiritHouse: 'ศาลพระภูมิ',
                    parkedCar: 'รถยนต์', externalModel: 'โมเดลภายนอก', externalImage: 'รูปภาพภายนอก'
                }[type] || 'วัตถุ';
            }

            function createEditorObject(type, id = '', position = null, builtin = false, sourceId = null, asset = null) {
                const objectId = id || `custom-${type}-${++editorSequence}`;
                const point = position || new THREE.Vector3(controls.target.x + 2, 0, controls.target.z + 2);
                const externalAsset = asset ? normalizeExternalAsset(asset) : null;
                let group;
                if (type === 'sceneObject' && sourceId && builtinTemplates.has(sourceId)) {
                    group = cloneEditorGroup(builtinTemplates.get(sourceId));
                    group.position.copy(point);
                    scene.add(group);
                } else if (type === 'building') {
                    group = warehouse({ id: objectId, name: 'อาคารโรงงาน', labelText: '', x: point.x, z: point.z,
                        w: 18, d: 24, h: 8, rise: 2, vent: false, rotationY: 0, skylightPattern: 'sparse',
                        facade: { type: 'store', loadingDoors: 1 }, evidence: [] });
                } else if (type === 'pavilion') group = woodenPavilion(point.x, point.z, 5.5, 4.5, 3.2);
                else if (type === 'waterTank') group = waterTank(point.x, point.z, .7, 1.8);
                else if (type === 'snackBooth') group = snackBooth(point.x, point.z);
                else if (type === 'blueContainer') group = blueContainerBooth(point.x, point.z);
                else if (type === 'blueCabinet') group = blueCabinet(point.x, point.z);
                else if (type === 'roadSegment') group = roadSegment(point.x, point.z);
                else if (type === 'roadSign') group = roadSign(point.x, point.z);
                else if (type === 'spiritHouse') group = spiritHouse(point.x, point.z);
                else if (type === 'parkedCar') group = car(scene, point.x, point.z, '#1677a8');
                else if (['externalModel', 'externalImage'].includes(type) && externalAsset) {
                    group = externalAssetPlaceholder(point, externalAsset);
                }
                else group = blueCrate(point.x, point.z);
                group.position.y = point.y;
                const registered = registerEditable(group, {
                    id: objectId, type,
                    label: externalAsset?.name || `${editorLabel(type)} ${objectId.split('-').at(-1)}`,
                    builtin, sourceId, asset: externalAsset
                });
                if (externalAsset) hydrateExternalAsset(registered, externalAsset);
                return registered;
            }

            const addedIds = storedEditorLayout.added.map(item => item.id || item);
            editorSequence = Math.max(0, ...addedIds.map(id => Number(String(id).split('-').at(-1)) || 0));
            storedEditorLayout.added.forEach(item => {
                const entry = typeof item === 'string'
                    ? { id: item, type: storedEditorLayout.objects?.[item]?.type || 'blueCrate' }
                    : item;
                if (!entry.id || editableObjects.has(entry.id)) return;
                createEditorObject(entry.type || 'blueCrate', entry.id, new THREE.Vector3(), false, entry.sourceId, entry.asset);
            });
            refreshActivityNavigation();
            updateActivity(0);

            function serializeTransform(group) {
                group.updateWorldMatrix(true, false);
                const worldPosition = new THREE.Vector3();
                const worldQuaternion = new THREE.Quaternion();
                const worldScale = new THREE.Vector3();
                group.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);
                const worldRotation = new THREE.Euler().setFromQuaternion(worldQuaternion, 'XYZ');
                return {
                    type: group.userData.editor.type,
                    label: group.userData.editor.label,
                    position: { x: worldPosition.x, y: worldPosition.y, z: worldPosition.z },
                    rotation: { x: worldRotation.x, y: worldRotation.y, z: worldRotation.z },
                    scale: { x: worldScale.x, y: worldScale.y, z: worldScale.z },
                    renderMode: group.userData.editor.renderMode || 'back'
                };
            }

            function captureEditorLayoutState() {
                const objects = {};
                const added = [];
                editableObjects.forEach((group, id) => {
                    objects[id] = serializeTransform(group);
                    if (!group.userData.editor.builtin) {
                        const entry = { id, type: group.userData.editor.type, sourceId: group.userData.editor.sourceId };
                        if (group.userData.editor.asset) entry.asset = structuredClone(group.userData.editor.asset);
                        added.push(entry);
                    }
                });
                return {
                    revision: EDITOR_LAYOUT_REVISION,
                    canonicalBaseline: window.TDK_CANONICAL_LAYOUT_ID,
                    objects, added,
                    deleted: [...deletedBuiltinObjects], cuts: [...storedEditorLayout.cuts]
                };
            }

            function saveEditorLayout(message = 'บันทึกตำแหน่งแล้ว', strict = false) {
                const state = captureEditorLayoutState();
                try { localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(state)); }
                catch (error) {
                    editorStatus.textContent = 'บันทึกไม่สำเร็จ กรุณาส่งออก JSON เพื่อเก็บงาน';
                    if (strict) throw new Error('บันทึกผังลงเบราว์เซอร์ไม่สำเร็จ จึงยังไม่ส่งออก Three.js', { cause: error });
                    return state;
                }
                storedEditorLayout = state;
                editorStatus.textContent = message;
                refreshObjectList();
                return state;
            }

            function scheduleEditorSave() {
                clearTimeout(editorSaveTimer);
                editorSaveTimer = setTimeout(() => saveEditorLayout('บันทึกอัตโนมัติแล้ว'), 180);
            }

            function editableBaseDimensions(group) {
                group.updateWorldMatrix(true, true);
                const inverseRoot = group.matrixWorld.clone().invert();
                const bounds = new THREE.Box3();
                const relativeMatrix = new THREE.Matrix4();
                group.traverse(object => {
                    if (!object.isMesh || !object.geometry) return;
                    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
                    if (!object.geometry.boundingBox) return;
                    relativeMatrix.multiplyMatrices(inverseRoot, object.matrixWorld);
                    bounds.union(object.geometry.boundingBox.clone().applyMatrix4(relativeMatrix));
                });
                if (bounds.isEmpty()) return new THREE.Vector3(1, 1, 1);
                const size = bounds.getSize(new THREE.Vector3());
                return size.set(Math.max(.001, size.x), Math.max(.001, size.y), Math.max(.001, size.z));
            }

            function updateEditorFields() {
                const count = selectedEditables.size;
                const target = count > 1 ? selectionPivot : selectedEditable;
                [editorX, editorY, editorZ, editorAngle, ...editorScales].forEach(input => {
                    input.disabled = !target;
                    if (!target) input.value = '';
                });
                editorName.disabled = count !== 1;
                editorName.value = count === 1 ? selectedEditable.userData.editor.label : '';
                for (const id of ['duplicate','delete','shrink','grow','focus']) document.getElementById(`editor-${id}`).disabled = !target;
                document.getElementById('editor-view-interior').disabled = count !== 1 ||
                    !selectedEditable.userData.editor.id.startsWith('building-');
                wallCutButton.disabled = count !== 1 || !selectedEditable.userData.editor.cuttable;
                editorFront.disabled = editorBack.disabled = !count;
                editorFront.classList.toggle('active', count > 0 &&
                    [...selectedEditables].every(group => group.userData.editor.renderMode === 'front'));
                editorBack.classList.toggle('active', count > 0 &&
                    [...selectedEditables].every(group => group.userData.editor.renderMode !== 'front'));
                editorFront.setAttribute('aria-pressed', String(editorFront.classList.contains('active')));
                editorBack.setAttribute('aria-pressed', String(editorBack.classList.contains('active')));
                editorSelected.textContent = count > 1 ? `เลือก ${count} วัตถุ · ปรับพร้อมกัน` :
                    target ? target.userData.editor.label : 'เลือกวัตถุในฉากหรือจากรายการ';
                if (target) {
                    editorX.value = target.position.x.toFixed(2);
                    editorY.value = target.position.y.toFixed(2);
                    editorZ.value = target.position.z.toFixed(2);
                    editorAngle.value = THREE.MathUtils.radToDeg(target.rotation.y).toFixed(1);
                    const baseDimensions = editableBaseDimensions(target);
                    editorScales.forEach((input, i) => {
                        const baseDimension = baseDimensions.getComponent(i);
                        input.min = String((baseDimension * .05).toFixed(2));
                        input.max = String((baseDimension * 20).toFixed(2));
                        input.value = (baseDimension * target.scale.getComponent(i)).toFixed(2);
                    });
                }
                document.getElementById('editor-undo').disabled = !editorUndoStack.length;
                document.getElementById('editor-redo').disabled = !editorRedoStack.length;
            }

            function updateSelectionHighlights() {
                selectionHighlightGroup.children.forEach(helper => { helper.geometry.dispose(); helper.material.dispose(); });
                selectionHighlightGroup.clear();
                selectedEditables.forEach(group => {
                    const helper = new THREE.BoxHelper(group, '#1768d4');
                    helper.material.depthTest = false;
                    helper.material.transparent = true;
                    helper.material.opacity = .9;
                    helper.renderOrder = 100;
                    selectionHighlightGroup.add(helper);
                });
            }

            function releaseSelectionPivot() {
                transformControls.detach();
                [...selectionPivot.children].forEach(group => scene.attach(group));
                selectionPivot.position.set(0, 0, 0);
                selectionPivot.rotation.set(0, 0, 0);
                selectionPivot.scale.set(1, 1, 1);
                selectionPivot.updateMatrixWorld(true);
            }

            function rebuildSelectionTransform() {
                releaseSelectionPivot();
                const items = [...selectedEditables].filter(group =>
                    editableObjects.get(group.userData.editor?.id) === group
                );
                selectedEditables.clear();
                items.forEach(group => selectedEditables.add(group));
                selectedEditable = items.at(-1) || null;
                if (items.length === 1) {
                    transformControls.attach(items[0]);
                } else if (items.length > 1) {
                    const center = new THREE.Vector3();
                    items.forEach(group => center.add(group.getWorldPosition(new THREE.Vector3())));
                    center.multiplyScalar(1 / items.length);
                    selectionPivot.position.set(center.x, 0, center.z);
                    selectionPivot.updateMatrixWorld(true);
                    items.forEach(group => selectionPivot.attach(group));
                    transformControls.attach(selectionPivot);
                }
                updateSelectionHighlights();
                updateEditorFields();
                refreshObjectSelection();
            }

            function selectEditable(group, additive = false) {
                releaseSelectionPivot();
                const valid = group && editableObjects.get(group.userData.editor?.id) === group ? group : null;
                if (!additive) selectedEditables.clear();
                if (valid) {
                    if (additive && selectedEditables.has(valid)) selectedEditables.delete(valid);
                    else selectedEditables.add(valid);
                }
                rebuildSelectionTransform();
                editorStatus.textContent = selectedEditables.size > 1
                    ? `เลือกพร้อมกัน ${selectedEditables.size} วัตถุ` : 'พร้อมแก้ไข';
            }

            function selectEditablesInScreenRect(startX, startY, endX, endY, additive = false) {
                releaseSelectionPivot();
                const rect = renderer.domElement.getBoundingClientRect();
                const minX = Math.min(startX, endX), maxX = Math.max(startX, endX);
                const minY = Math.min(startY, endY), maxY = Math.max(startY, endY);
                const center = new THREE.Vector3();
                const matches = [];

                editableObjects.forEach(group => {
                    updateEditableBounds(group);
                    group.userData.editorBounds.getCenter(center);
                    const projected = center.clone().project(camera);
                    if (projected.z < -1 || projected.z > 1) return;
                    const screenX = rect.left + (projected.x + 1) * rect.width / 2;
                    const screenY = rect.top + (1 - projected.y) * rect.height / 2;
                    if (screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY) {
                        matches.push(group);
                    }
                });

                if (!additive) selectedEditables.clear();
                matches.forEach(group => selectedEditables.add(group));
                rebuildSelectionTransform();
                editorStatus.textContent = matches.length
                    ? `เลือกจากกรอบ ${matches.length} วัตถุ · ลากแกนกลางเพื่อย้ายพร้อมกัน`
                    : 'ไม่พบวัตถุในกรอบที่เลือก';
            }

            let wallCutMode = false;
            let wallCutStart = null;
            const wallCutButton = document.getElementById('editor-cut');

            function wallLocalBounds(group) {
                let minX = Infinity, maxX = -Infinity;
                group.children.forEach(child => {
                    if (!child.isMesh || child.geometry !== unitBox || child.rotation.x || child.rotation.y || child.rotation.z) return;
                    const halfWidth = Math.abs(child.scale.x) / 2;
                    minX = Math.min(minX, child.position.x - halfWidth);
                    maxX = Math.max(maxX, child.position.x + halfWidth);
                });
                return Number.isFinite(minX) && Number.isFinite(maxX) ? { minX, maxX } : null;
            }

            function createWallCutParts(source, cut) {
                const bounds = wallLocalBounds(source);
                if (!bounds) throw new Error('กำแพงนี้ไม่มีรูปทรงที่รองรับการตัด');
                const cutStart = THREE.MathUtils.clamp(Math.min(cut.start, cut.end), bounds.minX, bounds.maxX);
                const cutEnd = THREE.MathUtils.clamp(Math.max(cut.start, cut.end), bounds.minX, bounds.maxX);
                if (cutStart - bounds.minX < 1 || bounds.maxX - cutEnd < 1 || cutEnd - cutStart < .35) {
                    throw new Error('จุดตัดต้องอยู่ห่างจากขอบกำแพงอย่างน้อย 1 หน่วย และห่างกันอย่างน้อย 0.35 หน่วย');
                }

                return [
                    { side: 'left', min: bounds.minX, max: cutStart, suffix: 'ซ้าย' },
                    { side: 'right', min: cutEnd, max: bounds.maxX, suffix: 'ขวา' }
                ].map(part => {
                    const centerX = (part.min + part.max) / 2;
                    const segment = new THREE.Group();
                    segment.name = `${source.name} · ${part.suffix}`;
                    segment.position.copy(source.position);
                    segment.position.add(new THREE.Vector3(centerX, 0, 0)
                        .multiply(source.scale).applyQuaternion(source.quaternion));
                    segment.quaternion.copy(source.quaternion);
                    segment.scale.copy(source.scale);
                    segment.userData.wallCutInfo = { sourceName: cut.wallName, cutId: cut.id, side: part.side };

                    source.children.forEach(child => {
                        if (!child.isMesh || child.geometry !== unitBox ||
                            child.rotation.x || child.rotation.y || child.rotation.z) return;
                        const halfWidth = Math.abs(child.scale.x) / 2;
                        const childMin = child.position.x - halfWidth;
                        const childMax = child.position.x + halfWidth;
                        const overlapMin = Math.max(childMin, part.min);
                        const overlapMax = Math.min(childMax, part.max);
                        if (overlapMax - overlapMin < .001) return;
                        const clone = new THREE.Mesh(child.geometry, child.material);
                        clone.position.copy(child.position);
                        clone.quaternion.copy(child.quaternion);
                        clone.scale.copy(child.scale);
                        clone.name = child.name;
                        clone.castShadow = child.castShadow;
                        clone.receiveShadow = child.receiveShadow;
                        clone.renderOrder = child.renderOrder;
                        clone.visible = child.visible;
                        clone.userData = { ...child.userData };
                        delete clone.userData.editRoot;
                        clone.position.x = (overlapMin + overlapMax) / 2 - centerX;
                        clone.scale.x = overlapMax - overlapMin;
                        segment.add(clone);
                    });
                    return segment;
                });
            }

            function applyStoredWallCuts() {
                storedEditorLayout.cuts.forEach(cut => {
                    const source = scene.children.find(child => child.name === cut.wallName);
                    if (!source) return;
                    const parts = createWallCutParts(source, cut);
                    source.removeFromParent();
                    parts.forEach(part => scene.add(part));
                });
            }

            function finishWallCut() {
                wallCutMode = false;
                wallCutStart = null;
                wallCutButton.classList.remove('active');
                renderer.domElement.style.cursor = '';
            }

            function cutSelectedWall(start, end) {
                const source = selectedEditable;
                if (!source?.userData.editor.cuttable) return;
                const wallName = source.name;
                if (storedEditorLayout.cuts.some(cut => cut.wallName === wallName)) {
                    editorStatus.textContent = 'กำแพงนี้ถูกแบ่งแล้ว · เลือกส่วนที่ต้องการย้ายหรือลบได้';
                    finishWallCut();
                    return;
                }
                const cut = {
                    id: `wall-cut-${storedEditorLayout.cuts.length + 1}`,
                    wallName,
                    start: Math.min(start, end),
                    end: Math.max(start, end)
                };
                let parts;
                try {
                    parts = createWallCutParts(source, cut);
                    releaseSelectionPivot();
                    editableObjects.delete(source.userData.editor.id);
                    unregisterPickMeshes(source);
                    source.removeFromParent();
                    storedEditorLayout.cuts.push(cut);
                    const labels = ['ช่วงกำแพงซ้าย', 'ช่วงกำแพงขวา'];
                    parts.forEach((part, index) => {
                        scene.add(part);
                        registerEditable(part, {
                            id: `${cut.id}-${part.userData.wallCutInfo.side}`,
                            type: 'sceneObject',
                            label: `${source.userData.editor.label} · ${labels[index]}`,
                            builtin: true,
                            collidable: source.userData.editor.collidable
                        });
                    });
                    selectedEditables.clear();
                    parts.forEach(part => selectedEditables.add(part));
                    rebuildSelectionTransform();
                    pushEditorUndo('Cut wall section', () => {
                        parts.forEach(part => {
                            editableObjects.delete(part.userData.editor.id);
                            unregisterPickMeshes(part);
                            part.removeFromParent();
                        });
                        storedEditorLayout.cuts = storedEditorLayout.cuts.filter(item => item.id !== cut.id);
                        scene.add(source);
                        source.traverse(object => {
                            if (!(object.isMesh || object.isLine || object.isSprite)) return;
                            object.userData.editRoot = source;
                            if (!meshesToPick.includes(object)) meshesToPick.push(object);
                        });
                        editableObjects.set(source.userData.editor.id, source);
                        updateEditableBounds(source);
                        selectedEditables.clear();
                        selectedEditables.add(source);
                        rebuildSelectionTransform();
                    });
                    saveEditorLayout('ตัดช่วงกำแพงแล้ว · แยกเป็น 2 ชิ้น');
                } catch (error) {
                    editorStatus.textContent = error?.message || String(error);
                }
                finishWallCut();
            }

            // Store world transforms because multiple objects are temporarily
            // parented to selectionPivot while they are moved together.
            function captureEditableTransforms(groups) {
                return [...groups].map(group => {
                    group.updateWorldMatrix(true, false);
                    const position = new THREE.Vector3();
                    const quaternion = new THREE.Quaternion();
                    const scale = new THREE.Vector3();
                    group.matrixWorld.decompose(position, quaternion, scale);
                    return { group, position, quaternion, scale };
                });
            }

            function sameTransformSnapshots(before, after) {
                if (before.length !== after.length) return false;
                return before.every((item, index) =>
                    item.group === after[index].group &&
                    item.position.distanceToSquared(after[index].position) < 1e-8 &&
                    1 - Math.abs(item.quaternion.dot(after[index].quaternion)) < 1e-8 &&
                    item.scale.distanceToSquared(after[index].scale) < 1e-8
                );
            }

            function restoreEditableTransforms(snapshot) {
                releaseSelectionPivot();
                const restored = [];
                snapshot.forEach(({ group, position, quaternion, scale }) => {
                    if (editableObjects.get(group.userData.editor?.id) !== group) return;
                    scene.attach(group);
                    group.position.copy(position);
                    group.quaternion.copy(quaternion);
                    group.scale.copy(scale);
                    group.updateMatrixWorld(true);
                    updateEditableBounds(group);
                    restored.push(group);
                });
                selectedEditables.clear();
                restored.forEach(group => selectedEditables.add(group));
                rebuildSelectionTransform();
            }

            function pushEditorUndo(label, undo) {
                editorUndoStack.push({ label, undo });
                editorRedoStack.length = 0;
                if (editorUndoStack.length > 100) editorUndoStack.shift();
                updateEditorFields();
            }

            function captureEditorState() {
                return { entries: [...editableObjects.values()].map(group => ({ group,
                    transform: captureEditableTransforms([group])[0], label: group.userData.editor.label,
                    renderMode: group.userData.editor.renderMode || 'back' })),
                    selected: [...selectedEditables], deleted: [...deletedBuiltinObjects],
                    cuts: [...storedEditorLayout.cuts] };
            }

            function restoreEditorState(state) {
                releaseSelectionPivot();
                [...editableObjects.values()].forEach(removeEditable);
                deletedBuiltinObjects.clear();
                state.deleted.forEach(id => deletedBuiltinObjects.add(id));
                storedEditorLayout.cuts = [...state.cuts];
                restoreRemovedEditables(state.entries.map(({group}) => ({group, parent: scene})));
                state.entries.forEach(({group, label, renderMode}) => {
                    group.userData.editor.label = group.name = label;
                    setEditorRenderMode(group, renderMode);
                });
                restoreEditableTransforms(state.entries.map(entry => entry.transform));
                selectedEditables.clear();
                state.selected.forEach(group => selectedEditables.add(group));
                rebuildSelectionTransform();
            }

            function undoEditorChange() {
                const entry = editorUndoStack.pop();
                if (!entry) return;
                const current = captureEditorState();
                clearTimeout(editorSaveTimer);
                entry.undo();
                editorRedoStack.push({ label: entry.label, undo: () => restoreEditorState(current) });
                saveEditorLayout(`ย้อนกลับ: ${entry.label}`);
                updateEditorFields();
            }

            function redoEditorChange() {
                const entry = editorRedoStack.pop();
                if (!entry) return;
                const current = captureEditorState();
                clearTimeout(editorSaveTimer);
                entry.undo();
                editorUndoStack.push({ label: entry.label, undo: () => restoreEditorState(current) });
                saveEditorLayout(`ทำซ้ำ: ${entry.label}`);
                updateEditorFields();
            }

            function restoreRemovedEditables(entries) {
                entries.forEach(({ group, parent }) => {
                    const data = group.userData.editor;
                    if (!data) return;
                    if (data.builtin) deletedBuiltinObjects.delete(data.id);
                    (parent?.isObject3D ? parent : scene).add(group);
                    group.traverse(obj => {
                        if (!(obj.isMesh || obj.isLine || obj.isSprite)) return;
                        obj.userData.editRoot = group;
                        if (!meshesToPick.includes(obj)) meshesToPick.push(obj);
                    });
                    editableObjects.set(data.id, group);
                    updateEditableBounds(group);
                });
            }

            function removeEditable(group) {
                const data = group.userData.editor;
                if (!data) return null;
                const parent = group.parent;
                if (data.builtin) deletedBuiltinObjects.add(data.id);
                editableObjects.delete(data.id);
                activityObstacleRevision++;
                unregisterPickMeshes(group);
                group.removeFromParent();
                return { group, parent };
            }

            function setEditorTransformMode(mode) {
                transformControls.setMode(mode);
                transformControls.setSpace(mode === 'scale' ? 'local' : 'world');
                transformControls.showX = mode !== 'rotate';
                transformControls.showY = true;
                transformControls.showZ = mode !== 'rotate';
                document.getElementById('editor-move').classList.toggle('active', mode === 'translate');
                document.getElementById('editor-rotate').classList.toggle('active', mode === 'rotate');
                document.getElementById('editor-scale').classList.toggle('active', mode === 'scale');
            }

            function setEditorMode(enabled) {
                if (viewerOnly) return false;
                if (enabled) closeInterior();
                if (enabled && gameMode) setGameMode(false);
                editorMode = enabled;
                document.body.classList.toggle('editing', enabled);
                document.body.classList.remove('panels-collapsed');
                document.getElementById('editor-panels').textContent = 'ซ่อนแผง';
                document.getElementById('editor-panels').setAttribute('aria-pressed', 'false');
                editorPanel.hidden = !enabled;
                for (const id of ['editor-topbar', 'editor-objects', 'editor-footer']) document.getElementById(id).hidden = !enabled;
                document.getElementById('editor-reference').hidden = true;
                editorToggle.classList.toggle('active', enabled);
                controls.autoRotate = false;
                document.getElementById('rotate').checked = false;
                if (!enabled) { finishWallCut(); saveEditorLayout(); selectEditable(null); }
                else { refreshObjectList(); updateEditorFields(); setEditorTransformMode(transformControls.mode); }
                editorStatus.textContent = enabled ? 'เลือกวัตถุเพื่อเริ่มแก้ไข · บันทึกอัตโนมัติ' : 'บันทึกและปิดโหมดแก้ไขแล้ว';
                return true;
            }

            function deleteSelectedEditable() {
                if (!selectedEditables.size) return;
                const targets = [...selectedEditables];
                releaseSelectionPivot();
                const removed = targets.map(removeEditable).filter(Boolean);
                selectedEditables.clear();
                rebuildSelectionTransform();
                pushEditorUndo(`Delete ${targets.length} object(s)`, () => {
                    restoreRemovedEditables(removed);
                    selectedEditables.clear();
                    removed.forEach(({ group }) => selectedEditables.add(group));
                    rebuildSelectionTransform();
                });
                saveEditorLayout(`ลบ ${targets.length} วัตถุแล้ว`);
            }

            function duplicateSelectedEditable() {
                if (!selectedEditables.size) return;
                const targets = [...selectedEditables];
                releaseSelectionPivot();
                selectedEditables.clear();
                const copies = [];
                targets.forEach(source => {
                    const type = source.userData.editor.type;
                    const sourceId = source.userData.editor.sourceId || (source.userData.editor.builtin ? source.userData.editor.id : null);
                    const asset = source.userData.editor.asset || null;
                    const renderMode = source.userData.editor.renderMode || 'back';
                    const copy = createEditorObject(type, '', source.position.clone().add(new THREE.Vector3(2, 0, 2)), false, sourceId, asset);
                    copy.userData.editor.label = `${source.userData.editor.label} (สำเนา)`;
                    copy.rotation.copy(source.rotation);
                    copy.scale.copy(source.scale);
                    setEditorRenderMode(copy, renderMode);
                    updateEditableBounds(copy);
                    selectedEditables.add(copy);
                    copies.push(copy);
                });
                rebuildSelectionTransform();
                pushEditorUndo(`Duplicate ${copies.length} object(s)`, () => {
                    releaseSelectionPivot();
                    copies.forEach(removeEditable);
                    selectedEditables.clear();
                    rebuildSelectionTransform();
                });
                saveEditorLayout(`ทำสำเนา ${targets.length} วัตถุแล้ว`);
            }

            transformControls.addEventListener('dragging-changed', event => {
                controls.enabled = !event.value && !gameMode && !overlayEnabled;
                if (event.value) editorTransformPointerActive = true;
                else setTimeout(() => { editorTransformPointerActive = false; }, 0);
            });
            transformControls.addEventListener('mouseDown', () => {
                editorTransformBefore = selectedEditables.size
                    ? captureEditableTransforms(selectedEditables) : null;
            });
            transformControls.addEventListener('mouseUp', () => {
                if (!editorTransformBefore) return;
                const before = editorTransformBefore;
                editorTransformBefore = null;
                const after = captureEditableTransforms(selectedEditables);
                if (!sameTransformSnapshots(before, after)) {
                    pushEditorUndo('Move / rotate object', () => restoreEditableTransforms(before));
                }
            });
            transformControls.addEventListener('objectChange', () => {
                if (!selectedEditables.size) return;
                const target = selectedEditables.size > 1 ? selectionPivot : selectedEditable;
                target.scale.clampScalar(.05, 20);
                selectedEditables.forEach(updateEditableBounds);
                updateSelectionHighlights();
                updateEditorFields();
                scheduleEditorSave();
            });

            editorToggle.addEventListener('click', () => setEditorMode(!editorMode));
            document.getElementById('editor-move').addEventListener('click', () => setEditorTransformMode('translate'));
            document.getElementById('editor-rotate').addEventListener('click', () => setEditorTransformMode('rotate'));
            const externalAssetPresetSelect = document.getElementById('editor-asset-preset');
            EXTERNAL_ASSET_PRESETS.forEach(asset => {
                const option = document.createElement('option');
                option.value = asset.id;
                option.textContent = `${asset.name} · ${asset.license}`;
                externalAssetPresetSelect.append(option);
            });

            function addExternalEditorAsset(assetInput) {
                try {
                    const asset = normalizeExternalAsset(assetInput);
                    const type = asset.kind === 'image' ? 'externalImage' : 'externalModel';
                    const group = createEditorObject(type, '', null, false, null, asset);
                    selectEditable(group);
                    pushEditorUndo('Add external asset', () => {
                        releaseSelectionPivot();
                        removeEditable(group);
                        selectedEditables.clear();
                        rebuildSelectionTransform();
                    });
                    saveEditorLayout(`เพิ่ม “${asset.name}” แล้ว · กำลังโหลดจากเว็บต้นทาง`);
                } catch (error) {
                    editorStatus.textContent = error.message || 'เพิ่ม URL ภายนอกไม่สำเร็จ';
                }
            }

            document.getElementById('editor-add-preset').addEventListener('click', () => {
                const preset = externalAssetPreset(externalAssetPresetSelect.value);
                if (!preset) return;
                addExternalEditorAsset({ ...preset, presetId: preset.id });
            });
            document.getElementById('editor-add-url').addEventListener('click', () => {
                addExternalEditorAsset({
                    kind: document.getElementById('editor-asset-kind').value,
                    url: document.getElementById('editor-asset-url').value,
                    name: document.getElementById('editor-asset-name').value || undefined,
                    targetSize: document.getElementById('editor-asset-size').value
                });
            });
            document.getElementById('editor-add').addEventListener('click', () => {
                const type = document.getElementById('editor-add-type').value;
                const group = createEditorObject(type);
                selectEditable(group);
                pushEditorUndo('Add object', () => {
                    releaseSelectionPivot();
                    removeEditable(group);
                    selectedEditables.clear();
                    rebuildSelectionTransform();
                });
                saveEditorLayout('เพิ่มวัตถุแล้ว');
            });
            document.getElementById('editor-duplicate').addEventListener('click', duplicateSelectedEditable);
            document.getElementById('editor-delete').addEventListener('click', deleteSelectedEditable);
            wallCutButton.addEventListener('click', () => {
                if (!selectedEditable?.userData.editor.cuttable || selectedEditables.size !== 1) return;
                wallCutMode = !wallCutMode;
                wallCutStart = null;
                wallCutButton.classList.toggle('active', wallCutMode);
                renderer.domElement.style.cursor = wallCutMode ? 'crosshair' : '';
                editorStatus.textContent = wallCutMode
                    ? 'คลิกจุดเริ่มและจุดสิ้นสุดบนกำแพง เพื่อเอาช่วงระหว่างจุดออก'
                    : 'ยกเลิกเครื่องมือตัดบางส่วนแล้ว';
            });
            document.getElementById('editor-save').addEventListener('click', () => saveEditorLayout());
            function changeSelectedRenderMode(mode) {
                if (!selectedEditables.size) return;
                const targets = [...selectedEditables];
                const previousModes = targets.map(group => [group, group.userData.editor.renderMode || 'back']);
                targets.forEach(group => setEditorRenderMode(group, mode));
                pushEditorUndo('Change object draw order', () =>
                    previousModes.forEach(([group, previousMode]) => setEditorRenderMode(group, previousMode))
                );
                saveEditorLayout(mode === 'front' ? 'แสดงวัตถุทับฉากแล้ว' : 'แสดงวัตถุตามระยะฉากแล้ว');
            }
            editorFront.addEventListener('click', () => changeSelectedRenderMode('front'));
            editorBack.addEventListener('click', () => changeSelectedRenderMode('back'));
            document.getElementById('editor-reset').addEventListener('click', () => {
                if (!confirm('คืนตำแหน่งและวัตถุทั้งหมดเป็นค่าเริ่มต้นหรือไม่?')) return;
                clearTimeout(editorSaveTimer);
                localStorage.removeItem(EDITOR_STORAGE_KEY);
                location.reload();
            });
            [editorX, editorY, editorZ, editorAngle, ...editorScales].forEach(input => {
                input.addEventListener('change', () => {
                    if (!selectedEditables.size) return;
                    const before = captureEditableTransforms(selectedEditables);
                    const transformTarget = selectedEditables.size > 1 ? selectionPivot : selectedEditable;
                    if (!transformTarget) return;
                    if (!input.value.trim() || !Number.isFinite(Number(input.value))) { updateEditorFields(); return; }
                    const value = Number(input.value);
                    const scaleIndex = editorScales.indexOf(input);
                    if (scaleIndex >= 0) {
                        const baseDimension = editableBaseDimensions(transformTarget).getComponent(scaleIndex);
                        const next = clamp(value / baseDimension, .05, 20);
                        if (document.getElementById('editor-uniform').checked) {
                            const ratio = next / transformTarget.scale.getComponent(scaleIndex);
                            transformTarget.scale.multiplyScalar(ratio).clampScalar(.05, 20);
                        } else transformTarget.scale.setComponent(scaleIndex, next);
                    } else if (input === editorAngle) transformTarget.rotation.y = THREE.MathUtils.degToRad(value);
                    else transformTarget.position[input === editorX ? 'x' : input === editorY ? 'y' : 'z'] = value;
                    transformTarget.updateMatrixWorld(true);
                    selectedEditables.forEach(updateEditableBounds);
                    updateSelectionHighlights();
                    updateEditorFields();
                    const after = captureEditableTransforms(selectedEditables);
                    if (!sameTransformSnapshots(before, after)) {
                        pushEditorUndo('Edit coordinates', () => restoreEditableTransforms(before));
                    }
                    saveEditorLayout('ใช้ค่าพิกัดแล้ว');
                });
            });

            // Workspace extension
            function cloneEditorGroup(source) {
                // Three's clone serializes userData. editRoot is intentionally a cyclic runtime reference.
                const metadata = [];
                const sourceWasFront = source.userData.editor?.renderMode === 'front';
                source.traverse(object => {
                    metadata.push([object, object.userData]);
                    object.userData = object.userData.info ? { info: { ...object.userData.info } } : {};
                });
                if (sourceWasFront) setEditorRenderMode(source, 'back');
                try { return source.clone(true); }
                finally {
                    metadata.forEach(([object, data]) => object.userData = data);
                    if (sourceWasFront) setEditorRenderMode(source, 'front');
                }
            }

            function refreshObjectSelection() {
                document.querySelectorAll('#object-list button').forEach(button => {
                    const selected = selectedEditables.has(editableObjects.get(button.dataset.objectId));
                    button.classList.toggle('active', selected);
                    button.setAttribute('aria-pressed', String(selected));
                });
            }

            function refreshObjectList() {
                const list = document.getElementById('object-list');
                const query = document.getElementById('object-search').value.trim().toLowerCase();
                const items = [...editableObjects.values()].filter(group =>
                    `${group.userData.editor.label} ${group.userData.editor.id}`.toLowerCase().includes(query));
                items.sort((a, b) => Number(b.userData.editor.id.startsWith('building-')) - Number(a.userData.editor.id.startsWith('building-')) ||
                    Number(a.userData.editor.builtin) - Number(b.userData.editor.builtin) ||
                    a.userData.editor.label.localeCompare(b.userData.editor.label, 'th'));
                document.getElementById('object-count').textContent = `${items.length}`;
                list.replaceChildren();
                const fragment = document.createDocumentFragment();
                // Large scenes contain thousands of decorative meshes: search narrows the full set.
                items.slice(0, 150).forEach(group => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.dataset.objectId = group.userData.editor.id;
                    button.textContent = group.userData.editor.label;
                    button.title = group.userData.editor.label;
                    const detail = document.createElement('small');
                    detail.textContent = group.userData.editor.id.startsWith('building-') ? 'อาคารหลัก' : group.userData.editor.builtin ? 'วัตถุในฉาก' : 'วัตถุที่เพิ่ม';
                    button.append(detail);
                    button.addEventListener('click', event => selectEditable(group, event.shiftKey));
                    button.addEventListener('dblclick', focusEditorSelection);
                    fragment.append(button);
                });
                if (!items.length || items.length > 150) {
                    const hint = document.createElement('p');
                    hint.className = 'editor-help';
                    hint.textContent = items.length ? 'แสดง 150 รายการแรก · พิมพ์ค้นหาเพื่อดูรายการอื่น' : 'ไม่พบวัตถุที่ค้นหา';
                    fragment.append(hint);
                }
                list.append(fragment);
                refreshObjectSelection();
            }

            function focusEditorSelection() {
                if (!selectedEditables.size) return;
                const bounds = new THREE.Box3();
                selectedEditables.forEach(group => bounds.expandByObject(group));
                const center = bounds.getCenter(new THREE.Vector3());
                const size = bounds.getSize(new THREE.Vector3());
                transition = null;
                const direction = camera.position.clone().sub(controls.target).normalize();
                controls.target.copy(center);
                if (camera.isOrthographicCamera) {
                    camera.position.set(center.x, center.y + 245, center.z);
                    camera.zoom = clamp(Math.min((camera.right - camera.left) / Math.max(size.x * 2, 12),
                        (camera.top - camera.bottom) / Math.max(size.z * 1.8, 12)), .65, 4);
                } else {
                    const distance = Math.max(15, size.length() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.5);
                    camera.position.copy(center).addScaledVector(direction, distance);
                }
                camera.updateProjectionMatrix();
                controls.update();
            }

            function scaleEditorSelection(factor) {
                if (!selectedEditables.size) return;
                const before = captureEditableTransforms(selectedEditables);
                const target = selectedEditables.size > 1 ? selectionPivot : selectedEditable;
                target.scale.multiplyScalar(factor).clampScalar(.05, 20);
                target.updateMatrixWorld(true);
                selectedEditables.forEach(updateEditableBounds);
                updateSelectionHighlights();
                pushEditorUndo('ปรับขนาด', () => restoreEditableTransforms(before));
                saveEditorLayout('ปรับขนาดและบันทึกแล้ว');
                updateEditorFields();
            }

            async function toggleFullscreen() {
                try {
                    if (document.fullscreenElement) await document.exitFullscreen();
                    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
                    else throw new Error('Fullscreen unavailable');
                } catch (error) {
                    editorStatus.textContent = 'เบราว์เซอร์ไม่อนุญาตเต็มหน้าจอ · ใช้ F11 ได้';
                    if (!editorMode) document.getElementById('viewer-fullscreen').textContent = 'ใช้ F11 เพื่อเต็มหน้าจอ';
                }
            }

            document.getElementById('object-search').addEventListener('input', refreshObjectList);
            document.getElementById('editor-focus').addEventListener('click', focusEditorSelection);
            document.getElementById('editor-view-interior').addEventListener('click', () => {
                const id = selectedEditable?.userData.editor.id;
                if (!id?.startsWith('building-')) return;
                setEditorMode(false);
                openInterior(id.slice('building-'.length), { returnToEditor: true });
            });
            document.getElementById('editor-scale').addEventListener('click', () => setEditorTransformMode('scale'));
            document.getElementById('editor-shrink').addEventListener('click', () => scaleEditorSelection(.9));
            document.getElementById('editor-grow').addEventListener('click', () => scaleEditorSelection(1.1));
            document.getElementById('editor-undo').addEventListener('click', undoEditorChange);
            document.getElementById('editor-redo').addEventListener('click', redoEditorChange);
            document.getElementById('editor-done').addEventListener('click', () => setEditorMode(false));
            if (!viewerOnly && startupParams.get('editor') === '1') setEditorMode(true);
            document.getElementById('editor-panels').addEventListener('click', event => {
                const collapsed = document.body.classList.toggle('panels-collapsed');
                event.currentTarget.textContent = collapsed ? 'แสดงแผง' : 'ซ่อนแผง';
                event.currentTarget.setAttribute('aria-pressed', String(collapsed));
            });

            function initCollapsiblePanel(panelId, toggleId, mobileCollapsed = false) {
                const panel = document.getElementById(panelId);
                const toggle = document.getElementById(toggleId);
                const content = panel.querySelector('.panel-content');
                const storageKey = `tdk-v7-${panelId}-collapsed`;
                let savedState = null;
                try { savedState = localStorage.getItem(storageKey); } catch (_) { /* Storage may be disabled. */ }

                const setCollapsed = collapsed => {
                    panel.classList.toggle('is-collapsed', collapsed);
                    toggle.setAttribute('aria-expanded', String(!collapsed));
                    toggle.setAttribute('aria-label', `${collapsed ? 'ขยาย' : 'ยุบ'}แผง${panelId === 'viewer-nav' ? 'มุมมองโรงงาน' : 'ภาพอ้างอิง'}`);
                    content.toggleAttribute('inert', collapsed);
                };

                const startsCollapsed = savedState === null
                    ? panel.classList.contains('is-collapsed') || (mobileCollapsed && typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches)
                    : savedState === 'true';
                setCollapsed(startsCollapsed);
                toggle.addEventListener('click', () => {
                    const collapsed = !panel.classList.contains('is-collapsed');
                    setCollapsed(collapsed);
                    try { localStorage.setItem(storageKey, String(collapsed)); } catch (_) { /* Keep UI functional without storage. */ }
                });
            }

            initCollapsiblePanel('viewer-nav', 'viewer-nav-toggle', true);
            initCollapsiblePanel('reference-tools', 'reference-tools-toggle');
            ['viewer-fullscreen', 'editor-fullscreen'].forEach(id => document.getElementById(id).addEventListener('click', toggleFullscreen));
            document.addEventListener('fullscreenchange', () => {
                const fullscreenActive = !!document.fullscreenElement;
                if (!fullscreenActive && presentationShowState.active) {
                    stopPresentationShow({ exitFullscreen: false });
                }
                const presentationMode = fullscreenActive || presentationShowState.active;
                document.body.classList.toggle('presentation-mode', presentationMode);
                transformControls.visible = !presentationMode;
                selectionHighlightGroup.visible = !presentationMode;
                ['viewer-fullscreen', 'editor-fullscreen'].forEach(id => {
                    document.getElementById(id).textContent = fullscreenActive ? '⛶ ออกจากเต็มจอ' : '⛶ เต็มหน้าจอ';
                    document.getElementById(id).setAttribute('aria-pressed', String(fullscreenActive));
                });
                window.dispatchEvent(new Event('resize'));
            });
            document.getElementById('editor-snap').addEventListener('change', event => {
                transformControls.setTranslationSnap(event.target.checked ? .25 : null);
                transformControls.setRotationSnap(event.target.checked ? THREE.MathUtils.degToRad(5) : null);
                transformControls.setScaleSnap(event.target.checked ? .05 : null);
            });
            editorName.addEventListener('change', () => {
                if (selectedEditables.size !== 1) return;
                const group = selectedEditable;
                const before = group.userData.editor.label;
                const name = editorName.value.trim();
                if (!name || name === before) { updateEditorFields(); return; }
                group.userData.editor.label = group.name = name;
                pushEditorUndo('เปลี่ยนชื่อ', () => { group.userData.editor.label = group.name = before; updateEditorFields(); });
                updateEditorFields();
                saveEditorLayout('บันทึกชื่อวัตถุแล้ว');
            });
            document.getElementById('editor-export').addEventListener('click', () => {
                const state = saveEditorLayout('ส่งออกผังเป็น JSON แล้ว');
                const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
                const link = document.createElement('a');
                link.href = url;
                link.download = 'tdk-factory-layout.json';
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            });
            const repairBaselineButton = document.getElementById('editor-repair-baseline');
            function showBaselineRepair(show) {
                if (!repairBaselineButton) return;
                repairBaselineButton.hidden = !show;
                repairBaselineButton.style.display = show ? '' : 'none';
            }
            repairBaselineButton?.addEventListener('click', async () => {
                repairBaselineButton.disabled = true;
                try {
                    const response = await fetch('./snapshots/baseline-2026-11-05/layout.json', { cache: 'no-store' });
                    if (!response.ok) throw new Error(`โหลด baseline ไม่สำเร็จ (${response.status})`);
                    const baseline = await response.json();
                    const current = captureEditorLayoutState();
                    const repair = prepareBaselineRepair(current, baseline, window.TDK_CANONICAL_LAYOUT_ID);
                    const audit = auditLayoutAgainstBaseline(current, baseline);
                    const dropped = repair.droppedIds.length;
                    const message = `พบข้อมูลเดิมต่างจาก baseline ${audit.differences.length} จุด\n` +
                        `จะสำรองผังปัจจุบัน แล้วคืนข้อมูลเดิมตาม baseline โดยเก็บวัตถุใหม่ ${repair.keptCount} ชิ้น` +
                        (dropped ? `\nมี ID ที่ไม่ได้ลงทะเบียนเป็นวัตถุใหม่ ${dropped} ชิ้น; ข้อมูลเหล่านี้อยู่ในสำรอง` : '') +
                        '\nหลังโหลดหน้าใหม่ ให้กด Export Map อีกครั้ง ตกลงหรือไม่?';
                    if (!confirm(message)) return;
                    const backupKey = `${EDITOR_STORAGE_KEY}-backup-before-repair-${Date.now()}`;
                    localStorage.setItem(backupKey, JSON.stringify(current));
                    localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(repair.layout));
                    clearTimeout(editorSaveTimer);
                    location.reload();
                } catch (error) {
                    console.error('Baseline repair failed', error);
                    editorStatus.textContent = error.message || 'คืนข้อมูล baseline ไม่สำเร็จ';
                } finally {
                    repairBaselineButton.disabled = false;
                }
            });
            document.getElementById('editor-export-threejs').addEventListener('click', async event => {
                const button = event.currentTarget;
                const originalLabel = button.textContent;
                button.disabled = true;
                button.textContent = 'กำลังตรวจและสร้างไฟล์…';
                editorStatus.textContent = 'กำลังเทียบวัตถุเดิมกับ baseline ที่ล็อกไว้';
                try {
                    const state = captureEditorLayoutState();
                    const [baselineResponse, templateResponse] = await Promise.all([
                        fetch('./snapshots/baseline-2026-11-05/layout.json', { cache: 'no-store' }),
                        fetch('./tdk-factory-map.js', { cache: 'no-store' })
                    ]);
                    if (!baselineResponse.ok) throw new Error(`โหลด baseline ไม่สำเร็จ (${baselineResponse.status})`);
                    if (!templateResponse.ok) throw new Error(`โหลด Three.js template ไม่สำเร็จ (${templateResponse.status})`);
                    const [baseline, template] = await Promise.all([baselineResponse.json(), templateResponse.text()]);
                    const audit = auditLayoutAgainstBaseline(state, baseline);
                    if (!audit.ok) {
                        showBaselineRepair(true);
                        const sample = audit.differences.slice(0, 3).join(', ');
                        throw new Error(`ยกเลิก export: พบข้อมูลเดิมต่างจาก baseline ${audit.differences.length} จุด — ${sample} · ใช้ปุ่มสำรองข้อมูลและคืนวัตถุเดิมตาม baseline`);
                    }
                    showBaselineRepair(false);
                    saveEditorLayout('ตรวจ baseline ผ่านแล้ว กำลังสร้าง Three.js export', true);
                    const bundle = embedLayoutInStandalone(template, state, currentCameraJSON());
                    const url = URL.createObjectURL(new Blob([bundle], { type: 'text/javascript;charset=utf-8' }));
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'tdk-factory-map-export.js';
                    link.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                    editorStatus.textContent = `ส่งออก Three.js แล้ว · วัตถุใหม่ ${audit.addedCount} ชิ้น · วัตถุเดิมต่าง 0 จุด`;
                } catch (error) {
                    console.error('Three.js export failed', error);
                    editorStatus.textContent = error.message || 'ส่งออก Three.js ไม่สำเร็จ';
                } finally {
                    button.disabled = false;
                    button.textContent = originalLabel;
                }
            });
            document.getElementById('editor-reference-toggle').addEventListener('click', () => {
                const panel = document.getElementById('editor-reference');
                panel.hidden = !panel.hidden;
            });
            for (const type of ['aerial', 'satellite']) {
                document.getElementById(`reference-${type}`).addEventListener('click', () => {
                    const url = `./references/factory-${type}.png`;
                    document.getElementById('editor-reference-image').src = url;
                    document.getElementById('reference-link').href = url;
                    for (const key of ['aerial','satellite']) document.getElementById(`reference-${key}`).classList.toggle('active', key === type);
                });
            }

            // ------------------------------------------------------------
            // Interaction
            // ------------------------------------------------------------
            const views = {
                photo: { position: new THREE.Vector3(...CAMERA_PRESETS.reference.position), target: new THREE.Vector3(...CAMERA_PRESETS.reference.target), fov: CAMERA_PRESETS.reference.fov, locked: true },
                aerial: { position: new THREE.Vector3(...CAMERA_PRESETS.aerial.position), target: new THREE.Vector3(...CAMERA_PRESETS.aerial.target), fov: CAMERA_PRESETS.aerial.fov },
                gate: { position: new THREE.Vector3(...CAMERA_PRESETS.gate.position), target: new THREE.Vector3(...CAMERA_PRESETS.gate.target), fov: CAMERA_PRESETS.gate.fov },
                office: { position: new THREE.Vector3(...CAMERA_PRESETS.office.position), target: new THREE.Vector3(...CAMERA_PRESETS.office.target), fov: CAMERA_PRESETS.office.fov },
                factory: { position: new THREE.Vector3(...CAMERA_PRESETS.factory.position), target: new THREE.Vector3(...CAMERA_PRESETS.factory.target), fov: CAMERA_PRESETS.factory.fov },
                top: { position: new THREE.Vector3(...CAMERA_PRESETS.top.position), target: new THREE.Vector3(...CAMERA_PRESETS.top.target), orthographic: true }
            };

            let transition = null;
            let activeViewKey = Object.hasOwn(views, startupViewKey) ? startupViewKey : 'aerial';
            const presentationShow = document.getElementById('presentation-show');
            const presentationWelcome = document.getElementById('presentation-welcome');
            const presentationGreeting = document.getElementById('presentation-greeting');
            const presentationSubtitle = document.getElementById('presentation-subtitle');
            const presentationTime = document.getElementById('presentation-time');
            const presentationDate = document.getElementById('presentation-date');
            const presentationTimezone = document.getElementById('presentation-timezone');
            const presentationProgressBar = document.getElementById('presentation-progress-bar');
            const presentationWeather = document.getElementById('presentation-weather');
            const presentationLayout = document.getElementById('presentation-layout');
            const presentationFocusCard = document.getElementById('presentation-focus-card');
            const presentationFocusCount = document.getElementById('presentation-focus-count');
            const presentationFocusCategory = document.getElementById('presentation-focus-category');
            const presentationFocusTitle = document.getElementById('presentation-focus-title');
            const presentationFocusDescription = document.getElementById('presentation-focus-description');
            const presentationFocusValue = document.getElementById('presentation-focus-value');
            const presentationFocusZones = document.getElementById('presentation-focus-zones');
            const presentationPrevious = document.getElementById('presentation-previous');
            const presentationPause = document.getElementById('presentation-pause');
            const presentationNext = document.getElementById('presentation-next');
            const presentationLocale = 'th-TH';
            const presentationBuildingGroups = new Map(BUILDINGS.map(item => [item.id,
                warehouseGroups[item.id] || (item.id === 'main_office' ? office : canteen)]));
            const PRESENTATION_TOUR_DURATION = presentationTourDuration(EXECUTIVE_TOUR_STOPS.length);
            const presentationOpeningStart = {
                position: new THREE.Vector3(-142, 150, 158), target: new THREE.Vector3(2, 6, 0), fov: 44
            };
            const presentationOverviewPositions = presentationOverviewPositionPoints
                .map(point => new THREE.Vector3(...point));
            const presentationOverviewTargets = presentationOverviewTargetPoints
                .map(point => new THREE.Vector3(...point));
            const presentationOverviewPositionCurve = new THREE.CatmullRomCurve3(
                presentationOverviewPositions, true, 'catmullrom', .42
            );
            const presentationOverviewTargetCurve = new THREE.CatmullRomCurve3(
                presentationOverviewTargets, true, 'catmullrom', .35
            );
            const presentationClosing = {
                position: new THREE.Vector3(108, 168, 146), target: new THREE.Vector3(0, 5, -3), fov: 45
            };
            const presentationPoseBounds = new THREE.Box3();
            const presentationPoseCenter = new THREE.Vector3();
            const presentationPoseSize = new THREE.Vector3();
            const presentationFront = new THREE.Vector3();
            const presentationRight = new THREE.Vector3();
            const presentationWorldQuaternion = new THREE.Quaternion();
            function createPresentationStopPose(stop) {
                const group = presentationBuildingGroups.get(stop.buildingId);
                if (!group) return presentationOpeningStart;
                group.updateWorldMatrix(true, true);
                presentationPoseBounds.setFromObject(group);
                presentationPoseBounds.getCenter(presentationPoseCenter);
                presentationPoseBounds.getSize(presentationPoseSize);
                group.getWorldQuaternion(presentationWorldQuaternion);
                presentationFront.set(0, 0, 1).applyQuaternion(presentationWorldQuaternion).setY(0).normalize();
                presentationRight.set(1, 0, 0).applyQuaternion(presentationWorldQuaternion).setY(0).normalize();
                const distance = Math.max(30, Math.max(presentationPoseSize.x, presentationPoseSize.z) * .95 + 12) *
                    (stop.cameraDistance || 1);
                const target = presentationPoseCenter.clone();
                target.y = Math.max(3.2, presentationPoseBounds.min.y + presentationPoseSize.y * .36);
                const position = target.clone()
                    .addScaledVector(presentationFront, distance)
                    .addScaledVector(presentationRight, distance * (stop.cameraSide || 0));
                position.y = target.y + Math.max(12, distance * (stop.cameraElevation || .25));
                return {
                    position, target, fov: stop.cameraFov || 38
                };
            }
            const presentationStopPoses = EXECUTIVE_TOUR_STOPS.map(createPresentationStopPose);
            const presentationFocusBounds = new THREE.Box3();
            const presentationFocusAnchor = new THREE.Vector3();
            const presentationFocusProjected = new THREE.Vector3();
            const presentationShowState = {
                active: false,
                startedAt: 0,
                pausedAt: 0,
                paused: false,
                currentGreeting: -1,
                weatherStep: -1,
                currentStop: -2,
                messagePhase: '',
                lastClockUpdate: 0,
                layoutVisible: false,
                environmentTransition: null,
                previous: null
            };

            function capturePresentationEnvironmentAppearance() {
                return {
                    background: scene.background.clone(),
                    fog: scene.fog?.isFogExp2
                        ? { color: scene.fog.color.clone(), density: scene.fog.density }
                        : null,
                    ambientColor: ambient.color.clone(),
                    ambientGroundColor: ambient.groundColor.clone(),
                    ambientIntensity: ambient.intensity,
                    sunColor: sun.color.clone(),
                    sunPosition: sun.position.clone(),
                    sunIntensity: sun.intensity,
                    skyFillColor: skyFill.color.clone(),
                    skyFillIntensity: skyFill.intensity,
                    moonIntensity: moon.intensity,
                    exposure: renderer.toneMappingExposure,
                    rainVisible: rainField.visible,
                    rainOpacity: rainField.visible ? .42 : 0,
                    weatherMaterials: weatherMaterials.map(mat => ({
                        roughness: mat.roughness, metalness: mat.metalness
                    })),
                    glowMaterials: glowMaterials.map(mat => ({
                        emissive: mat.emissive.clone(), emissiveIntensity: mat.emissiveIntensity
                    })),
                    lampEmitterIntensity: lampEmitterMaterial.emissiveIntensity,
                    siteLights: siteNightLights.map(light => light.intensity),
                    buildingLights: buildingNightLights.map(light => light.intensity),
                    vehicleLights: movingVehicles.map(actor => actor.headlight.intensity)
                };
            }

            function createPresentationEnvironmentAppearance(mode) {
                const night = mode === 'night';
                const rain = mode === 'rain';
                const fog = mode === 'fog';
                const values = night ? {
                    background: '#061426', fogColor: '#07192b', fogDensity: .0023,
                    ambient: '#91b1db', ground: '#263b4d', ambientIntensity: 1.2,
                    sun: '#8b9fbd', sunPosition: [-85, 145, 65], sunIntensity: .1,
                    sky: '#3c5f91', skyIntensity: .2, moon: 2.4, exposure: 1.12,
                    siteLights: 24, buildingLights: 28, vehicleLights: 3.4
                } : rain ? {
                    background: '#718896', fogColor: '#8295a0', fogDensity: .0034,
                    ambient: '#c5d8e2', ground: '#566266', ambientIntensity: 1.18,
                    sun: '#c8d8e0', sunPosition: [-55, 110, 70], sunIntensity: .7,
                    sky: '#9cb6c4', skyIntensity: .34, moon: 0, exposure: .96,
                    siteLights: 2.8, buildingLights: 0, vehicleLights: 2.5
                } : fog ? {
                    background: '#d3dde0', fogColor: '#d3dde0', fogDensity: .0062,
                    ambient: '#f2f7f7', ground: '#9ba6a2', ambientIntensity: 1.85,
                    sun: '#e6eeee', sunPosition: [-70, 120, 65], sunIntensity: .82,
                    sky: '#d9e5e8', skyIntensity: .4, moon: 0, exposure: 1.02,
                    siteLights: 1.2, buildingLights: 0, vehicleLights: 2.1
                } : {
                    background: '#c8e4f3', fogColor: null, fogDensity: 0,
                    ambient: '#ffffff', ground: '#73805f', ambientIntensity: 2.45,
                    sun: '#fff6df', sunPosition: [-85, 145, 65], sunIntensity: 3.35,
                    sky: '#b8dcff', skyIntensity: .58, moon: 0, exposure: 1.12,
                    siteLights: 0, buildingLights: 0, vehicleLights: 0
                };
                return {
                    background: new THREE.Color(values.background),
                    fog: values.fogColor
                        ? { color: new THREE.Color(values.fogColor), density: values.fogDensity }
                        : null,
                    ambientColor: new THREE.Color(values.ambient),
                    ambientGroundColor: new THREE.Color(values.ground),
                    ambientIntensity: values.ambientIntensity,
                    sunColor: new THREE.Color(values.sun),
                    sunPosition: new THREE.Vector3(...values.sunPosition),
                    sunIntensity: values.sunIntensity,
                    skyFillColor: new THREE.Color(values.sky),
                    skyFillIntensity: values.skyIntensity,
                    moonIntensity: values.moon,
                    exposure: values.exposure,
                    rainVisible: rain,
                    rainOpacity: rain ? .42 : 0,
                    weatherMaterials: weatherMaterials.map(mat => ({
                        roughness: rain ? Math.min(.3, mat.userData.dryRoughness) : mat.userData.dryRoughness,
                        metalness: rain ? Math.min(1, mat.userData.dryMetalness + .2) : mat.userData.dryMetalness
                    })),
                    glowMaterials: glowMaterials.map((_, index) => ({
                        emissive: new THREE.Color(night ? (index < 2 ? '#245d8c' : '#438db7') : '#000000'),
                        emissiveIntensity: night ? (index < 2 ? 1.25 : 1.9) : 0
                    })),
                    lampEmitterIntensity: night ? 3.2 : 0,
                    siteLights: siteNightLights.map(() => values.siteLights),
                    buildingLights: buildingNightLights.map(() => values.buildingLights),
                    vehicleLights: movingVehicles.map(() => values.vehicleLights)
                };
            }

            function applyPresentationEnvironmentAppearance(state) {
                scene.background.copy(state.background);
                if (state.fog) {
                    if (!scene.fog?.isFogExp2) scene.fog = new THREE.FogExp2(state.fog.color, state.fog.density);
                    else {
                        scene.fog.color.copy(state.fog.color);
                        scene.fog.density = state.fog.density;
                    }
                } else scene.fog = null;
                ambient.color.copy(state.ambientColor);
                ambient.groundColor.copy(state.ambientGroundColor);
                ambient.intensity = state.ambientIntensity;
                sun.color.copy(state.sunColor);
                sun.position.copy(state.sunPosition);
                sun.intensity = state.sunIntensity;
                skyFill.color.copy(state.skyFillColor);
                skyFill.intensity = state.skyFillIntensity;
                moon.intensity = state.moonIntensity;
                renderer.toneMappingExposure = state.exposure;
                rainField.visible = state.rainVisible;
                rainMaterial.opacity = state.rainOpacity;
                weatherMaterials.forEach((mat, index) => {
                    mat.roughness = state.weatherMaterials[index].roughness;
                    mat.metalness = state.weatherMaterials[index].metalness;
                });
                glowMaterials.forEach((mat, index) => {
                    mat.emissive.copy(state.glowMaterials[index].emissive);
                    mat.emissiveIntensity = state.glowMaterials[index].emissiveIntensity;
                });
                lampEmitterMaterial.emissiveIntensity = state.lampEmitterIntensity;
                siteNightLights.forEach((light, index) => {
                    light.intensity = state.siteLights[index];
                    light.visible = light.intensity > .001;
                });
                buildingNightLights.forEach((light, index) => {
                    light.intensity = state.buildingLights[index];
                    light.visible = light.intensity > .001;
                });
                movingVehicles.forEach((actor, index) => {
                    actor.headlight.intensity = state.vehicleLights[index];
                    actor.headlight.visible = actor.headlight.intensity > .001;
                });
            }

            function beginPresentationEnvironmentTransition(mode) {
                const from = capturePresentationEnvironmentAppearance();
                const to = createPresentationEnvironmentAppearance(mode);
                environmentMode = mode;
                // Shadow-map refreshes are the most expensive part of the weather change.
                // Keep them only for the daylight target; other modes use fill and point lights.
                sun.castShadow = mode === 'day';
                moon.castShadow = false;
                renderer.shadowMap.needsUpdate = sun.castShadow;
                const fromFogColor = from.fog?.color || from.background;
                const transitionFog = scene.fog?.isFogExp2
                    ? scene.fog
                    : new THREE.FogExp2(fromFogColor, from.fog?.density || .000001);
                scene.fog = transitionFog;
                rainField.visible = from.rainVisible || to.rainVisible;
                siteNightLights.forEach((light, index) => {
                    light.visible = from.siteLights[index] > .001 || to.siteLights[index] > .001;
                });
                buildingNightLights.forEach((light, index) => {
                    light.visible = from.buildingLights[index] > .001 || to.buildingLights[index] > .001;
                });
                movingVehicles.forEach((actor, index) => {
                    actor.headlight.visible = from.vehicleLights[index] > .001 || to.vehicleLights[index] > .001;
                });
                presentationShowState.environmentTransition = {
                    from, to, transitionFog, startedAt: performance.now(),
                    duration: PRESENTATION_ENVIRONMENT_TRANSITION_DURATION,
                    lastAppliedAt: -Infinity
                };
            }

            function updatePresentationEnvironmentTransition(now) {
                const transitionState = presentationShowState.environmentTransition;
                if (!transitionState) return;
                const raw = Math.min((now - transitionState.startedAt) / transitionState.duration, 1);
                if (raw < 1 && now - transitionState.lastAppliedAt < 1000 / 30) return;
                transitionState.lastAppliedAt = now;
                const ease = raw * raw * raw * (raw * (raw * 6 - 15) + 10);
                const { from, to, transitionFog } = transitionState;
                scene.background.copy(from.background).lerp(to.background, ease);
                const fromFogColor = from.fog?.color || from.background;
                const toFogColor = to.fog?.color || to.background;
                const fogDensity = THREE.MathUtils.lerp(from.fog?.density || 0, to.fog?.density || 0, ease);
                transitionFog.color.copy(fromFogColor).lerp(toFogColor, ease);
                transitionFog.density = Math.max(.000001, fogDensity);
                ambient.color.copy(from.ambientColor).lerp(to.ambientColor, ease);
                ambient.groundColor.copy(from.ambientGroundColor).lerp(to.ambientGroundColor, ease);
                ambient.intensity = THREE.MathUtils.lerp(from.ambientIntensity, to.ambientIntensity, ease);
                sun.color.copy(from.sunColor).lerp(to.sunColor, ease);
                sun.position.copy(from.sunPosition).lerp(to.sunPosition, ease);
                sun.intensity = THREE.MathUtils.lerp(from.sunIntensity, to.sunIntensity, ease);
                skyFill.color.copy(from.skyFillColor).lerp(to.skyFillColor, ease);
                skyFill.intensity = THREE.MathUtils.lerp(from.skyFillIntensity, to.skyFillIntensity, ease);
                moon.intensity = THREE.MathUtils.lerp(from.moonIntensity, to.moonIntensity, ease);
                renderer.toneMappingExposure = THREE.MathUtils.lerp(from.exposure, to.exposure, ease);
                rainMaterial.opacity = THREE.MathUtils.lerp(from.rainOpacity, to.rainOpacity, ease);
                weatherMaterials.forEach((mat, index) => {
                    mat.roughness = THREE.MathUtils.lerp(
                        from.weatherMaterials[index].roughness, to.weatherMaterials[index].roughness, ease
                    );
                    mat.metalness = THREE.MathUtils.lerp(
                        from.weatherMaterials[index].metalness, to.weatherMaterials[index].metalness, ease
                    );
                });
                glowMaterials.forEach((mat, index) => {
                    mat.emissive.copy(from.glowMaterials[index].emissive)
                        .lerp(to.glowMaterials[index].emissive, ease);
                    mat.emissiveIntensity = THREE.MathUtils.lerp(
                        from.glowMaterials[index].emissiveIntensity,
                        to.glowMaterials[index].emissiveIntensity,
                        ease
                    );
                });
                lampEmitterMaterial.emissiveIntensity = THREE.MathUtils.lerp(
                    from.lampEmitterIntensity, to.lampEmitterIntensity, ease
                );
                siteNightLights.forEach((light, index) => {
                    light.intensity = THREE.MathUtils.lerp(from.siteLights[index], to.siteLights[index], ease);
                });
                buildingNightLights.forEach((light, index) => {
                    light.intensity = THREE.MathUtils.lerp(
                        from.buildingLights[index], to.buildingLights[index], ease
                    );
                });
                movingVehicles.forEach((actor, index) => {
                    actor.headlight.intensity = THREE.MathUtils.lerp(
                        from.vehicleLights[index], to.vehicleLights[index], ease
                    );
                });
                if (raw >= 1) {
                    applyPresentationEnvironmentAppearance(to);
                    presentationShowState.environmentTransition = null;
                }
            }

            function setPresentationWeatherStep(step) {
                if (presentationShowState.weatherStep === step) return;
                presentationShowState.weatherStep = step;
                const mode = presentationWeatherSequence[step % presentationWeatherSequence.length];
                presentationWeather.textContent = presentationEnvironmentLabels[mode];
                if (mode !== environmentMode) beginPresentationEnvironmentTransition(mode);
            }

            function setPresentationBuildingWeather() {
                if (presentationShowState.weatherStep === -2) return;
                presentationShowState.weatherStep = -2;
                presentationWeather.textContent = '☀ DAY · EXECUTIVE TOUR';
                if (environmentMode !== 'day') beginPresentationEnvironmentTransition('day');
            }

            function updatePresentationClock(now = new Date()) {
                const locale = presentationGreetings[presentationShowState.currentGreeting]?.locale || presentationLocale;
                presentationTime.textContent = new Intl.DateTimeFormat(locale, {
                    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
                }).format(now);
                presentationDate.textContent = new Intl.DateTimeFormat(locale, {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                }).format(now);
                const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
                presentationTimezone.textContent = zone.replaceAll('_', ' ');
            }

            function setPresentationMessage(phase) {
                if (presentationShowState.messagePhase === phase) return;
                presentationShowState.messagePhase = phase;
                presentationWelcome.classList.remove('is-visible');
                if (phase === 'opening') {
                    presentationGreeting.textContent = 'TDK Industrial';
                    presentationSubtitle.textContent = 'Executive Guided Tour · ภาพรวมกระบวนการสำคัญของโรงงาน';
                } else if (phase === 'closing') {
                    presentationGreeting.textContent = 'Precision · Efficiency · Sustainable Growth';
                    presentationSubtitle.textContent = 'ระบบงานที่เชื่อมโยง เพื่อการเติบโตอย่างยั่งยืน';
                } else return;
                requestAnimationFrame(() => {
                    if (presentationShowState.active && presentationShowState.messagePhase === phase) {
                        presentationWelcome.classList.add('is-visible');
                    }
                });
            }

            function setPresentationGreeting(index, visible) {
                const normalizedIndex = index % presentationGreetings.length;
                if (presentationShowState.currentGreeting !== normalizedIndex) {
                    const item = presentationGreetings[normalizedIndex];
                    presentationShowState.currentGreeting = normalizedIndex;
                    presentationShowState.messagePhase = `greeting-${normalizedIndex}`;
                    presentationGreeting.textContent = item.greeting;
                    presentationSubtitle.textContent = item.subtitle;
                    updatePresentationClock();
                }
                presentationWelcome.classList.toggle('is-visible', visible);
            }

            function setPresentationFocus(index) {
                if (presentationShowState.currentStop === index) return;
                presentationShowState.currentStop = index;
                presentationFocusCard.classList.remove('is-visible');
                presentationFocusCard.classList.remove('is-settled');
                if (index < 0 || index >= EXECUTIVE_TOUR_STOPS.length) {
                    presentationFocusCard.hidden = true;
                    presentationFocusCard.classList.remove('is-visible');
                    presentationShow.classList.remove('focus-visible');
                    return;
                }
                const stop = EXECUTIVE_TOUR_STOPS[index];
                const group = presentationBuildingGroups.get(stop.buildingId);
                const plan = BUILDING_INTERIORS[stop.buildingId];
                if (group) {
                    group.updateWorldMatrix(true, true);
                    presentationFocusBounds.setFromObject(group).expandByScalar(.8);
                    presentationFocusBounds.getCenter(presentationPoseCenter);
                    presentationFocusBounds.getSize(presentationPoseSize);
                    presentationFocusAnchor.copy(presentationPoseCenter);
                    presentationFocusAnchor.y = presentationFocusBounds.min.y + presentationPoseSize.y * .58;
                }
                presentationFocusCard.dataset.placement = stop.textPlacement || 'bottom-left';
                presentationFocusCount.textContent = `${String(index + 1).padStart(2, '0')} / ${String(EXECUTIVE_TOUR_STOPS.length).padStart(2, '0')}`;
                presentationFocusCategory.textContent = stop.category;
                presentationFocusTitle.textContent = stop.title;
                presentationFocusDescription.textContent = stop.description;
                presentationFocusValue.textContent = stop.value;
                presentationFocusZones.replaceChildren(...(plan?.zones || []).map(zone => {
                    const chip = document.createElement('span');
                    chip.textContent = zone.name;
                    return chip;
                }));
                presentationFocusCard.hidden = false;
            }

            function updatePresentationFocusOrigin() {
                if (presentationFocusCard.hidden) return;
                perspectiveCamera.updateMatrixWorld();
                presentationFocusProjected.copy(presentationFocusAnchor).project(perspectiveCamera);
                const anchorX = (presentationFocusProjected.x * .5 + .5) * innerWidth;
                const anchorY = (-presentationFocusProjected.y * .5 + .5) * innerHeight;
                const rect = presentationFocusCard.getBoundingClientRect();
                const rightAligned = presentationFocusCard.dataset.placement?.endsWith('right');
                const copyX = rightAligned ? rect.right : rect.left;
                const copyY = rect.top + Math.min(rect.height * .48, 150);
                const flyX = THREE.MathUtils.clamp(anchorX - copyX, -280, 280);
                const flyY = THREE.MathUtils.clamp(anchorY - copyY, -190, 190);
                presentationFocusCard.style.setProperty('--focus-fly-x', `${flyX.toFixed(1)}px`);
                presentationFocusCard.style.setProperty('--focus-fly-y', `${flyY.toFixed(1)}px`);
                presentationFocusCard.style.setProperty('--focus-anchor-x', `${anchorX.toFixed(1)}px`);
                presentationFocusCard.style.setProperty('--focus-anchor-y', `${anchorY.toFixed(1)}px`);
            }

            function setPresentationFocusVisible(visible, settled = false) {
                if (presentationFocusCard.hidden) visible = false;
                if (presentationFocusCard.classList.contains('is-visible') === visible) {
                    if (visible) {
                        presentationFocusCard.classList.toggle('is-settled', settled);
                        updatePresentationFocusOrigin();
                    }
                    return;
                }
                presentationFocusCard.classList.remove('is-visible');
                presentationFocusCard.classList.toggle('is-settled', visible && settled);
                presentationShow.classList.toggle('focus-visible', visible);
                if (!visible) return;
                updatePresentationFocusOrigin();
                requestAnimationFrame(() => {
                    if (presentationShowState.active && !presentationFocusCard.hidden) {
                        presentationFocusCard.classList.add('is-visible');
                    }
                });
            }

            function presentationEase(value) {
                const t = THREE.MathUtils.clamp(value, 0, 1);
                return t * t * t * (t * (t * 6 - 15) + 10);
            }

            function applyPresentationPose(from, to, amount, orbit = 0) {
                const eased = presentationEase(amount);
                perspectiveCamera.position.lerpVectors(from.position, to.position, eased);
                controls.target.lerpVectors(from.target, to.target, eased);
                if (orbit) {
                    const offset = perspectiveCamera.position.clone().sub(controls.target);
                    offset.applyAxisAngle(THREE.Object3D.DEFAULT_UP, orbit);
                    perspectiveCamera.position.copy(controls.target).add(offset);
                }
                const nextFov = THREE.MathUtils.lerp(from.fov, to.fov, eased);
                if (Math.abs(perspectiveCamera.fov - nextFov) > .01) {
                    perspectiveCamera.fov = nextFov;
                    perspectiveCamera.updateProjectionMatrix();
                }
            }

            function updatePresentationShow(now) {
                if (!presentationShowState.active) return;
                const timelineNow = presentationShowState.paused ? presentationShowState.pausedAt : now;
                const elapsed = ((timelineNow - presentationShowState.startedAt) % PRESENTATION_TOUR_DURATION +
                    PRESENTATION_TOUR_DURATION) % PRESENTATION_TOUR_DURATION;
                const buildingSequenceStart = PRESENTATION_OPENING_DURATION +
                    PRESENTATION_LAYOUT_BRIDGE_DURATION;
                const stopSequenceEnd = buildingSequenceStart +
                    EXECUTIVE_TOUR_STOPS.length * PRESENTATION_STOP_DURATION;
                let layoutVisible = false;
                if (elapsed < PRESENTATION_OPENING_DURATION) {
                    const greetingIndex = Math.floor(elapsed / PRESENTATION_GREETING_DURATION) %
                        presentationGreetings.length;
                    const greetingElapsed = elapsed % PRESENTATION_GREETING_DURATION;
                    // Repeat the Version 1 master layout between greetings and around every
                    // weather change. The lead-in also masks the heaviest scene transition.
                    const welcomeLayoutVisible = elapsed >= PRESENTATION_GREETING_VISIBLE_DURATION &&
                        elapsed < PRESENTATION_GREETING_VISIBLE_DURATION +
                            PRESENTATION_LAYOUT_BRIDGE_DURATION;
                    const weatherLayoutPhase = (elapsed + PRESENTATION_LAYOUT_TRANSITION_LEAD) %
                        PRESENTATION_WEATHER_DURATION;
                    const weatherLayoutVisible = elapsed >= PRESENTATION_WEATHER_DURATION -
                        PRESENTATION_LAYOUT_TRANSITION_LEAD &&
                        weatherLayoutPhase < PRESENTATION_LAYOUT_BRIDGE_DURATION;
                    layoutVisible = welcomeLayoutVisible || weatherLayoutVisible;
                    setPresentationGreeting(
                        greetingIndex,
                        greetingElapsed < PRESENTATION_GREETING_VISIBLE_DURATION && !layoutVisible
                    );
                    setPresentationWeatherStep(Math.floor(elapsed / PRESENTATION_WEATHER_DURATION));
                    setPresentationFocus(-1);
                    const overviewProgress = elapsed / PRESENTATION_OPENING_DURATION;
                    perspectiveCamera.position.copy(
                        presentationOverviewPositionCurve.getPointAt(overviewProgress)
                    );
                    controls.target.copy(presentationOverviewTargetCurve.getPointAt(overviewProgress));
                    const overviewFov = 42 + Math.sin(overviewProgress * Math.PI * 4) * 1.8;
                    if (Math.abs(perspectiveCamera.fov - overviewFov) > .01) {
                        perspectiveCamera.fov = overviewFov;
                        perspectiveCamera.updateProjectionMatrix();
                    }
                } else if (elapsed < buildingSequenceStart) {
                    setPresentationBuildingWeather();
                    setPresentationMessage('');
                    presentationShowState.currentGreeting = -1;
                    presentationWelcome.classList.remove('is-visible');
                    setPresentationFocus(-1);
                    layoutVisible = true;
                    const bridgeProgress = (elapsed - PRESENTATION_OPENING_DURATION) /
                        PRESENTATION_LAYOUT_BRIDGE_DURATION;
                    applyPresentationPose(
                        presentationOpeningStart, presentationOpeningStart, 1,
                        Math.sin(bridgeProgress * Math.PI) * .012
                    );
                } else if (elapsed < stopSequenceEnd) {
                    setPresentationBuildingWeather();
                    setPresentationMessage('');
                    presentationShowState.currentGreeting = -1;
                    presentationWelcome.classList.remove('is-visible');
                    const sequenceElapsed = elapsed - buildingSequenceStart;
                    const stopIndex = Math.floor(sequenceElapsed / PRESENTATION_STOP_DURATION);
                    const localElapsed = sequenceElapsed % PRESENTATION_STOP_DURATION;
                    const currentPose = presentationStopPoses[stopIndex];
                    const previousPose = stopIndex === 0
                        ? presentationOpeningStart
                        : presentationStopPoses[stopIndex - 1];
                    setPresentationFocus(stopIndex);
                    if (localElapsed < PRESENTATION_TRAVEL_DURATION) {
                        applyPresentationPose(previousPose, currentPose, localElapsed / PRESENTATION_TRAVEL_DURATION);
                    } else {
                        const holdProgress = (localElapsed - PRESENTATION_TRAVEL_DURATION) /
                            (PRESENTATION_STOP_DURATION - PRESENTATION_TRAVEL_DURATION);
                        applyPresentationPose(currentPose, currentPose, 1, Math.sin(holdProgress * Math.PI) * .025);
                    }
                    const focusRevealAt = PRESENTATION_TRAVEL_DURATION * .68;
                    setPresentationFocusVisible(
                        localElapsed >= focusRevealAt,
                        localElapsed >= focusRevealAt + 1600
                    );
                } else {
                    const closingElapsed = elapsed - stopSequenceEnd;
                    setPresentationBuildingWeather();
                    presentationShowState.currentGreeting = -1;
                    if (closingElapsed < 2200) setPresentationMessage('closing');
                    else {
                        setPresentationMessage('');
                        presentationWelcome.classList.remove('is-visible');
                    }
                    setPresentationFocus(-1);
                    applyPresentationPose(
                        presentationStopPoses.at(-1), presentationClosing,
                        Math.min(closingElapsed / 3600, 1)
                    );
                }
                presentationProgressBar.style.width = `${elapsed / PRESENTATION_TOUR_DURATION * 100}%`;
                if (layoutVisible !== presentationShowState.layoutVisible) {
                    presentationShowState.layoutVisible = layoutVisible;
                    presentationLayout.classList.toggle('is-visible', layoutVisible);
                    presentationShow.classList.toggle('layout-visible', layoutVisible);
                }
                updatePresentationEnvironmentTransition(now);
                if (now - presentationShowState.lastClockUpdate >= 250) {
                    presentationShowState.lastClockUpdate = now;
                    updatePresentationClock();
                }
            }

            async function startPresentationShow({ fullscreen = true } = {}) {
                if (presentationShowState.active) return;
                if (gameMode) setGameMode(false);
                if (activeInterior) closeInterior();
                presentationShowState.previous = {
                    camera,
                    position: camera.position.clone(),
                    target: controls.target.clone(),
                    fov: perspectiveCamera.fov,
                    zoom: camera.zoom,
                    controlsEnabled: controls.enabled,
                    damping: controls.enableDamping,
                    transformVisible: transformControls.visible,
                    selectionVisible: selectionHighlightGroup.visible,
                    environment: environmentMode,
                    warm: document.getElementById('warm').checked
                };
                presentationShowState.active = true;
                presentationShowState.startedAt = performance.now();
                presentationShowState.pausedAt = 0;
                presentationShowState.paused = false;
                presentationShowState.lastClockUpdate = 0;
                presentationShowState.currentGreeting = -1;
                presentationShowState.weatherStep = -1;
                presentationShowState.currentStop = -2;
                presentationShowState.messagePhase = '';
                presentationShowState.layoutVisible = false;
                presentationShowState.environmentTransition = null;
                transition = null;
                setActiveCamera(perspectiveCamera);
                perspectiveCamera.position.copy(presentationOpeningStart.position);
                controls.target.copy(presentationOpeningStart.target);
                perspectiveCamera.fov = presentationOpeningStart.fov;
                perspectiveCamera.updateProjectionMatrix();
                controls.enabled = false;
                controls.enableDamping = false;
                transformControls.visible = false;
                selectionHighlightGroup.visible = false;
                document.body.classList.add('presentation-mode', 'presentation-show-active');
                presentationShow.hidden = false;
                presentationFocusCard.hidden = true;
                presentationLayout.classList.remove('is-visible');
                presentationShow.classList.remove('layout-visible');
                presentationShow.classList.remove('focus-visible');
                presentationPause.textContent = 'Ⅱ';
                presentationPause.title = 'หยุดชั่วคราว';
                presentationPause.setAttribute('aria-label', 'หยุดชั่วคราว');
                presentationPause.setAttribute('aria-pressed', 'false');
                document.querySelectorAll('.presentation-start').forEach(button => {
                    button.classList.add('active');
                    button.setAttribute('aria-pressed', 'true');
                });
                applyEnvironment('day');
                presentationWeather.textContent = '☀ DAY · EXECUTIVE TOUR';
                updatePresentationClock();
                updatePresentationShow(presentationShowState.startedAt);
                if (fullscreen && !document.fullscreenElement && document.documentElement.requestFullscreen) {
                    try {
                        await document.documentElement.requestFullscreen();
                    } catch (_) {
                        // The cinematic show still fills the browser viewport when fullscreen is unavailable.
                    }
                }
                window.dispatchEvent(new Event('resize'));
            }

            async function stopPresentationShow({ exitFullscreen = true } = {}) {
                if (!presentationShowState.active) return;
                const previous = presentationShowState.previous;
                presentationShowState.active = false;
                presentationShowState.environmentTransition = null;
                presentationShowState.paused = false;
                presentationShow.hidden = true;
                presentationWelcome.classList.remove('is-visible');
                presentationFocusCard.classList.remove('is-visible');
                presentationFocusCard.hidden = true;
                presentationLayout.classList.remove('is-visible');
                presentationShow.classList.remove('layout-visible');
                presentationShow.classList.remove('focus-visible');
                document.body.classList.remove('presentation-show-active');
                document.querySelectorAll('.presentation-start').forEach(button => {
                    button.classList.remove('active');
                    button.setAttribute('aria-pressed', 'false');
                });
                if (previous) {
                    setActiveCamera(previous.camera);
                    camera.position.copy(previous.position);
                    controls.target.copy(previous.target);
                    camera.zoom = previous.zoom;
                    if (camera === perspectiveCamera) perspectiveCamera.fov = previous.fov;
                    camera.updateProjectionMatrix();
                    controls.enabled = previous.controlsEnabled;
                    controls.enableDamping = previous.damping;
                    transformControls.visible = previous.transformVisible;
                    selectionHighlightGroup.visible = previous.selectionVisible;
                    controls.update();
                    const warmToggle = document.getElementById('warm');
                    warmToggle.checked = previous.warm;
                    applyEnvironment(previous.environment);
                    rainMaterial.opacity = .42;
                    if (previous.environment === 'day' && previous.warm) {
                        warmToggle.dispatchEvent(new Event('change'));
                    }
                }
                if (exitFullscreen && document.fullscreenElement) {
                    try { await document.exitFullscreen(); } catch (_) { /* Keep the restored in-page view. */ }
                }
                if (!document.fullscreenElement) document.body.classList.remove('presentation-mode');
                window.dispatchEvent(new Event('resize'));
            }

            ['presentation-start', 'editor-presentation'].forEach(id => {
                document.getElementById(id).addEventListener('click', () => startPresentationShow());
            });
            function seekPresentationStop(direction) {
                if (!presentationShowState.active) return;
                const now = performance.now();
                const timelineNow = presentationShowState.paused ? presentationShowState.pausedAt : now;
                const elapsed = ((timelineNow - presentationShowState.startedAt) % PRESENTATION_TOUR_DURATION +
                    PRESENTATION_TOUR_DURATION) % PRESENTATION_TOUR_DURATION;
                let current;
                const buildingSequenceStart = PRESENTATION_OPENING_DURATION +
                    PRESENTATION_LAYOUT_BRIDGE_DURATION;
                if (elapsed < buildingSequenceStart) current = direction > 0 ? -1 : 0;
                else current = THREE.MathUtils.clamp(
                    Math.floor((elapsed - buildingSequenceStart) / PRESENTATION_STOP_DURATION),
                    0, EXECUTIVE_TOUR_STOPS.length - 1
                );
                const next = (current + direction + EXECUTIVE_TOUR_STOPS.length) % EXECUTIVE_TOUR_STOPS.length;
                const seekTime = buildingSequenceStart + next * PRESENTATION_STOP_DURATION +
                    PRESENTATION_TRAVEL_DURATION;
                if (presentationShowState.paused) {
                    presentationShowState.pausedAt = now;
                    presentationShowState.startedAt = now - seekTime;
                } else presentationShowState.startedAt = now - seekTime;
                presentationShowState.currentStop = -2;
                updatePresentationShow(now);
            }
            presentationPrevious.addEventListener('click', () => seekPresentationStop(-1));
            presentationNext.addEventListener('click', () => seekPresentationStop(1));
            presentationPause.addEventListener('click', () => {
                if (!presentationShowState.active) return;
                const now = performance.now();
                if (presentationShowState.paused) {
                    presentationShowState.startedAt += now - presentationShowState.pausedAt;
                    presentationShowState.pausedAt = 0;
                    presentationShowState.paused = false;
                    presentationPause.textContent = 'Ⅱ';
                    presentationPause.title = 'หยุดชั่วคราว';
                    presentationPause.setAttribute('aria-label', 'หยุดชั่วคราว');
                    presentationPause.setAttribute('aria-pressed', 'false');
                } else {
                    presentationShowState.paused = true;
                    presentationShowState.pausedAt = now;
                    presentationPause.textContent = '▶';
                    presentationPause.title = 'เล่นต่อ';
                    presentationPause.setAttribute('aria-label', 'เล่นต่อ');
                    presentationPause.setAttribute('aria-pressed', 'true');
                }
            });
            window.addEventListener('keydown', event => {
                if (event.code === 'Escape' && presentationShowState.active && !document.fullscreenElement) {
                    event.preventDefault();
                    stopPresentationShow({ exitFullscreen: false });
                }
            });
            const interiorPanel = document.getElementById('interior-panel');
            const interiorZones = document.getElementById('interior-zones');
            const interiorDetail = document.getElementById('interior-detail');
            const buildingGroupById = new Map(BUILDINGS.map(item => [item.id,
                warehouseGroups[item.id] || (item.id === 'main_office' ? office : canteen)]));

            function showInteriorZone(id) {
                if (!activeInterior) return;
                const zone = activeInterior.model.plan.zones.find(item => item.id === id);
                if (!zone) return;
                activeInterior.model.setSelected(id);
                for (const button of interiorZones.querySelectorAll('button')) {
                    const selected = button.dataset.zoneId === id;
                    button.classList.toggle('active', selected);
                    button.setAttribute('aria-pressed', String(selected));
                }
                interiorDetail.replaceChildren();
                const title = document.createElement('strong');
                title.textContent = zone.name;
                const description = document.createElement('p');
                description.textContent = zone.detail;
                interiorDetail.append(title, description);
            }

            function closeInterior({ restoreCamera = true } = {}) {
                if (!activeInterior) return false;
                const { exterior, model, previousCamera, returnToEditor } = activeInterior;
                activeInterior = null;
                scene.remove(model.root);
                model.dispose();
                exterior.visible = true;
                interiorPanel.hidden = true;
                document.body.classList.remove('interior-active');
                renderer.shadowMap.needsUpdate = true;
                controls.minDistance = previousCamera.minDistance;
                controls.maxDistance = previousCamera.maxDistance;
                controls.enableRotate = previousCamera.enableRotate;
                controls.enablePan = previousCamera.enablePan;
                if (restoreCamera) {
                    if (previousCamera.top) {
                        setActiveCamera(topCamera);
                        topCamera.position.copy(previousCamera.position);
                        topCamera.zoom = previousCamera.zoom;
                        topCamera.updateProjectionMatrix();
                        controls.target.copy(previousCamera.target);
                        controls.enableRotate = false;
                        controls.update();
                    } else {
                        transition = {
                            time: performance.now(), duration: 850,
                            fromPosition: perspectiveCamera.position.clone(),
                            fromTarget: controls.target.clone(),
                            fromFov: perspectiveCamera.fov,
                            toPosition: previousCamera.position,
                            toTarget: previousCamera.target,
                            toFov: previousCamera.fov
                        };
                    }
                }
                if (restoreCamera && returnToEditor) setEditorMode(true);
                return true;
            }

            function openInterior(id, { returnToEditor = false } = {}) {
                if (editorMode || gameMode || overlayEnabled || !BUILDING_INTERIORS[id]) return false;
                if (activeInterior?.id === id) return true;
                if (activeInterior) closeInterior({ restoreCamera: false });
                const building = BUILDING_BY_ID[id];
                const exterior = buildingGroupById.get(id);
                if (!building || !exterior || !exterior.visible) return false;
                const model = createBuildingInterior(THREE, building, SITE.renderUnitsPerSiteUnit);
                const previousCamera = {
                    top: camera === topCamera,
                    position: camera.position.clone(),
                    target: controls.target.clone(),
                    fov: perspectiveCamera.fov,
                    zoom: topCamera.zoom,
                    minDistance: controls.minDistance,
                    maxDistance: controls.maxDistance,
                    enableRotate: controls.enableRotate,
                    enablePan: controls.enablePan
                };
                model.root.position.copy(exterior.position);
                model.root.quaternion.copy(exterior.quaternion);
                model.root.scale.copy(exterior.scale);
                scene.add(model.root);
                exterior.visible = false;
                activeInterior = { id, exterior, model, previousCamera, returnToEditor };
                interiorPanel.hidden = false;
                document.body.classList.add('interior-active');
                document.getElementById('interior-title').textContent = model.plan.title;
                document.getElementById('interior-subtitle').textContent = model.plan.subtitle;
                interiorZones.replaceChildren();
                for (const zone of model.plan.zones) {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'interior-zone';
                    button.dataset.zoneId = zone.id;
                    button.textContent = zone.name;
                    button.addEventListener('click', () => showInteriorZone(zone.id));
                    interiorZones.append(button);
                }
                showInteriorZone(model.plan.zones[0].id);
                model.root.updateMatrixWorld(true);
                const center = model.root.localToWorld(new THREE.Vector3(0, .8, 0));
                const span = Math.max(building.size.width, building.size.depth) * SITE.renderUnitsPerSiteUnit;
                const destination = center.clone().add(new THREE.Vector3(span * .36, span * 1.18, span * .48));
                if (camera !== perspectiveCamera) {
                    setActiveCamera(perspectiveCamera);
                    perspectiveCamera.position.copy(destination);
                    controls.target.copy(center);
                    perspectiveCamera.fov = 44;
                    perspectiveCamera.updateProjectionMatrix();
                    transition = null;
                } else {
                    transition = {
                        time: performance.now(), duration: 1100,
                        fromPosition: perspectiveCamera.position.clone(),
                        fromTarget: controls.target.clone(),
                        fromFov: perspectiveCamera.fov,
                        toPosition: destination, toTarget: center, toFov: 44
                    };
                }
                controls.enableRotate = true;
                controls.enablePan = true;
                controls.minDistance = 8;
                controls.maxDistance = Math.max(80, span * 2.5);
                controls.autoRotate = false;
                document.getElementById('rotate').checked = false;
                renderer.shadowMap.needsUpdate = true;
                return true;
            }

            document.getElementById('interior-close').addEventListener('click', () => closeInterior());
            document.getElementById('interior-back').addEventListener('click', () => closeInterior());
            document.querySelectorAll('.view').forEach(button => {
                button.classList.toggle('active', button.dataset.view === activeViewKey);
            });

            function setActiveCamera(nextCamera) {
                camera = nextCamera;
                controls.object = nextCamera;
                transformControls.camera = nextCamera;
                controls.update();
            }

            function balancedPerspectivePosition(view) {
                const viewportSize = getViewportSize();
                const aspect = viewportSize.width / viewportSize.height;
                const position = view.position.clone();
                // Pull back consistently on portrait/narrow embeds without changing the target.
                if (aspect < 1.15) {
                    const factor = THREE.MathUtils.clamp(1.15 / aspect, 1, 1.85);
                    position.sub(view.target).multiplyScalar(factor).add(view.target);
                }
                return position;
            }

            function fitTopCamera(view = views.top) {
                const viewportSize = getViewportSize();
                const aspect = viewportSize.width / viewportSize.height;
                const contentHeight = CAMERA_PRESETS.top.orthoHeight;
                const contentWidth = CAMERA_PRESETS.top.orthoHeight;
                const halfHeight = Math.max(contentHeight / 2, contentWidth / (2 * aspect));
                const halfWidth = halfHeight * aspect;
                topCamera.left = -halfWidth;
                topCamera.right = halfWidth;
                topCamera.top = halfHeight;
                topCamera.bottom = -halfHeight;
                topCamera.position.copy(view.position);
                topCamera.up.set(0, 0, -1);
                topCamera.zoom = 1;
                topCamera.updateProjectionMatrix();
            }

            function activateView(viewKey, { animate = true } = {}) {
                if (!Object.hasOwn(views, viewKey)) return false;
                closeInterior({ restoreCamera: false });
                if (gameMode) setGameMode(false);
                document.querySelectorAll('.view').forEach(button => {
                    button.classList.toggle('active', button.dataset.view === viewKey);
                });
                activeViewKey = viewKey;
                const view = views[activeViewKey];
                controls.autoRotate = false;
                document.getElementById('rotate').checked = false;

                if (view.orthographic) {
                    setActiveCamera(topCamera);
                    fitTopCamera(view);
                    controls.target.copy(view.target);
                    topCamera.lookAt(view.target);
                    controls.enableRotate = false;
                    controls.enablePan = true;
                    controls.minZoom = .55;
                    controls.maxZoom = 5;
                    transition = null;
                    controls.update();
                    return true;
                }

                const destination = balancedPerspectivePosition(view);
                if (camera !== perspectiveCamera) {
                    setActiveCamera(perspectiveCamera);
                    perspectiveCamera.position.copy(destination);
                    controls.target.copy(view.target);
                    perspectiveCamera.fov = view.fov;
                    perspectiveCamera.updateProjectionMatrix();
                    animate = false;
                }
                controls.enableRotate = true;
                controls.enablePan = true;
                controls.minDistance = 12;
                controls.maxDistance = 430;
                if (!animate) {
                    transition = null;
                    perspectiveCamera.position.copy(destination);
                    controls.target.copy(view.target);
                    perspectiveCamera.fov = view.fov;
                    perspectiveCamera.updateProjectionMatrix();
                    controls.update();
                    return true;
                }
                transition = {
                    time: performance.now(),
                    duration: 1250,
                    fromPosition: perspectiveCamera.position.clone(),
                    fromTarget: controls.target.clone(),
                    fromFov: perspectiveCamera.fov,
                    toPosition: destination,
                    toTarget: view.target,
                    toFov: view.fov
                };
                return true;
            }

            document.querySelectorAll('.view').forEach(button => {
                button.addEventListener('click', () => activateView(button.dataset.view));
            });

            // The top view needs the orthographic camera immediately; perspective presets
            // already start at their exact authored positions above.
            if (activeViewKey === 'top') activateView(activeViewKey, { animate: false });

            // Reusable integration surface for the standalone map and future projects.
            window.TDK_FACTORY_MAP = {
                scene, renderer, controls, views,
                cameras: { perspective: perspectiveCamera, top: topCamera },
                setView: (viewKey, options) => activateView(viewKey, options),
                setEnvironment: mode => applyEnvironment(mode),
                setActivity: enabled => {
                    activityEnabled = !!enabled;
                    const toggle = document.getElementById('activity-toggle');
                    if (toggle) toggle.checked = activityEnabled;
                },
                startPresentation: options => startPresentationShow(options),
                stopPresentation: options => stopPresentationShow(options),
                getCamera: () => camera,
                getObject: id => editableObjects.get(id) || null,
                openInterior, closeInterior,
                get activeInterior() { return activeInterior?.id || null; },
                get activeView() { return activeViewKey; },
                get presentationActive() { return presentationShowState.active; }
            };

            if (startupParams.get('presentation') === '1') {
                startPresentationShow({ fullscreen: false });
            }

            controls.addEventListener('start', () => { transition = null; });

            document.getElementById('labels').addEventListener('change', event => {
                labelGroup.visible = event.target.checked;
            });

            document.getElementById('debug').addEventListener('change', event => {
                debugGroup.visible = event.target.checked;
            });

            const overlay = document.getElementById('reference-overlay');
            const overlayToggle = document.getElementById('overlay-toggle');
            const differenceToggle = document.getElementById('overlay-difference');
            const overlayOpacity = document.getElementById('overlay-opacity');
            let differenceBlendEnabled = false;

            function updateOverlay() {
                overlay.classList.toggle('is-hidden', !overlayEnabled);
                overlay.classList.toggle('difference-blend', differenceBlendEnabled);
                overlay.style.opacity = String(Number(overlayOpacity.value) / 100);
                overlayToggle.classList.toggle('active', overlayEnabled);
                overlayToggle.setAttribute('aria-pressed', String(overlayEnabled));
                overlayToggle.textContent = `Overlay: ${overlayEnabled ? 'เปิด' : 'ปิด'}`;
                differenceToggle.classList.toggle('active', differenceBlendEnabled);
                differenceToggle.setAttribute('aria-pressed', String(differenceBlendEnabled));
                differenceToggle.textContent = `Difference blend: ${differenceBlendEnabled ? 'เปิด' : 'ปิด'}`;
                controls.enabled = !overlayEnabled && !gameMode && !transformControls.dragging && !editorBoxSelection;
            }

            overlayToggle.addEventListener('click', () => {
                overlayEnabled = !overlayEnabled;
                transition = null;
                updateOverlay();
            });
            differenceToggle.addEventListener('click', () => {
                differenceBlendEnabled = !differenceBlendEnabled;
                updateOverlay();
            });
            overlayOpacity.addEventListener('input', () => {
                overlayOpacity.parentElement.querySelector('output').value = `${overlayOpacity.value}%`;
                updateOverlay();
            });

            const CAMERA_STORAGE_KEY = 'tdk-v7-aerial-reference-camera';
            const defaultCameraCalibration = {
                position: [...CAMERA_PRESETS.reference.position],
                target: [...CAMERA_PRESETS.reference.target],
                fov: CAMERA_PRESETS.reference.fov
            };
            const previousDefaultCameraCalibrations = [
                {
                    position: [-78, 150, 210],
                    target: [37, 2, 10],
                    fov: 40
                },
                {
                    position: [8, 120, 170],
                    target: [25, 2, 10],
                    fov: 46
                }
            ];
            let cameraCalibration = {
                position: [...defaultCameraCalibration.position],
                target: [...defaultCameraCalibration.target],
                fov: defaultCameraCalibration.fov
            };
            try {
                const saved = window.TDK_FACTORY_CAMERA_OVERRIDE ||
                    JSON.parse(localStorage.getItem(CAMERA_STORAGE_KEY));
                if (Array.isArray(saved?.position) && saved.position.length === 3 && saved.position.every(Number.isFinite) &&
                    Array.isArray(saved?.target) && saved.target.length === 3 && saved.target.every(Number.isFinite) &&
                    Number.isFinite(saved?.fov)) {
                    const isPreviousDefault = previousDefaultCameraCalibrations.some(previous =>
                        saved.position.every((value, index) => value === previous.position[index]) &&
                        saved.target.every((value, index) => value === previous.target[index]) &&
                        saved.fov === previous.fov);
                    if (!isPreviousDefault) {
                        cameraCalibration = {
                            position: [...saved.position],
                            target: [...saved.target],
                            fov: THREE.MathUtils.clamp(saved.fov, 20, 70)
                        };
                    }
                }
            } catch (_) { /* Use the front-left default when storage is unavailable or invalid. */ }

            const cameraInputs = [...document.querySelectorAll('[data-camera-path]')];
            const cameraJSON = document.getElementById('camera-json');
            const cameraCopyStatus = document.getElementById('camera-copy-status');

            function currentCameraJSON() {
                return {
                    position: cameraCalibration.position.map(value => Number(value.toFixed(2))),
                    target: cameraCalibration.target.map(value => Number(value.toFixed(2))),
                    fov: Number(cameraCalibration.fov.toFixed(1))
                };
            }

            function saveCameraCalibration() {
                try { localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(currentCameraJSON())); }
                catch (_) { /* Calibration still works for this page session. */ }
            }

            function updateCameraReadout() {
                cameraJSON.textContent = JSON.stringify(currentCameraJSON(), null, 2);
            }

            function applyCameraCalibration() {
                views.photo.position.set(...cameraCalibration.position);
                views.photo.target.set(...cameraCalibration.target);
                views.photo.fov = cameraCalibration.fov;
                if (activeViewKey !== 'photo') return;
                if (camera !== perspectiveCamera) setActiveCamera(perspectiveCamera);
                transition = null;
                perspectiveCamera.position.set(...cameraCalibration.position);
                controls.target.set(...cameraCalibration.target);
                perspectiveCamera.fov = cameraCalibration.fov;
                perspectiveCamera.updateProjectionMatrix();
                controls.update();
            }

            cameraInputs.forEach(input => {
                const [group, rawIndex] = input.dataset.cameraPath.split('.');
                const index = rawIndex === undefined ? null : Number(rawIndex);
                input.value = index === null ? cameraCalibration[group] : cameraCalibration[group][index];
                const initialValue = Number(input.value);
                if (index === null) cameraCalibration[group] = initialValue;
                else cameraCalibration[group][index] = initialValue;
                input.parentElement.querySelector('output').value = `${initialValue}${group === 'fov' ? '°' : ''}`;
                input.addEventListener('input', () => {
                    const value = Number(input.value);
                    if (index === null) cameraCalibration[group] = value;
                    else cameraCalibration[group][index] = value;
                    input.parentElement.querySelector('output').value = `${value}${group === 'fov' ? '°' : ''}`;
                    applyCameraCalibration();
                    updateCameraReadout();
                    saveCameraCalibration();
                });
            });

            document.getElementById('copy-camera-json').addEventListener('click', async () => {
                const text = JSON.stringify(currentCameraJSON(), null, 2);
                try {
                    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
                    await navigator.clipboard.writeText(text);
                } catch (_) {
                    const fallback = document.createElement('textarea');
                    fallback.value = text;
                    fallback.style.position = 'fixed';
                    fallback.style.opacity = '0';
                    document.body.appendChild(fallback);
                    fallback.select();
                    document.execCommand('copy');
                    fallback.remove();
                }
                cameraCopyStatus.textContent = 'คัดลอก camera JSON แล้ว';
                setTimeout(() => {
                    cameraCopyStatus.textContent = 'ค่ากล้องบันทึกอัตโนมัติในเบราว์เซอร์นี้';
                }, 1800);
            });

            updateCameraReadout();
            saveCameraCalibration();
            applyCameraCalibration();
            updateOverlay();

            document.getElementById('rotate').addEventListener('change', event => {
                if (event.target.checked && camera === topCamera) {
                    event.target.checked = false;
                    return;
                }
                if (event.target.checked && gameMode) setGameMode(false);
                if (event.target.checked && editorMode) setEditorMode(false);
                controls.autoRotate = event.target.checked;
                transition = null;
            });

            document.getElementById('warm').addEventListener('change', event => {
                const warm = event.target.checked;
                if (environmentMode !== 'day') {
                    event.target.checked = false;
                    return;
                }
                sun.color.set(warm ? '#ffd098' : '#fff5de');
                sun.position.set(warm ? -125 : -85, warm ? 65 : 145, warm ? 90 : 65);
                sun.intensity = warm ? 3.6 : 3.35;
                ambient.intensity = warm ? 1.5 : 2.45;
                scene.background.set(warm ? '#ead8c4' : '#c8e4f3');
            });

            document.querySelectorAll('.environment-mode').forEach(button => {
                button.addEventListener('click', () => applyEnvironment(button.dataset.environment));
            });
            document.getElementById('activity-toggle').addEventListener('change', event => {
                activityEnabled = event.target.checked;
                environmentStatus.textContent = activityEnabled
                    ? 'เปิดการเคลื่อนไหวคนและยานพาหนะแล้ว'
                    : 'หยุดการเคลื่อนไหวคนและยานพาหนะชั่วคราว';
            });
            applyEnvironment('day');

            document.getElementById('game-toggle').addEventListener('click', () => {
                setGameMode(!gameMode);
            });

            window.addEventListener('keydown', event => {
                const typing = /INPUT|SELECT|TEXTAREA/.test(event.target?.tagName || '');
                if (event.code === 'Escape' && activeInterior && !typing) {
                    closeInterior();
                    return;
                }
                if (editorMode && !typing) {
                    if (event.code === 'KeyG' && !event.ctrlKey && !event.metaKey) setEditorTransformMode('translate');
                    if (event.code === 'KeyR' && !event.ctrlKey && !event.metaKey) setEditorTransformMode('rotate');
                    if (event.code === 'KeyS' && !event.ctrlKey && !event.metaKey) setEditorTransformMode('scale');
                    if (event.code === 'KeyF' && !event.ctrlKey && !event.metaKey) focusEditorSelection();
                    if (event.code === 'KeyD' && !event.ctrlKey && !event.metaKey) duplicateSelectedEditable();
                    if (event.code === 'Delete' || event.code === 'Backspace') deleteSelectedEditable();
                    if (event.code === 'Escape') {
                        if (wallCutMode) finishWallCut();
                        selectEditable(null);
                    }
                    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') event.shiftKey ? redoEditorChange() : undoEditorChange();
                    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyY') redoEditorChange();
                    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyS') saveEditorLayout();
                    if ((!event.ctrlKey && !event.metaKey && ['KeyG', 'KeyR', 'KeyD', 'KeyF', 'KeyS', 'Delete', 'Backspace'].includes(event.code)) ||
                        ((event.ctrlKey || event.metaKey) && ['KeyS', 'KeyZ', 'KeyY'].includes(event.code))) event.preventDefault();
                }
                if (typing) return;
                playerKeys[event.code] = true;
                if (gameMode && event.code === 'Digit1') selectWeapon('unarmed');
                if (gameMode && event.code === 'Digit2') selectWeapon('knife');
                if (gameMode && event.code === 'Digit3') selectWeapon('pistol');
                if (gameMode && event.code === 'KeyV' && !event.repeat) setGameView(!gameFirstPerson);
                if (gameMode && event.code === 'Space') jumpQueued = true;
                if (gameMode && GAME_MOVEMENT_CODES.includes(event.code)) {
                    event.preventDefault();
                }
                if (gameMode && event.code === 'KeyV') event.preventDefault();
                if (gameMode && event.code === 'Escape') setGameMode(false);
            });

            window.addEventListener('keyup', event => {
                playerKeys[event.code] = false;
            });

            window.addEventListener('blur', () => {
                clearPlayerInput();
            });

            const touchKeyMap = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD' };
            document.querySelectorAll('#game-pad button').forEach(button => {
                const code = touchKeyMap[button.dataset.key];
                button.addEventListener('pointerdown', event => {
                    event.preventDefault();
                    playerKeys[code] = true;
                    button.setPointerCapture(event.pointerId);
                });
                ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => {
                    button.addEventListener(type, () => { playerKeys[code] = false; });
                });
            });

            const raycaster = new THREE.Raycaster();
            const pointer = new THREE.Vector2();
            let downX = 0, downY = 0;

            renderer.domElement.addEventListener('pointerdown', event => {
                downX = event.clientX;
                downY = event.clientY;
                if (gameMode && event.pointerType !== 'touch') {
                    if (event.button === 0) playerKeys.Mouse0 = true;
                    if (event.button === 2) {
                        gameMouseLook = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
                        renderer.domElement.setPointerCapture(event.pointerId);
                    }
                    event.preventDefault();
                    return;
                }
                if (gameMode && event.pointerType === 'touch') {
                    gameTouchLook = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
                    renderer.domElement.setPointerCapture(event.pointerId);
                    return;
                }
                if (editorMode && event.button === 0 && (event.ctrlKey || event.metaKey)) {
                    editorBoxSelection = {
                        pointerId: event.pointerId,
                        startX: event.clientX, startY: event.clientY,
                        active: false
                    };
                    controls.enabled = false;
                }
            });

            renderer.domElement.addEventListener('pointermove', event => {
                if (gameMouseLook && event.pointerId === gameMouseLook.pointerId) {
                    gameCameraYaw -= (event.clientX - gameMouseLook.x) * GAME_CONFIG.mouseSensitivity;
                    gameCameraPitch = clamp(
                        gameCameraPitch - (event.clientY - gameMouseLook.y) * GAME_CONFIG.mouseSensitivity,
                        GAME_CONFIG.minPitch, GAME_CONFIG.maxPitch
                    );
                    gameMouseLook.x = event.clientX;
                    gameMouseLook.y = event.clientY;
                    event.preventDefault();
                    return;
                }
                if (gameTouchLook && event.pointerId === gameTouchLook.pointerId) {
                    gameCameraYaw -= (event.clientX - gameTouchLook.x) * .012;
                    gameCameraPitch = clamp(
                        gameCameraPitch - (event.clientY - gameTouchLook.y) * GAME_CONFIG.touchSensitivity,
                        GAME_CONFIG.minPitch, GAME_CONFIG.maxPitch
                    );
                    gameTouchLook.x = event.clientX;
                    gameTouchLook.y = event.clientY;
                    event.preventDefault();
                    return;
                }
                if (!editorBoxSelection || event.pointerId !== editorBoxSelection.pointerId) return;
                const selection = editorBoxSelection;
                if (!selection.active && Math.hypot(event.clientX - selection.startX, event.clientY - selection.startY) > 5) {
                    selection.active = true;
                    controls.enabled = false;
                    editorMarquee.style.display = 'block';
                    renderer.domElement.setPointerCapture(event.pointerId);
                }
                if (!selection.active) return;
                const left = Math.min(selection.startX, event.clientX);
                const top = Math.min(selection.startY, event.clientY);
                editorMarquee.style.left = `${left}px`;
                editorMarquee.style.top = `${top}px`;
                editorMarquee.style.width = `${Math.abs(event.clientX - selection.startX)}px`;
                editorMarquee.style.height = `${Math.abs(event.clientY - selection.startY)}px`;
                event.preventDefault();
            });

            renderer.domElement.addEventListener('pointerup', event => {
                if (gameMouseLook && event.pointerId === gameMouseLook.pointerId) {
                    gameMouseLook = null;
                    return;
                }
                if (gameTouchLook && event.pointerId === gameTouchLook.pointerId) {
                    gameTouchLook = null;
                    return;
                }
                if (gameMode) {
                    if (event.button === 0) playerKeys.Mouse0 = false;
                    return;
                }
                if (editorBoxSelection && event.pointerId === editorBoxSelection.pointerId) {
                    const selection = editorBoxSelection;
                    editorBoxSelection = null;
                    editorMarquee.style.display = 'none';
                    controls.enabled = !gameMode && !overlayEnabled;
                    if (selection.active) {
                        selectEditablesInScreenRect(selection.startX, selection.startY, event.clientX, event.clientY, true);
                        return;
                    }
                }
                if (gameMode) return;
                if (transformControls.dragging || editorTransformPointerActive) return;
                if (event.button !== 0) return;
                if (Math.hypot(event.clientX - downX, event.clientY - downY) > 5) return;
                const rect = renderer.domElement.getBoundingClientRect();
                pointer.set(
                    ((event.clientX - rect.left) / rect.width) * 2 - 1,
                    -((event.clientY - rect.top) / rect.height) * 2 + 1
                );
                raycaster.setFromCamera(pointer, camera);
                if (activeInterior) {
                    const zoneHit = raycaster.intersectObjects(activeInterior.model.pickables, false)[0];
                    if (zoneHit?.object.userData.interiorZone) {
                        showInteriorZone(zoneHit.object.userData.interiorZone);
                    }
                    return;
                }
                const hit = raycaster.intersectObjects(meshesToPick, false)[0];
                if (editorMode) {
                    if (wallCutMode) {
                        const hitGroup = hit?.object.userData.editRoot;
                        if (hitGroup !== selectedEditable) {
                            editorStatus.textContent = 'คลิกบนกำแพงที่เลือกเท่านั้น';
                            return;
                        }
                        const localPoint = selectedEditable.worldToLocal(hit.point.clone());
                        if (wallCutStart === null) {
                            wallCutStart = localPoint.x;
                            editorStatus.textContent = 'เลือกจุดเริ่มแล้ว · คลิกจุดสิ้นสุดของช่วงที่จะตัด';
                        } else {
                            cutSelectedWall(wallCutStart, localPoint.x);
                        }
                        return;
                    }
                    selectEditable(
                        hit?.object.userData.editRoot || null,
                        event.shiftKey || event.ctrlKey || event.metaKey
                    );
                    return;
                }
                const buildingId = [...buildingGroupById].find(([, group]) => {
                    let node = hit?.object;
                    while (node) {
                        if (node === group) return true;
                        node = node.parent;
                    }
                    return false;
                })?.[0];
                if (buildingId && openInterior(buildingId)) return;
                if (hit?.object.userData.info) {
                    const info = hit.object.userData.info;
                    document.getElementById('info-title').textContent = info.title;
                    document.getElementById('info-text').textContent = info.description;
                }
            });

            renderer.domElement.addEventListener('pointercancel', event => {
                if (gameMouseLook && event.pointerId === gameMouseLook.pointerId) {
                    gameMouseLook = null;
                    return;
                }
                if (gameTouchLook && event.pointerId === gameTouchLook.pointerId) {
                    gameTouchLook = null;
                    return;
                }
                if (gameMode) {
                    playerKeys.Mouse0 = false;
                    return;
                }
                if (!editorBoxSelection || event.pointerId !== editorBoxSelection.pointerId) return;
                editorBoxSelection = null;
                editorMarquee.style.display = 'none';
                controls.enabled = !gameMode && !overlayEnabled;
            });

            renderer.domElement.addEventListener('contextmenu', event => {
                if (gameMode) event.preventDefault();
            });

            window.addEventListener('resize', () => {
                const viewportSize = getViewportSize();
                const aspect = viewportSize.width / viewportSize.height;
                perspectiveCamera.aspect = aspect;
                perspectiveCamera.updateProjectionMatrix();
                fitTopCamera(views.top);
                renderQuality.resize(viewportSize.width, viewportSize.height, innerWidth < 700);
                renderer.setSize(viewportSize.width, viewportSize.height, false);
                renderer.shadowMap.needsUpdate = true;
                document.getElementById('game-pad').classList.toggle('show', gameMode && innerWidth <= 900);
            });

            // ------------------------------------------------------------
            // Render loop
            // ------------------------------------------------------------
            const clock = new THREE.Clock();
            let shadowRefreshElapsed = 0;

            renderer.setAnimationLoop(() => {
                const frameSeconds = clock.getDelta();
                const dt = Math.min(frameSeconds, .05);
                if (!document.hidden) renderQuality.sample(frameSeconds);
                if (presentationShowState.active) {
                    updatePresentationShow(performance.now());
                } else if (transition) {
                    const t = Math.min((performance.now() - transition.time) / transition.duration, 1);
                    const ease = t * t * (3 - 2 * t);
                    camera.position.lerpVectors(
                        transition.fromPosition, transition.toPosition, ease
                    );
                    controls.target.lerpVectors(
                        transition.fromTarget, transition.toTarget, ease
                    );
                    perspectiveCamera.fov = THREE.MathUtils.lerp(
                        transition.fromFov, transition.toFov, ease
                    );
                    perspectiveCamera.updateProjectionMatrix();
                    if (t >= 1) transition = null;
                }
                anchoredBuildingLabels.forEach(({sprite, group, offset}) => {
                    sprite.visible = editableObjects.has(group.userData.editor.id);
                    if (sprite.visible) sprite.position.copy(group.localToWorld(offset.clone()));
                });
                updateActivity(dt);
                updateWeather(dt);
                updatePlayer(dt);
                shadowRefreshElapsed += frameSeconds;
                const shadowRefreshInterval = presentationShowState.active ? 1 / 10 : 1 / 30;
                if ((sun.castShadow || moon.castShadow) &&
                    shadowRefreshElapsed >= shadowRefreshInterval) {
                    renderer.shadowMap.needsUpdate = true;
                    shadowRefreshElapsed %= shadowRefreshInterval;
                } else if (!sun.castShadow && !moon.castShadow) shadowRefreshElapsed = 0;
                if (!gameMode) controls.update(dt);
                renderer.render(scene, camera);
            });

            loading.style.opacity = '0';
            setTimeout(() => loading.remove(), 550);

        } catch (error) {
            console.error(error);
            document.getElementById('load-message').textContent =
                'เปิดแบบจำลองไม่สำเร็จ กรุณาใช้เบราว์เซอร์ที่รองรับ WebGL และตรวจสอบอินเทอร์เน็ต';
            const spinner = document.querySelector('.spinner');
            if (spinner) spinner.style.display = 'none';
        }
