import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const ARTIFACTS_DIR = join(process.cwd(), 'demo-output')

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const file = searchParams.get('file') || 'manifest.json'

  const filePath = join(ARTIFACTS_DIR, file)
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const content = readFileSync(filePath, 'utf-8')
  return new NextResponse(content, {
    headers: { 'Content-Type': 'application/json' },
  })
}
