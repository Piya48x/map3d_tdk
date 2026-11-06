// Ground-level navigation for the presentation actors. All coordinates are
// render-space X/Z values; the editor layout remains the source of obstacles.
function segmentHitsBox(a, b, box, clearance) {
    const minX = box.minX - clearance, maxX = box.maxX + clearance;
    const minZ = box.minZ - clearance, maxZ = box.maxZ + clearance;
    let enter = 0, leave = 1;
    for (const [start, delta, min, max] of [
        [a.x, b.x - a.x, minX, maxX], [a.z, b.z - a.z, minZ, maxZ]
    ]) {
        if (Math.abs(delta) < 1e-9) {
            if (start < min || start > max) return false;
            continue;
        }
        const near = (min - start) / delta, far = (max - start) / delta;
        enter = Math.max(enter, Math.min(near, far));
        leave = Math.min(leave, Math.max(near, far));
        if (enter > leave) return false;
    }
    return true;
}

export function createActivityNavigator(bounds, obstacles, clearance, cellSize = 2) {
    const minX = bounds.minX + clearance, maxX = bounds.maxX - clearance;
    const minZ = bounds.rearZ + clearance, maxZ = bounds.entranceZ - clearance;
    const width = Math.ceil((maxX - minX) / cellSize);
    const height = Math.ceil((maxZ - minZ) / cellSize);
    const cells = new Uint8Array(width * height);
    const nearbyBoxes = Array.from({ length: width * height }, () => []);
    const point = (column, row) => ({
        x: minX + (column + .5) * cellSize,
        z: minZ + (row + .5) * cellSize
    });
    const inside = p => p.x >= minX && p.x <= maxX && p.z >= minZ && p.z <= maxZ;
    const blocked = p => !inside(p) || obstacles.some(box =>
        p.x >= box.minX - clearance && p.x <= box.maxX + clearance &&
        p.z >= box.minZ - clearance && p.z <= box.maxZ + clearance);
    const clear = (a, b) => inside(a) && inside(b) &&
        !obstacles.some(box => segmentHitsBox(a, b, box, clearance));

    for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
        const p = point(column, row);
        cells[row * width + column] = blocked(p) ? 1 : 0;
    }
    for (const box of obstacles) {
        const left = Math.max(0, Math.floor((box.minX - clearance - cellSize - minX) / cellSize));
        const right = Math.min(width - 1, Math.floor((box.maxX + clearance + cellSize - minX) / cellSize));
        const top = Math.max(0, Math.floor((box.minZ - clearance - cellSize - minZ) / cellSize));
        const bottom = Math.min(height - 1, Math.floor((box.maxZ + clearance + cellSize - minZ) / cellSize));
        for (let row = top; row <= bottom; row++) for (let column = left; column <= right; column++) {
            nearbyBoxes[row * width + column].push(box);
        }
    }
    function edgeClear(first, second) {
        const a = point(first % width, Math.floor(first / width));
        const b = point(second % width, Math.floor(second / width));
        return !nearbyBoxes[first].some(box => segmentHitsBox(a, b, box, clearance)) &&
            !nearbyBoxes[second].some(box => segmentHitsBox(a, b, box, clearance));
    }

    function project(p) {
        if (!blocked(p)) return { x: p.x, z: p.z };
        for (let radius = cellSize / 2; radius <= 35; radius += cellSize / 2) {
            const count = Math.max(16, Math.ceil(2 * Math.PI * radius / cellSize));
            for (let i = 0; i < count; i++) {
                const angle = i * 2 * Math.PI / count;
                const candidate = { x: p.x + Math.cos(angle) * radius,
                    z: p.z + Math.sin(angle) * radius };
                if (!blocked(candidate)) return candidate;
            }
        }
        return null;
    }

    function anchor(p) {
        const baseColumn = Math.floor((p.x - minX) / cellSize);
        const baseRow = Math.floor((p.z - minZ) / cellSize);
        let best = -1, bestDistance = Infinity;
        for (let radius = 0; radius <= 5; radius++) {
            for (let row = baseRow - radius; row <= baseRow + radius; row++) {
                for (let column = baseColumn - radius; column <= baseColumn + radius; column++) {
                    if (column < 0 || row < 0 || column >= width || row >= height) continue;
                    const index = row * width + column;
                    if (cells[index]) continue;
                    const candidate = point(column, row);
                    const distance = Math.hypot(candidate.x - p.x, candidate.z - p.z);
                    if (distance < bestDistance && clear(p, candidate)) {
                        best = index; bestDistance = distance;
                    }
                }
            }
            if (best !== -1) return best;
        }
        return -1;
    }

    function findPath(start, goal) {
        if (clear(start, goal)) return [start, goal];
        const first = anchor(start), last = anchor(goal);
        if (first < 0 || last < 0) return null;
        const count = width * height;
        const cost = new Float64Array(count).fill(Infinity);
        const previous = new Int32Array(count).fill(-1);
        const closed = new Uint8Array(count);
        const heap = [];
        const heuristic = index => Math.hypot(index % width - last % width,
            Math.floor(index / width) - Math.floor(last / width));
        function push(index, score) {
            let child = heap.length;
            heap.push({ index, score });
            while (child > 0) {
                const parent = Math.floor((child - 1) / 2);
                if (heap[parent].score <= score) break;
                heap[child] = heap[parent]; child = parent;
            }
            heap[child] = { index, score };
        }
        function pop() {
            const top = heap[0], tail = heap.pop();
            if (heap.length) {
                let parent = 0;
                while (parent * 2 + 1 < heap.length) {
                    let child = parent * 2 + 1;
                    if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++;
                    if (heap[child].score >= tail.score) break;
                    heap[parent] = heap[child]; parent = child;
                }
                heap[parent] = tail;
            }
            return top;
        }
        cost[first] = 0; push(first, heuristic(first));
        while (heap.length) {
            const current = pop().index;
            if (closed[current]) continue;
            if (current === last) break;
            closed[current] = 1;
            const column = current % width, row = Math.floor(current / width);
            for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dz) continue;
                const nextColumn = column + dx, nextRow = row + dz;
                if (nextColumn < 0 || nextRow < 0 || nextColumn >= width || nextRow >= height) continue;
                const next = nextRow * width + nextColumn;
                if (cells[next] || closed[next]) continue;
                if (dx && dz && (cells[row * width + nextColumn] || cells[nextRow * width + column])) continue;
                if (!edgeClear(current, next)) continue;
                const nextCost = cost[current] + Math.hypot(dx, dz);
                if (nextCost >= cost[next]) continue;
                cost[next] = nextCost; previous[next] = current;
                push(next, nextCost + heuristic(next));
            }
        }
        if (!Number.isFinite(cost[last])) return null;
        const steps = [];
        for (let index = last; index !== -1; index = previous[index]) {
            steps.push(point(index % width, Math.floor(index / width)));
        }
        steps.reverse();
        const raw = [start, ...steps, goal], simplified = [start];
        for (let i = 0; i < raw.length - 1;) {
            let next = raw.length - 1;
            while (next > i + 1 && !clear(raw[i], raw[next])) next--;
            simplified.push(raw[next]); i = next;
        }
        return simplified;
    }

    function buildLoop(points) {
        const stops = points.map(project).filter(Boolean);
        if (stops.length < 2) return null;
        const result = [stops[0]];
        for (let i = 1; i <= stops.length; i++) {
            const next = stops[i % stops.length];
            const section = findPath(result[result.length - 1], next);
            if (section) result.push(...section.slice(1));
        }
        if (!clear(result[result.length - 1], result[0])) return null;
        result.push(result[0]);
        const lengths = [0];
        for (let i = 1; i < result.length; i++) lengths.push(lengths[i - 1] +
            Math.hypot(result[i].x - result[i - 1].x, result[i].z - result[i - 1].z));
        return { points: result, lengths, total: lengths[lengths.length - 1] };
    }

    return { blocked, clear, buildLoop, project };
}

export function positionOnActivityLoop(loop, progress) {
    const distance = (((progress % 1) + 1) % 1) * loop.total;
    let low = 1, high = loop.lengths.length - 1;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (loop.lengths[middle] < distance) low = middle + 1;
        else high = middle;
    }
    const a = loop.points[low - 1], b = loop.points[low];
    const span = loop.lengths[low] - loop.lengths[low - 1];
    const t = span ? (distance - loop.lengths[low - 1]) / span : 0;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
        heading: Math.atan2(b.x - a.x, b.z - a.z) };
}
