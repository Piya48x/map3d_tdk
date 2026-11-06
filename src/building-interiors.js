// Presentation data only. These rooms do not become editor objects or alter the locked layout.
// Rectangles use local footprint coordinates: u left-to-right, v rear-to-entrance.
const zone = (id, name, kind, rect, detail) => ({ id, name, kind, rect, detail });

export const BUILDING_INTERIORS = Object.freeze({
    main_office: {
        title: 'Main Office', subtitle: 'สำนักงานหลัก',
        zones: [
            zone('reception', 'โถงต้อนรับ', 'office', [.08, .64, .84, .28], 'จุดต้อนรับและทางเข้าหลัก'),
            zone('open-office', 'สำนักงาน', 'office', [.08, .32, .84, .29], 'พื้นที่ทำงานของทีมสำนักงาน'),
            zone('ind', 'IND', 'office', [.08, .08, .26, .21], 'ส่วนงาน IND ตามผังอ้างอิง'),
            zone('meeting-1', 'Meeting Room 1', 'meeting', [.37, .08, .25, .21], 'ห้องประชุม 1'),
            zone('meeting-2', 'Meeting Room 2', 'meeting', [.65, .08, .27, .21], 'ห้องประชุม 2')
        ]
    },
    canteen: {
        title: 'Canteen', subtitle: 'โรงอาหารและส่วนสนับสนุน',
        zones: [
            zone('dining', 'Canteen', 'dining', [.07, .12, .58, .8], 'พื้นที่รับประทานอาหารตามภาพอ้างอิง'),
            zone('serving', 'จุดบริการอาหาร', 'service', [.69, .12, .24, .43], 'แนวเคาน์เตอร์บริการ'),
            zone('support-office', 'Office', 'office', [.69, .59, .24, .33], 'สำนักงานย่อยที่อยู่ติดกับ Canteen ในภาพ')
        ]
    },
    doke1_west: {
        title: 'Doke 1 · Production', subtitle: 'โซนผลิตด้านบน',
        zones: [
            zone('maintenance', 'Maintenance', 'service', [.08, .06, .38, .13], 'พื้นที่ซ่อมบำรุง'),
            zone('die-set', 'DIE-SET', 'service', [.08, .22, .38, .18], 'โซนจัดเตรียมแม่พิมพ์'),
            zone('top-line', 'Top-Line', 'line', [.51, .07, .41, .17], 'สายการผลิต Top-Line'),
            zone('spot-line', 'Spot-Line', 'line', [.51, .27, .41, .17], 'สายการผลิต Spot-Line'),
            zone('a-k-line', 'A-Line / K-Line', 'line', [.08, .46, .84, .2], 'สายการผลิต A-Line และ K-Line'),
            zone('c-line', 'C-Line', 'line', [.08, .69, .84, .23], 'สายการผลิต C-Line')
        ]
    },
    doke1_store: {
        title: 'Doke 1 · Store', subtitle: 'คลังและโซนผลิตต่อเนื่อง',
        zones: [
            zone('pd-team', 'Office PD Team', 'office', [.07, .07, .38, .14], 'สำนักงานทีม PD'),
            zone('spare', 'Spare Room', 'storage', [.5, .07, .43, .14], 'ห้องอะไหล่'),
            zone('h-line', 'H-Line / I-Line', 'line', [.07, .24, .86, .17], 'สายการผลิต H-Line และ I-Line'),
            zone('store', 'Store', 'storage', [.07, .44, .39, .46], 'พื้นที่จัดเก็บวัสดุและชิ้นงาน'),
            zone('rear-home', 'Assy Rear Home', 'line', [.5, .44, .43, .19], 'โซนประกอบ Assy Rear Home'),
            zone('coating-1', 'Coating 1', 'coating', [.5, .66, .43, .24], 'โซน Coating 1')
        ]
    },
    doke2_assy: {
        title: 'Doke 2 · Assembly', subtitle: 'K-Line, Coating 2 และ Assy Hanon',
        zones: [
            zone('k-line', 'K-Line', 'line', [.07, .08, .53, .47], 'สายการผลิต K-Line และเครื่องจักรตามผัง'),
            zone('coating-2', 'Coating 2', 'coating', [.64, .08, .29, .47], 'โซน Coating 2'),
            zone('assy-hanon', 'Assy Hanon', 'line', [.07, .59, .53, .31], 'โซนประกอบ Assy Hanon'),
            zone('hanon-store', 'Hanon Store', 'storage', [.64, .59, .29, .15], 'พื้นที่เก็บชิ้นงาน Hanon'),
            zone('maintenance-store', 'Maintenance Store', 'storage', [.64, .77, .29, .13], 'พื้นที่เก็บงานซ่อมบำรุง')
        ]
    },
    rack_dome: {
        title: 'Rack Dome', subtitle: 'พื้นที่จัดเก็บและเตรียมวัสดุ',
        zones: [
            zone('rack-a', 'Storage Rack A', 'storage', [.08, .09, .38, .38], 'แร็คจัดเก็บวัสดุฝั่ง A'),
            zone('rack-b', 'Storage Rack B', 'storage', [.54, .09, .38, .38], 'แร็คจัดเก็บวัสดุฝั่ง B'),
            zone('staging', 'Material Staging', 'service', [.08, .57, .84, .34], 'พื้นที่พักและเตรียมวัสดุ')
        ]
    }
});

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
        // Small schematic furniture makes each zone legible without creating a heavy scene.
        const count = Math.max(1, Math.min(8, Math.floor(zw / 3.8)));
        const equipmentWidth = Math.min(2.1, (zw - 1.5) / count * .7);
        const rowZ = zd > 5 ? zd * .13 : 0;
        for (let i = 0; i < count; i++) {
            const ex = (i - (count - 1) / 2) * ((zw - 1.5) / count);
            const ez = rowZ + (i % 2) * .28;
            const height = item.kind === 'storage' ? 1.1 : item.kind === 'line' || item.kind === 'coating' ? .62 : .38;
            box(zoneGroup, ex, .72 + height / 2, ez, Math.max(.45, equipmentWidth), height,
                Math.min(1.45, zd * .21), mat(palette.equipment));
            if (item.kind === 'storage') box(zoneGroup, ex, 1.36, ez, Math.max(.45, equipmentWidth), .08,
                Math.min(1.45, zd * .21), mat(0xc6d7de));
            if (item.kind === 'storage' && zd > 9) {
                box(zoneGroup, ex, 1.28, -zd * .16, Math.max(.45, equipmentWidth), 1.1,
                    Math.min(1.45, zd * .21), mat(palette.equipment));
                box(zoneGroup, ex, 1.36, -zd * .16, Math.max(.45, equipmentWidth), .08,
                    Math.min(1.45, zd * .21), mat(0xc6d7de));
            }
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
