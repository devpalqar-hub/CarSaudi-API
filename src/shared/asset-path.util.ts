import * as fs from 'fs';
import * as path from 'path';

/**
 * Resolves a static asset bundled at the project root (e.g. logo.png).
 * Tries process.cwd() first (true for `nest start` / `node dist/main` run
 * from the backend directory), then walks up from this file's own location
 * to cover both the ts-node (src/shared) and compiled (dist/src/shared)
 * layouts, since the compiled output nests an extra "src" directory.
 */
export function resolveAssetPath(filename: string): string {
  const candidates = [
    path.join(process.cwd(), filename),
    path.join(__dirname, '..', '..', filename),
    path.join(__dirname, '..', '..', '..', filename),
  ];

  return (
    candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0]
  );
}
