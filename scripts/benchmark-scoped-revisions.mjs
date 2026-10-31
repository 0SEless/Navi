import { createHash } from 'node:crypto'

const countBytes = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8')
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

function makeBuilding(buildingIndex) {
  return {
    id: `building-${buildingIndex}`,
    name: `Synthetic Building ${buildingIndex}`,
    entranceNodeIds: [`node-${buildingIndex}-0`],
    floors: Array.from({ length: 5 }, (_, floorIndex) => ({
      id: `floor-${buildingIndex}-${floorIndex}`,
      level: floorIndex,
      rooms: Array.from({ length: 20 }, (_, roomIndex) => ({
        id: `room-${buildingIndex}-${floorIndex}-${roomIndex}`,
        name: `Room ${roomIndex}`,
        polygon: [[roomIndex, floorIndex], [roomIndex + 8, floorIndex], [roomIndex + 8, floorIndex + 6], [roomIndex, floorIndex + 6]],
        walls: Array.from({ length: 4 }, (_, wallIndex) => ({ id: `wall-${roomIndex}-${wallIndex}`, points: [[wallIndex, 0], [wallIndex + 1, 2]], doors: wallIndex === 0 ? [{ id: `door-${roomIndex}`, width: 0.9 }] : [] })),
      })),
      transitions: floorIndex < 4 ? [{ id: `stair-${buildingIndex}-${floorIndex}`, targetFloorId: `floor-${buildingIndex}-${floorIndex + 1}` }] : [],
    })),
  }
}

const campus = {
  campusId: 'synthetic-campus',
  revision: 120,
  settings: { name: 'Synthetic Campus', timezone: 'Asia/Manila', units: 'meters' },
  buildings: Array.from({ length: 12 }, (_, i) => makeBuilding(i)),
  routing: {
    nodes: Array.from({ length: 600 }, (_, i) => ({ id: `node-${i}`, x: i % 100, y: Math.floor(i / 100), buildingId: `building-${i % 12}`, floor: Math.floor(i / 120) })),
    edges: Array.from({ length: 720 }, (_, i) => ({ id: `edge-${i}`, from: `node-${i % 600}`, to: `node-${(i + 1) % 600}`, cost: 1, transition: i % 59 === 0 ? 'stair' : null })),
  },
  terrain: { activeVersion: null, horizontalCrs: null, verticalDatum: null },
}

const before = campus.buildings[3]
const after = structuredClone(before)
after.floors[2].rooms[5].walls[1].points[1][1] += 0.25
const operation = {
  operationVersion: 1,
  type: 'replace-scope',
  scope: { kind: 'building', id: before.id },
  beforeChecksum: hash(before),
  afterChecksum: hash(after),
  after,
}
const checkpoint = { format: 'campus-checkpoint-v1', revision: campus.revision, contentChecksum: hash(campus), snapshot: campus }
const dependencies = [4, 5, 6].map((i) => ({ kind: 'building', id: `building-${i}`, revision: 118 + i, contentChecksum: hash(campus.buildings[i]) }))
const oneScopeRequest = { campusId: campus.campusId, expectedCampusRevision: campus.revision, mutationId: 'synthetic-1', operation, dependencies: [] }
const threeScopeRequest = { ...oneScopeRequest, dependencies }

let previousState = before
const ops = Array.from({ length: 100 }, (_, i) => {
  const nextState = { ...after, syntheticSequence: i }
  const next = { ...operation, beforeChecksum: hash(previousState), afterChecksum: hash(nextState), after: nextState }
  previousState = nextState
  return next
})
const reconstructionSamples = []
for (let run = 0; run < 15; run += 1) {
  const start = performance.now()
  let reconstructed = structuredClone(campus)
  for (const op of ops) {
    const index = reconstructed.buildings.findIndex((building) => building.id === op.scope.id)
    if (hash(reconstructed.buildings[index]) !== op.beforeChecksum) throw new Error('before checksum mismatch during reconstruction')
    reconstructed.buildings[index] = op.after
    if (hash(reconstructed.buildings[index]) !== op.afterChecksum) throw new Error('after checksum mismatch during reconstruction')
  }
  if (!reconstructed.buildings.some((building) => building.id === before.id)) throw new Error('reconstruction lost target building')
  const elapsed = performance.now() - start
  if (run > 2) reconstructionSamples.push(elapsed)
}

console.log(JSON.stringify({
  fixture: { buildings: campus.buildings.length, floorsPerBuilding: 5, roomsPerFloor: 20, nodes: campus.routing.nodes.length, edges: campus.routing.edges.length, operationCount: ops.length },
  bytes: {
    legacyFullCampusRevision: countBytes(campus),
    compactSingleBuildingOperation: countBytes(operation),
    checkpoint: countBytes(checkpoint),
    checkpointEnvelopeOverhead: countBytes(checkpoint) - countBytes(campus),
    oneBuildingRequest: countBytes(oneScopeRequest),
    threeBuildingDependencyRequest: countBytes(threeScopeRequest),
    additionalTwoBuildingDependencies: countBytes(threeScopeRequest) - countBytes(oneScopeRequest),
  },
  reconstruction: { operations: ops.length, runs: reconstructionSamples.length, medianMs: Number(median(reconstructionSamples).toFixed(3)), includesCloneOfFullCampusCheckpoint: true },
}, null, 2))
