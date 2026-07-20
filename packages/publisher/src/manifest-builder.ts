import type { BuiltPackage, NavigationPackageManifest, PackageArtifact } from './types'

export interface ArtifactRecord {
  name: string
  path: string
  checksum: string
  size: number
  schemaVersion: string
}

export function buildManifest(pkg: BuiltPackage, artifacts: ArtifactRecord[]): NavigationPackageManifest {
  const artifactMap: Record<string, PackageArtifact> = {}

  for (const a of artifacts) {
    artifactMap[a.name] = {
      path: a.path,
      checksum: a.checksum,
      size: a.size,
      schemaVersion: a.schemaVersion,
    }
  }

  return {
    schemaVersion: '1.0.0',
    campusId: pkg.campusId,
    campusName: pkg.campusName,
    publishedAt: pkg.publishedAt,
    compilerVersion: pkg.compilerVersion,
    revision: pkg.revision,
    artifacts: artifactMap,
    metadata: { ...pkg.metadata },
  }
}
