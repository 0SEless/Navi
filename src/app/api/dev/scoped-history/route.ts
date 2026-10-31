import { handleScopedHistoryRequest } from '@/services/scoped-history-dev-route'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  return handleScopedHistoryRequest(request)
}
