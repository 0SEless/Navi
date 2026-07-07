import type {
  NavNode as CoreNavNode,
  NavEdge as CoreNavEdge,
  NodeType as CoreNodeType,
  EdgeType as CoreEdgeType,
  LatLng as CoreLatLng,
} from '../../types/nav-types'

export type NodeType = CoreNodeType
export type EdgeType = CoreEdgeType
export type LatLng = CoreLatLng
export type Tool = "select" | "add_node" | "add_edge" | "pan" | "delete" | "building_box" | "record_path"
export type BuildingBoxMode = "rectangle" | "polygon"
export type MapView = "real" | "auto_svg" | "classic_svg"

export interface CampusBuilding {
  id: string
  name: string
  code: string
  description: string
  outline: LatLng[]
  center: LatLng
  floors: number
  color: string
}

export type NavNode = CoreNavNode
export type NavEdge = CoreNavEdge
