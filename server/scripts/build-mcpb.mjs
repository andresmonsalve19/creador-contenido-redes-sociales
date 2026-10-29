// Empaqueta el servidor MCP como extensión de Claude Desktop (.mcpb).
// Un solo archivo JavaScript con sus dependencias (sin node_modules ni binarios nativos): Claude
// Desktop lo ejecuta con su propio Node en Windows o macOS. Resultado: creador-de-contenido.mcpb
// en la raíz del proyecto.
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..');
const out = path.join(serverRoot, 'build', 'mcpb');
const bundle = path.resolve(serverRoot, '..', 'creador-de-contenido.mcpb');

await fs.rm(out, { recursive: true, force: true });
await build({
  entryPoints: [path.join(serverRoot, 'src', 'mcp', 'index.ts')],
  outfile: path.join(out, 'server', 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  // Algunas dependencias usan require(): se lo damos dentro del módulo ESM.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  legalComments: 'none',
});
await fs.copyFile(path.join(serverRoot, 'mcpb', 'manifest.json'), path.join(out, 'manifest.json'));
await fs.copyFile(path.join(serverRoot, 'mcpb', 'icon.png'), path.join(out, 'icon.png'));

// CLI oficial de MCPB: valida el manifiesto y crea el archivo.
// Su package.json no se puede importar (exports), así que se busca la carpeta del paquete.
const require = createRequire(import.meta.url);
let pkgDir = path.dirname(require.resolve('@anthropic-ai/mcpb'));
while (path.basename(pkgDir) !== 'mcpb') pkgDir = path.dirname(pkgDir);
const pkg = JSON.parse(await fs.readFile(path.join(pkgDir, 'package.json'), 'utf8'));
const cli = path.join(pkgDir, typeof pkg.bin === 'string' ? pkg.bin : Object.values(pkg.bin)[0]);
const run = (...args) => {
  const result = spawnSync(process.execPath, [cli, ...args], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run('validate', path.join(out, 'manifest.json'));
await fs.rm(bundle, { force: true });
run('pack', out, bundle);
console.log(`\nExtensión lista: ${bundle}`);
