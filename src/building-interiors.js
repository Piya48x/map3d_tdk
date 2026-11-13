// Presentation data only. These rooms do not become editor objects or alter the locked layout.
// Rectangles use local footprint coordinates: u left-to-right, v rear-to-entrance.
const zone = (id, name, kind, rect, detail) => ({ id, name, kind, rect, detail });

export const BUILDING_INTERIORS = Object.freeze({
    main_office: {
        title: 'Main Office', subtitle: 'ศูนย์บริหารและประสานงานของโรงงาน',
        zones: [
            zone('main-office', 'Main Office', 'office', [.05, .06, .58, .56], 'พื้นที่สำนักงานหลักสำหรับการบริหารและประสานงาน'),
            zone('md-room', 'MD', 'office', [.66, .06, .29, .25], 'ห้องทำงานผู้บริหาร Managing Director'),
            zone('meeting-1', 'Meeting Room 1', 'meeting', [.66, .34, .29, .22], 'ห้องประชุมสำหรับทีมงานและการติดตามงาน'),
            zone('meeting-2', 'Meeting Room 2', 'meeting', [.05, .65, .44, .29], 'ห้องประชุมสำหรับการประชุมร่วมหลายฝ่าย'),
            zone('restrooms', 'ห้องน้ำ', 'service', [.52, .65, .43, .29], 'ห้องน้ำภายในอาคาร Main Office')
        ]
    },
    canteen: {
        title: 'DIE-SET', subtitle: 'ศูนย์เตรียมแม่พิมพ์ คุณภาพ และงานซ่อมบำรุง',
        zones: [
            zone('die-set', 'DIE-SET Area', 'service', [.05, .06, .56, .48], 'พื้นที่หลักสำหรับเตรียมและจัดการชุดแม่พิมพ์'),
            zone('pd-team', 'Office PD Team', 'office', [.64, .06, .31, .22], 'สำนักงานทีม Product Development'),
            zone('spare-room', 'Spare Room', 'storage', [.64, .31, .31, .23], 'พื้นที่จัดเก็บอะไหล่และอุปกรณ์สำรอง'),
            zone('qc-area', 'QC Area', 'service', [.05, .58, .28, .36], 'พื้นที่ตรวจสอบคุณภาพก่อนส่งต่อกระบวนการผลิต'),
            zone('maintenance', 'Maintenance', 'service', [.36, .58, .30, .36], 'พื้นที่สนับสนุนงานซ่อมบำรุงแม่พิมพ์และเครื่องมือ'),
            zone('restrooms', 'ห้องน้ำ', 'service', [.69, .58, .26, .36], 'ห้องน้ำภายในพื้นที่ DIE-SET')
        ]
    },
    doke1_west: {
        title: 'Production Area 1 · Zone 1', subtitle: 'สายการผลิตหลักและระบบสนับสนุนกระบวนการ',
        zones: [
            zone('tap-line', 'Tap-Line', 'line', [.05, .06, .42, .18], 'สายการผลิต Tap-Line'),
            zone('spot-line', 'Spot-Line', 'line', [.50, .06, .45, .18], 'สายการผลิต Spot-Line'),
            zone('a-j-line', 'A-J Line', 'line', [.05, .27, .90, .31], 'กลุ่มสายการผลิตต่อเนื่อง A ถึง J'),
            zone('mdb', 'MDB', 'service', [.05, .62, .20, .32], 'ระบบจ่ายไฟฟ้าหลักสำหรับพื้นที่ผลิต'),
            zone('air', 'AIR', 'service', [.28, .62, .18, .32], 'ระบบลมอัดสนับสนุนเครื่องจักร'),
            zone('qc-area', 'QC Area', 'service', [.49, .62, .27, .32], 'พื้นที่ตรวจสอบคุณภาพระหว่างกระบวนการ'),
            zone('restrooms', 'ห้องน้ำ', 'service', [.79, .62, .16, .32], 'ห้องน้ำประจำ Production Area 1')
        ]
    },
    doke1_store: {
        title: 'Store', subtitle: 'คลังวัตถุดิบ การประกอบ และกระบวนการ Coating 1',
        zones: [
            zone('store', 'Store', 'storage', [.05, .06, .40, .50], 'พื้นที่จัดเก็บวัตถุดิบและชิ้นงานหลัก'),
            zone('store-office', 'Office (Store)', 'office', [.05, .59, .40, .35], 'สำนักงานควบคุมและบริหารงานคลัง'),
            zone('rear-frame', 'Assy Rear frame', 'line', [.48, .06, .47, .18], 'พื้นที่ประกอบ Rear frame'),
            zone('coating-1', 'Coating 1', 'coating', [.48, .27, .47, .22], 'กระบวนการเคลือบผิว Coating 1'),
            zone('powder', 'Powder', 'service', [.48, .52, .20, .42], 'พื้นที่จัดการและเตรียมวัสดุ Powder'),
            zone('shower', 'Shower', 'service', [.71, .52, .11, .42], 'ห้องอาบน้ำสำหรับพนักงานในพื้นที่กระบวนการ'),
            zone('restrooms', 'ห้องน้ำ', 'service', [.85, .52, .10, .42], 'ห้องน้ำภายในอาคาร Store')
        ]
    },
    doke2_assy: {
        title: 'K-Line & Coating 2 · Zone 2', subtitle: 'การผลิต การเคลือบผิว และระบบสนับสนุนแบบบูรณาการ',
        zones: [
            zone('k-line', 'K-Line', 'line', [.05, .06, .58, .48], 'สายการผลิตหลัก K-Line'),
            zone('coating-2', 'Coating 2', 'coating', [.66, .06, .29, .48], 'กระบวนการเคลือบผิว Coating 2'),
            zone('banding-machine', 'Banding Machine', 'line', [.05, .58, .28, .36], 'พื้นที่เครื่อง Banding Machine'),
            zone('mdb', 'MDB', 'service', [.36, .58, .16, .36], 'ระบบจ่ายไฟฟ้าหลักของ Zone 2'),
            zone('air', 'AIR', 'service', [.55, .58, .16, .36], 'ระบบลมอัดสนับสนุนการผลิต'),
            zone('restrooms', 'ห้องน้ำ', 'service', [.74, .58, .21, .36], 'ห้องน้ำประจำ Zone 2')
        ]
    },
    rack_dome: {
        title: 'โดมเก็บแร็ค', subtitle: 'พื้นที่จัดเก็บ จัดเตรียม และหมุนเวียนแร็คสำหรับสนับสนุนการผลิต',
        zones: [
            zone('rack-storage', 'พื้นที่จัดเก็บแร็ค', 'storage', [.05, .06, .58, .52], 'พื้นที่หลักสำหรับจัดเก็บแร็คอย่างเป็นหมวดหมู่'),
            zone('rack-staging', 'จุดรับ-จ่ายแร็ค', 'storage', [.66, .06, .29, .24], 'จุดเตรียมแร็คก่อนรับเข้าและส่งต่อไปยังพื้นที่ผลิต'),
            zone('material-handling', 'ทางเดินขนย้าย', 'service', [.66, .33, .29, .25], 'เส้นทางสำหรับรถขนย้ายและการหมุนเวียนแร็คอย่างปลอดภัย'),
            zone('reserve-area', 'พื้นที่แร็คสำรอง', 'storage', [.05, .62, .43, .32], 'พื้นที่สำรองเพื่อรองรับความต้องการของกระบวนการผลิต'),
            zone('air', 'AIR', 'service', [.51, .62, .44, .32], 'ระบบลมอัดสนับสนุนการปฏิบัติงานภายในโดม')
        ]
    }
});

export const EXECUTIVE_TOUR_STOPS = Object.freeze([
    Object.freeze({
        buildingId: 'main_office', category: 'MANAGEMENT & COLLABORATION',
        title: 'Main Office',
        description: 'ศูนย์กลางการบริหาร การตัดสินใจ และการประสานงานของทั้งโรงงาน',
        value: 'เชื่อมผู้บริหาร ทีมงาน และการประชุมสำคัญไว้ในพื้นที่เดียว',
        cameraSide: -.24, cameraElevation: .32, textPlacement: 'bottom-left'
    }),
    Object.freeze({
        buildingId: 'canteen', category: 'TOOLING READINESS',
        title: 'DIE-SET',
        description: 'ศูนย์เตรียมแม่พิมพ์ ควบคุมคุณภาพ และสนับสนุนงานซ่อมบำรุง',
        value: 'ช่วยให้เครื่องมือและแม่พิมพ์พร้อมใช้งานก่อนเข้าสู่กระบวนการผลิต',
        cameraSide: .24, cameraElevation: .42, textPlacement: 'bottom-right'
    }),
    Object.freeze({
        buildingId: 'doke1_west', category: 'CORE PRODUCTION',
        title: 'Production Area 1 · Zone 1',
        description: 'พื้นที่สายการผลิตหลัก ตั้งแต่ Tap-Line, Spot-Line จนถึงกลุ่ม A-J Line',
        value: 'รวมการผลิต ระบบไฟฟ้า ลมอัด และ QC เพื่อให้กระบวนการไหลต่อเนื่อง',
        cameraSide: -.2, cameraElevation: .72, cameraDistance: 1.08, cameraFov: 43,
        textPlacement: 'bottom-left'
    }),
    Object.freeze({
        buildingId: 'doke1_store', category: 'STORE & MATERIAL FLOW',
        title: 'Store',
        description: 'ศูนย์จัดเก็บวัตถุดิบ ควบคุมสต็อก และเชื่อมต่อการประกอบกับ Coating 1',
        value: 'สนับสนุนการไหลของวัสดุตั้งแต่รับเข้า จัดเก็บ จนถึงส่งต่อการผลิต',
        cameraSide: .2, cameraElevation: .76, cameraDistance: 1.1, cameraFov: 43,
        textPlacement: 'bottom-right'
    }),
    Object.freeze({
        buildingId: 'doke2_assy', category: 'INTEGRATED PROCESS',
        title: 'K-Line & Coating 2 · Zone 2',
        description: 'พื้นที่ K-Line, Coating 2 และ Banding Machine พร้อมระบบสนับสนุน',
        value: 'รวมหลายกระบวนการสำคัญไว้ในโซนเดียวเพื่อลดการเคลื่อนย้ายระหว่างงาน',
        cameraSide: -.2, cameraElevation: .72, cameraDistance: 1.08, cameraFov: 43,
        textPlacement: 'bottom-left'
    }),
    Object.freeze({
        buildingId: 'rack_dome', category: 'RACK STORAGE & LOGISTICS',
        title: 'โดมเก็บแร็ค',
        description: 'พื้นที่จัดเก็บ จัดเตรียม และหมุนเวียนแร็ค เพื่อสนับสนุนการไหลของวัสดุภายในโรงงาน',
        value: 'ช่วยให้แร็คพร้อมใช้งาน ลดเวลาค้นหา และส่งต่อเข้าสู่กระบวนการผลิตได้เป็นระบบ',
        cameraSide: .18, cameraElevation: .46, textPlacement: 'bottom-right'
    })
]);

const COLORS = {
    office: { floor: 0xe0eff9, accent: 0x2886bd, equipment: 0x537e9a },
    meeting: { floor: 0xd9e4f5, accent: 0x6565b5, equipment: 0x697c9d },
    dining: { floor: 0xf5ead5, accent: 0xcf9045, equipment: 0xa57648 },
    service: { floor: 0xe0eee6, accent: 0x419276, equipment: 0x638578 },
    storage: { floor: 0xe4e8ee, accent: 0x637d9e, equipment: 0x60748a },
    line: { floor: 0xe3f1e4, accent: 0x389c60, equipment: 0x517a6b },
    coating: { floor: 0xf5e8df, accent: 0xd27a51, equipment: 0x8d6659 }
};

export function createBuildingInterior(THREE, building, scale) {
    const plan = BUILDING_INTERIORS[building.id];
    if (!plan) return null;
    const w = building.size.width * scale;
    const d = building.size.depth * scale;
    const root = new THREE.Group();
    root.name = `Interior presentation · ${building.id}`;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const materials = new Map();
    const textures = [];
    const pickables = [];
    const highlights = new Map();
    const mat = (color, roughness = .78) => {
        const key = `${color}-${roughness}`;
        if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
        return materials.get(key);
    };
    const box = (parent, x, y, z, width, height, depth, material) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.scale.set(width, height, depth);
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
    };
    const floorY = .55;
    box(root, 0, .15, 0, w + .9, .3, d + .9, mat(0x173950));
    const circulationColor = building.id === 'main_office' || building.id === 'canteen'
        ? 0xeaf0f1 : 0x8bc89a;
    box(root, 0, .38, 0, w, .16, d, mat(circulationColor));
    // A low edge keeps the cutaway readable while leaving every zone visible.
    for (const side of [-1, 1]) {
        box(root, side * w / 2, 1.22, 0, .22, 1.42, d, mat(0xb8cbd4));
        box(root, 0, 1.22, side * d / 2, w, 1.42, .22, mat(0xb8cbd4));
    }
    const label = (name, width, height) => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 512, 128);
        ctx.fillStyle = '#16354a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `700 ${name.length > 17 ? 31 : 40}px Arial, sans-serif`;
        ctx.fillText(name, 256, 66, 480);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        textures.push(texture);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
            new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        mesh.rotation.x = -Math.PI / 2;
        return mesh;
    };
    plan.zones.forEach((item, index) => {
        const [u, v, uw, vd] = item.rect;
        const zw = w * uw;
        const zd = d * vd;
        const x = -w / 2 + w * (u + uw / 2);
        const z = -d / 2 + d * (v + vd / 2);
        const palette = COLORS[item.kind];
        const zoneGroup = new THREE.Group();
        zoneGroup.name = `Interior zone · ${item.id}`;
        zoneGroup.userData.interiorZone = item.id;
        zoneGroup.position.set(x, 0, z);
        root.add(zoneGroup);
        const tile = box(zoneGroup, 0, floorY, 0, zw - .16, .12, zd - .16, mat(palette.floor));
        tile.userData.interiorZone = item.id;
        pickables.push(tile);
        const highlight = box(zoneGroup, 0, floorY + .08, 0, zw - .3, .055, zd - .3, mat(palette.accent));
        highlight.visible = false;
        highlights.set(item.id, highlight);
        const edge = .09;
        for (const side of [-1, 1]) {
            box(zoneGroup, side * (zw / 2 - edge), .66, 0, edge, .2, zd, mat(palette.accent));
            box(zoneGroup, 0, .66, side * (zd / 2 - edge), zw, .2, edge, mat(palette.accent));
        }
        const labelMesh = label(item.name, Math.min(zw * .84, 14), Math.min(zd * .28, 3.1));
        labelMesh.position.set(0, .79, -zd * .28);
        zoneGroup.add(labelMesh);
        // Distinct silhouettes help visitors read the purpose of each area at a glance.
        const equipment = mat(palette.equipment);
        const metal = mat(0xc6d7de, .45);
        const dark = mat(0x304b5d);
        const count = Math.max(2, Math.min(8, Math.floor(zw / 3.8)));
        const step = (zw - 1.8) / count;
        if (item.kind === 'storage') {
            const rows = zd > 9 ? [-zd * .14, zd * .18] : [zd * .1];
            for (const row of rows) {
                for (let i = 0; i < count; i++) {
                    const px = (i - (count - 1) / 2) * step;
                    box(zoneGroup, px, 1.05, row, Math.max(.48, step * .7), .65,
                        Math.min(1.35, zd * .18), equipment);
                    box(zoneGroup, px, 1.42, row, Math.max(.48, step * .72), .08,
                        Math.min(1.4, zd * .19), metal);
                    box(zoneGroup, px, 1.72, row, Math.max(.48, step * .55), .47,
                        Math.min(1.1, zd * .14), i % 2 ? equipment : mat(0x8cabb9));
                }
            }
        } else if (item.kind === 'line') {
            const beltDepth = Math.min(1.4, zd * .2);
            box(zoneGroup, 0, .98, zd * .13, zw * .78, .28, beltDepth, dark);
            box(zoneGroup, 0, 1.16, zd * .13, zw * .76, .06, beltDepth * .78, metal);
            for (let i = 0; i < count; i++) {
                const px = (i - (count - 1) / 2) * step;
                box(zoneGroup, px, 1.05, zd * .13 - beltDepth * .7, Math.max(.4, step * .56), .72,
                    Math.min(1.1, zd * .13), equipment);
                box(zoneGroup, px, 1.42, zd * .13 - beltDepth * .7, Math.max(.4, step * .48), .06,
                    Math.min(1.1, zd * .13), metal);
                box(zoneGroup, px, .77, zd * .13 + beltDepth * .78, .16, .26, .16, mat(0xf2bd52));
            }
        } else if (item.kind === 'coating') {
            const depth = Math.min(zd * .42, 5.2);
            box(zoneGroup, 0, .97, zd * .12, zw * .78, .54, depth, equipment);
            box(zoneGroup, 0, 1.29, zd * .12, zw * .8, .12, depth * .72, metal);
            for (let i = 0; i < count; i++) {
                const px = (i - (count - 1) / 2) * step;
                box(zoneGroup, px, 1.38, zd * .12, .18, .07, depth * .7, mat(0xe7a16f));
            }
            box(zoneGroup, 0, .72, zd * .12 + depth * .62, zw * .7, .07, .1, mat(0xd27a51));
        } else if (item.kind === 'dining') {
            const columns = Math.min(5, count);
            for (let i = 0; i < columns; i++) {
                const px = (i - (columns - 1) / 2) * ((zw - 1.8) / columns);
                for (const row of (zd > 9 ? [-zd * .06, zd * .24] : [zd * .12])) {
                    box(zoneGroup, px, .94, row, Math.max(.7, step * .52), .12, 1.15, equipment);
                    for (const side of [-1, 1]) box(zoneGroup, px, .73, row + side * .86,
                        Math.max(.65, step * .45), .2, .28, metal);
                }
            }
        } else if (item.kind === 'meeting') {
            box(zoneGroup, 0, .95, zd * .12, zw * .62, .14, Math.min(1.8, zd * .27), equipment);
            for (let i = 0; i < Math.min(6, count + 2); i++) {
                const px = (i - (Math.min(6, count + 2) - 1) / 2) * (zw * .58 / Math.min(6, count + 2));
                for (const side of [-1, 1]) box(zoneGroup, px, .78, zd * .12 + side * Math.min(1.4, zd * .2),
                    .45, .36, .48, metal);
            }
        } else if (item.kind === 'office') {
            for (let i = 0; i < count; i++) {
                const px = (i - (count - 1) / 2) * step;
                const row = zd * .12 + (i % 2) * .25;
                box(zoneGroup, px, .93, row, Math.max(.55, step * .63), .13, Math.min(1.05, zd * .16), equipment);
                box(zoneGroup, px, 1.17, row - .22, .52, .34, .08, dark);
                box(zoneGroup, px, .76, row + .78, .46, .3, .42, metal);
            }
        } else {
            box(zoneGroup, 0, .94, zd * .14, zw * .7, .42, Math.min(1.7, zd * .25), equipment);
            box(zoneGroup, 0, 1.19, zd * .14, zw * .72, .08, Math.min(1.8, zd * .26), metal);
        }
        if (index % 2 === 0 && zd > 8) box(zoneGroup, 0, .7, zd * .32, zw * .62, .06, .08, mat(0xffffff));
    });
    return {
        root, plan, pickables,
        setSelected(id) { highlights.forEach((mesh, key) => { mesh.visible = key === id; }); },
        dispose() {
            root.traverse(object => {
                if (object.geometry && object.geometry !== geometry) object.geometry.dispose();
                if (object.material && ![...materials.values()].includes(object.material)) object.material.dispose();
            });
            geometry.dispose();
            materials.forEach(material => material.dispose());
            textures.forEach(texture => texture.dispose());
        }
    };
}
