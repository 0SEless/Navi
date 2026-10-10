import type { NextRequest } from 'next/server'
import { saveGraphRequest } from '@/lib/graph-write-handler'

/** Existing verified administrator auth, explicit purpose and strict CAS. */
export async function POST(request: NextRequest) {
  return saveGraphRequest(request, { recovery: true })
}
