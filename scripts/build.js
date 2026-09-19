import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
// Remove only this generated directory so deleted source files cannot remain in a deployment.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const path of ['index.html', 'favicon.svg', 'src/']) {
  await cp(new URL(path, root), new URL(path, output), { recursive: true });
}
await writeFile(new URL('.nojekyll', output), '');
console.log(`Static site built at ${fileURLToPath(output)}`);
