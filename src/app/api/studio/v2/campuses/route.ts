import type { NextRequest } from 'next/server'
import { studioHandlers } from '@/studio-v2/server/default-handlers'

export const runtime = 'nodejs'

export function GET(request: NextRequest) {
  return studioHandlers.listCampuses(request)
}

export function POST(request: NextRequest) {
  return studioHandlers.createCampus(request)
}

export function PATCH(request: NextRequest) {
  return studioHandlers.updateCampus(request)
}

export function DELETE(request: NextRequest) {
  return studioHandlers.deleteCampus(request)
}
