export interface LatLng {
  lat: number;
  lng: number;
  elevation?: number;
}

export interface NavNode {
  id: string;
  label: string;
  position: LatLng;
  floor: number;
  buildingId: string;
  campusId: string;
  type: 'room' | 'walkway' | 'stair' | 'elevator' | 'entrance' | 'qr_marker';
  componentId?: string;
  metadata?: Record<string, string>;
}

export interface NavEdge {
  id: string;
  from: string;
  to: string;
  distance: number;
  weight: number;
  type: 'walkway' | 'stair' | 'elevator' | 'hallway' | 'outdoor';
  campusId: string;
}

export interface Building {
  id: string;
  name: string;
  campusId: string;
  floors: number[];
  footprint: LatLng[];
  center: LatLng;
  baseElevation: number;
  height: number;
  color?: string;
  category?: string;
}

export interface FloorInfo {
  level: number;
  label: string;
  buildingId: string;
}

export interface MapComponent {
  id: string;
  type: 'room' | 'walkway' | 'stair' | 'elevator' | 'entrance';
  label: string;
  buildingId: string;
  campusId: string;
  floor: number;
  geometry: LatLng[];
  metadata?: Record<string, string>;
}

export interface GraphSnapshot {
  id: string;
  campusId: string;
  version: string;
  updatedAt: string;
  buildings: Building[];
  components: MapComponent[];
  nodes: NavNode[];
  edges: NavEdge[];
}

export interface PathResult {
  path: NavNode[];
  edges: NavEdge[];
  totalDistance: number;
  steps: PathStep[];
}

export interface PathStep {
  instruction: string;
  from: NavNode;
  to: NavNode;
  distance: number;
  type: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

export interface ValidationError {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface Campus {
  id: string;
  name: string;
  code: string;
  center: LatLng;
  bounds: { ne: LatLng; sw: LatLng };
}

// ---- Legacy types (used by existing committed code, to be migrated) ----

export type NodeType =
  | 'building_entrance'
  | 'intersection'
  | 'staircase'
  | 'elevator'
  | 'room'
  | 'outdoor'
  | 'corner'
  | 'waypoint';

export type EdgeType =
  | 'walk'
  | 'transition'
  | 'restricted'
  | 'walkway'
  | 'stairs'
  | 'corridor'
  | 'elevator'
  | 'ramp'
  | 'wall';

export type ComponentType =
  | 'room'
  | 'stair'
  | 'elevator'
  | 'hallway'
  | 'entrance'
  | 'restroom';

export interface Component {
  id: string;
  type: ComponentType;
  name: string;
  buildingId: string;
  floor: number;
  position: LatLng;
  polygon?: LatLng[];
  dimensions?: {
    width: number;
    height: number;
    rotation?: number;
  };
  connections?: string[];
  metadata?: Record<string, unknown>;
}

export interface TracePath {
  id: string;
  name?: string;
  buildingId?: string;
  campusId?: string;
  floor: number;
  points: LatLng[];
  type: 'hallway' | 'path';
  metadata?: Record<string, unknown>;
}

export interface FloorPlan {
  buildingId: string;
  floor: number;
  imageUrl: string;
  uploadedAt: string;
}

export interface DirEntry {
  id: string;
  label: string;
  type: 'building' | 'floor' | 'room' | 'entrance' | 'facility';
  nodeId?: string;
  children?: DirEntry[];
}
