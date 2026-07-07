import type { CampusBuilding, NavNode, NavEdge, LatLng } from "./types";

export const CAMPUS_CENTER = { lat: 11.81802, lng: 122.17081 };

export const MOCK_BUILDINGS: CampusBuilding[] = [
  {
    id: "admin",
    name: "Administration Building",
    code: "ADMIN",
    description: "Main administration building",
    center: { lat: 11.81835, lng: 122.1705 },
    outline: [
      { lat: 11.81845, lng: 122.17038 },
      { lat: 11.81825, lng: 122.17038 },
      { lat: 11.81825, lng: 122.17062 },
      { lat: 11.81845, lng: 122.17062 },
    ],
    floors: 3,
    color: "#3B82F6",
  },
  {
    id: "lib",
    name: "Learning Resource Center",
    code: "LRC",
    description: "Library and learning center",
    center: { lat: 11.81845, lng: 122.17105 },
    outline: [
      { lat: 11.81855, lng: 122.17095 },
      { lat: 11.81835, lng: 122.17095 },
      { lat: 11.81835, lng: 122.17115 },
      { lat: 11.81855, lng: 122.17115 },
    ],
    floors: 2,
    color: "#8B5CF6",
  },
  {
    id: "sci",
    name: "Science Laboratory",
    code: "SCI",
    description: "Science laboratory building",
    center: { lat: 11.81775, lng: 122.1703 },
    outline: [
      { lat: 11.81785, lng: 122.1702 },
      { lat: 11.81765, lng: 122.1702 },
      { lat: 11.81765, lng: 122.1704 },
      { lat: 11.81785, lng: 122.1704 },
    ],
    floors: 2,
    color: "#10B981",
  },
  {
    id: "cas",
    name: "College of Arts & Sciences",
    code: "CAS",
    description: "College of Arts and Sciences",
    center: { lat: 11.8175, lng: 122.1705 },
    outline: [
      { lat: 11.8176, lng: 122.17038 },
      { lat: 11.81735, lng: 122.17038 },
      { lat: 11.81735, lng: 122.17062 },
      { lat: 11.8176, lng: 122.17062 },
    ],
    floors: 3,
    color: "#F59E0B",
  },
  {
    id: "coe",
    name: "College of Engineering",
    code: "COE",
    description: "College of Engineering building",
    center: { lat: 11.81705, lng: 122.1705 },
    outline: [
      { lat: 11.81715, lng: 122.17038 },
      { lat: 11.8169, lng: 122.17038 },
      { lat: 11.8169, lng: 122.17062 },
      { lat: 11.81715, lng: 122.17062 },
    ],
    floors: 3,
    color: "#EF4444",
  },
  {
    id: "gym",
    name: "Gymnasium",
    code: "GYM",
    description: "University gymnasium",
    center: { lat: 11.8172, lng: 122.1715 },
    outline: [
      { lat: 11.8173, lng: 122.1714 },
      { lat: 11.8171, lng: 122.1714 },
      { lat: 11.8171, lng: 122.1716 },
      { lat: 11.8173, lng: 122.1716 },
    ],
    floors: 1,
    color: "#06B6D4",
  },
  {
    id: "sc",
    name: "Student Center",
    code: "SC",
    description: "Student center building",
    center: { lat: 11.8170, lng: 122.1720 },
    outline: [
      { lat: 11.8171, lng: 122.1719 },
      { lat: 11.8169, lng: 122.1719 },
      { lat: 11.8169, lng: 122.1721 },
      { lat: 11.8171, lng: 122.1721 },
    ],
    floors: 2,
    color: "#F97316",
  },
  {
    id: "chapel",
    name: "Chapel",
    code: "CHP",
    description: "University chapel",
    center: { lat: 11.8177, lng: 122.1715 },
    outline: [
      { lat: 11.8178, lng: 122.17142 },
      { lat: 11.8176, lng: 122.17142 },
      { lat: 11.8176, lng: 122.17158 },
      { lat: 11.8178, lng: 122.17158 },
    ],
    floors: 1,
    color: "#EC4899",
  },
  {
    id: "tourism",
    name: "College of Hospitality & Tourism",
    code: "TOUR",
    description: "Hospitality and tourism college",
    center: { lat: 11.818639, lng: 122.172651 },
    outline: [
      { lat: 11.81872, lng: 122.17251 },
      { lat: 11.81856, lng: 122.17251 },
      { lat: 11.81856, lng: 122.17279 },
      { lat: 11.81872, lng: 122.17279 },
    ],
    floors: 2,
    color: "#D946EF",
  },
];

export const MOCK_NODES: NavNode[] = [
  { id: "N001", name: "Admin Entrance", type: "building_entrance", buildingId: "admin", floor: 1, position: { lat: 11.81835, lng: 122.1705 }, hasQr: true, hasPanorama: true },
  { id: "N002", name: "Library Entrance", type: "building_entrance", buildingId: "lib", floor: 1, position: { lat: 11.81845, lng: 122.17105 }, hasQr: true, hasPanorama: true },
  { id: "N003", name: "Science Lab Entrance", type: "building_entrance", buildingId: "sci", floor: 1, position: { lat: 11.81775, lng: 122.1703 }, hasQr: false, hasPanorama: false },
  { id: "N004", name: "CAS Entrance", type: "building_entrance", buildingId: "cas", floor: 1, position: { lat: 11.8175, lng: 122.1705 }, hasQr: true, hasPanorama: false },
  { id: "N005", name: "COE Entrance", type: "building_entrance", buildingId: "coe", floor: 1, position: { lat: 11.81705, lng: 122.1705 }, hasQr: true, hasPanorama: true },
  { id: "N006", name: "Gymnasium Entrance", type: "building_entrance", buildingId: "gym", floor: 1, position: { lat: 11.8172, lng: 122.1715 }, hasQr: false, hasPanorama: false },
  { id: "N007", name: "Student Center Entrance", type: "building_entrance", buildingId: "sc", floor: 1, position: { lat: 11.8170, lng: 122.1720 }, hasQr: true, hasPanorama: true },
  { id: "N008", name: "Chapel Entrance", type: "building_entrance", buildingId: "chapel", floor: 1, position: { lat: 11.8177, lng: 122.1715 }, hasQr: false, hasPanorama: false },
  { id: "N009", name: "NW Junction", type: "intersection", buildingId: null, floor: 0, position: { lat: 11.8180, lng: 122.1704 }, hasQr: false, hasPanorama: false },
  { id: "N010", name: "NE Junction", type: "intersection", buildingId: null, floor: 0, position: { lat: 11.8180, lng: 122.1710 }, hasQr: false, hasPanorama: false },
  { id: "N011", name: "Main Plaza", type: "intersection", buildingId: null, floor: 0, position: { lat: 11.8177, lng: 122.1708 }, hasQr: true, hasPanorama: true },
  { id: "N012", name: "SW Junction", type: "intersection", buildingId: null, floor: 0, position: { lat: 11.8173, lng: 122.1705 }, hasQr: false, hasPanorama: false },
  { id: "N013", name: "SE Junction", type: "intersection", buildingId: null, floor: 0, position: { lat: 11.8173, lng: 122.1712 }, hasQr: false, hasPanorama: false },
  { id: "N014", name: "South Gate", type: "outdoor", buildingId: null, floor: 0, position: { lat: 11.8167, lng: 122.1708 }, hasQr: true, hasPanorama: false },
  { id: "N015", name: "West Entry", type: "outdoor", buildingId: null, floor: 0, position: { lat: 11.8180, lng: 122.1700 }, hasQr: false, hasPanorama: false },
  { id: "N016", name: "Tourism Building Entrance", type: "building_entrance", buildingId: "tourism", floor: 1, position: { lat: 11.818639, lng: 122.172651 }, hasQr: true, hasPanorama: false },
];

export function calcDistance(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const aVal =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
}

export const MOCK_EDGES: NavEdge[] = [
  { id: "E001", from: "N001", to: "N010", type: "walkway", distance: calcDistance(MOCK_NODES[0].latlng, MOCK_NODES[9].latlng) },
  { id: "E002", from: "N002", to: "N009", type: "walkway", distance: calcDistance(MOCK_NODES[1].latlng, MOCK_NODES[8].latlng) },
  { id: "E003", from: "N002", to: "N010", type: "walkway", distance: calcDistance(MOCK_NODES[1].latlng, MOCK_NODES[9].latlng) },
  { id: "E004", from: "N003", to: "N009", type: "walkway", distance: calcDistance(MOCK_NODES[2].latlng, MOCK_NODES[8].latlng) },
  { id: "E005", from: "N009", to: "N010", type: "walkway", distance: calcDistance(MOCK_NODES[8].latlng, MOCK_NODES[9].latlng) },
  { id: "E006", from: "N009", to: "N011", type: "walkway", distance: calcDistance(MOCK_NODES[8].latlng, MOCK_NODES[10].latlng) },
  { id: "E007", from: "N010", to: "N011", type: "walkway", distance: calcDistance(MOCK_NODES[9].latlng, MOCK_NODES[10].latlng) },
  { id: "E008", from: "N011", to: "N008", type: "walkway", distance: calcDistance(MOCK_NODES[10].latlng, MOCK_NODES[7].latlng) },
  { id: "E009", from: "N004", to: "N012", type: "walkway", distance: calcDistance(MOCK_NODES[3].latlng, MOCK_NODES[11].latlng) },
  { id: "E010", from: "N012", to: "N011", type: "walkway", distance: calcDistance(MOCK_NODES[11].latlng, MOCK_NODES[10].latlng) },
  { id: "E011", from: "N013", to: "N011", type: "walkway", distance: calcDistance(MOCK_NODES[12].latlng, MOCK_NODES[10].latlng) },
  { id: "E012", from: "N005", to: "N012", type: "walkway", distance: calcDistance(MOCK_NODES[4].latlng, MOCK_NODES[11].latlng) },
  { id: "E013", from: "N006", to: "N013", type: "walkway", distance: calcDistance(MOCK_NODES[5].latlng, MOCK_NODES[12].latlng) },
  { id: "E014", from: "N007", to: "N013", type: "walkway", distance: calcDistance(MOCK_NODES[6].latlng, MOCK_NODES[12].latlng) },
  { id: "E015", from: "N012", to: "N013", type: "walkway", distance: calcDistance(MOCK_NODES[11].latlng, MOCK_NODES[12].latlng) },
  { id: "E016", from: "N005", to: "N006", type: "walkway", distance: calcDistance(MOCK_NODES[4].latlng, MOCK_NODES[5].latlng) },
  { id: "E017", from: "N006", to: "N007", type: "walkway", distance: calcDistance(MOCK_NODES[5].latlng, MOCK_NODES[6].latlng) },
  { id: "E018", from: "N013", to: "N014", type: "walkway", distance: calcDistance(MOCK_NODES[12].latlng, MOCK_NODES[13].latlng) },
  { id: "E019", from: "N012", to: "N014", type: "walkway", distance: calcDistance(MOCK_NODES[11].latlng, MOCK_NODES[13].latlng) },
  { id: "E020", from: "N015", to: "N004", type: "walkway", distance: calcDistance(MOCK_NODES[14].latlng, MOCK_NODES[3].latlng) },
  { id: "E021", from: "N015", to: "N012", type: "walkway", distance: calcDistance(MOCK_NODES[14].latlng, MOCK_NODES[11].latlng) },
  { id: "E022", from: "N009", to: "N004", type: "walkway", distance: calcDistance(MOCK_NODES[8].latlng, MOCK_NODES[3].latlng) },
  { id: "E023", from: "N016", to: "N010", type: "walkway", distance: calcDistance(MOCK_NODES[15].latlng, MOCK_NODES[9].latlng) },
  { id: "E024", from: "N016", to: "N002", type: "walkway", distance: calcDistance(MOCK_NODES[15].latlng, MOCK_NODES[1].latlng) },
];

export const NODE_COLORS: Record<string, string> = {
  building_entrance: "#1C6BEB",
  intersection: "#06B6D4",
  staircase: "#10B981",
  elevator: "#8B5CF6",
  room: "#F59E0B",
  outdoor: "#64748B",
};

export function generateId(prefix: string, existing: string[]): string {
  let n = 1;
  while (existing.includes(`${prefix}${String(n).padStart(3, "0")}`)) n++;
  return `${prefix}${String(n).padStart(3, "0")}`;
}

export function latLngToPixel(
  latlng: { lat: number; lng: number },
  center: { lat: number; lng: number },
  scale: number
): { x: number; y: number } {
  const dLat = latlng.lat - center.lat;
  const dLng = latlng.lng - center.lng;
  const latM = dLat * 111320;
  const lngM = dLng * 111320 * Math.cos((center.lat * Math.PI) / 180);
  return { x: lngM * scale, y: -latM * scale };
}
