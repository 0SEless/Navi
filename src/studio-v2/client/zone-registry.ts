import { createStudioApi } from './api-client'
import { ZoneClient } from './zone-client'

const clients = new Map<string, ZoneClient>()

/**
 * One zone client per campus for the whole browser tab, so a building lock taken on the
 * map page survives client-side navigation into the floor editor (and back).
 */
export function getZoneClient(campusId: string): ZoneClient {
  let client = clients.get(campusId)
  if (!client) {
    client = new ZoneClient({ campusId, api: createStudioApi() })
    clients.set(campusId, client)
  }
  return client
}
