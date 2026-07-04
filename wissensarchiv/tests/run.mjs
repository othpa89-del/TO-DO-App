// Fuehrt alle Suiten gegen einen lokalen Server aus. Exit-Code 1 bei Fehlern.
import path from 'path';
import { fileURLToPath } from 'url';
import { startServer } from './helper.mjs';
import { generate } from './gen-testfiles.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(here, '..');

console.log('Erzeuge Testdateien …');
await generate();

const srv = await startServer(appRoot);
console.log('Server:', srv.url);

const suites = ['01-core', '02-library', '03-regressions', '04-platform', '05-ocr'];
let failed = 0;
for (const name of suites) {
  const mod = await import(`./${name}.mjs`);
  try {
    failed += await mod.run(srv.url);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name} abgebrochen — ${e.message}`);
  }
}

srv.close();
console.log(failed ? `\nFEHLGESCHLAGEN: ${failed} Check(s)` : '\nAlle Checks bestanden.');
process.exit(failed ? 1 : 0);
