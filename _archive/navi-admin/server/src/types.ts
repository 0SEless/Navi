export interface LatLng {
  lat: number;
  lng: number;
}

export type NodeType =
  | "building_entrance"
  | "intersection"
  | "staircase"
  | "elevator"
  | "room"
  | "outdoor"
  | "corner"
  | "waypoint";

export type EdgeType =
  | "walkway"
  | "stairs"
  | "corridor"
  | "elevator"
  | "ramp"
  | "wall";

export type ComponentType =
  | "room"
  | "stair"
  | "elevator"
  | "hallway"
  | "entrance"
  | "restroom";

export interface NavNode {
  id: string;
  name: string;
  type: NodeType;
  campusId?: string;
  buildingId?: string;
  componentId?: string;
  floor: number;
  position: LatLng;
  svgOffset?: { x: number; y: number };
  hasQr?: boolean;
  hasPanorama?: boolean;
  metadata?: Record<string, unknown>;
}

export interface NavEdge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  distance: number;
  metadata?: {
    travelType?: string;
    isBidirectional?: boolean;
  };
}

export interface Building {
  id: string;
  campusId?: string;
  name: string;
  code?: string;
  description: string;
  center: LatLng;
  outline?: LatLng[];
  floors: number;
  color?: string;
  image?: string | null;
}

export interface Component {
  id: string;
  type: ComponentType;
  name: string;
  buildingId: string;
  floor: number;
  position: LatLng;
  dimensions?: {
    width: number;
    height: number;
    rotation?: number;
  };
  connections?: string[];
  metadata?: Record<string, unknown>;
}

export interface GraphSnapshot {
  version: string;
  campusId: string;
  buildings: Building[];
  nodes: NavNode[];
  edges: NavEdge[];
  components: Component[];
  exportedAt: string;
}
