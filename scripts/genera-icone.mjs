// Ricostruisce le icone dell'app (PWA) in public/icons partendo dai file base64
// in scripts/icone. Viene eseguito in automatico prima di `npm run dev` e `npm run build`.
// Le icone sono salvate come testo perché il repository viene aggiornato anche
// tramite strumenti che gestiscono solo file di testo.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(root, 'scripts', 'icone');
const targetDir = join(root, 'public', 'icons');

mkdirSync(targetDir, { recursive: true });
for (const file of readdirSync(sourceDir)) {
  if (!file.endsWith('.b64')) continue;
  const bytes = Buffer.from(readFileSync(join(sourceDir, file), 'utf8').trim(), 'base64');
  writeFileSync(join(targetDir, file.replace(/\.b64$/, '')), bytes);
}
console.log('[icone] icone PWA generate in public/icons');
