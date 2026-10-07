/**
 * Gera o executável único com `bun build --compile`.
 * Uso: bun scripts/build-binary.ts [alvo] [saída]
 *   alvo: bun-linux-x64, bun-linux-arm64, bun-darwin-x64, bun-darwin-arm64, bun-windows-x64
 */
import { dirname, join } from "node:path";
import type { BunPlugin } from "bun";

const target = process.argv[2] ?? `bun-${process.platform}-${process.arch}`;
const outfile = process.argv[3] ?? `dist/jukeboxdl-${target.replace(/^bun-/, "")}`;

// O Ink só usa o react-devtools-core em modo de desenvolvimento; no binário ele vira um stub.
const stubDevtools: BunPlugin = {
  name: "stub-react-devtools",
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: "react-devtools-core",
      namespace: "stub",
    }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: "export default { initialize() {}, connectToDevTools() {} };",
      loader: "js",
    }));
  },
};

// O better-sqlite3 escolhe o binário nativo por um caminho montado em tempo de execução,
// que o Bun não consegue embutir. Os arquivos lib/<plataforma>.js fazem require com
// caminho fixo, então o import é desviado para o da plataforma alvo.
const PLATFORM_FILES: Record<string, string> = {
  "bun-linux-x64": "linux-x64",
  "bun-linux-arm64": "linux-arm64",
  "bun-darwin-x64": "darwin-x64",
  "bun-darwin-arm64": "darwin-arm64",
  "bun-windows-x64": "win32-x64",
};
const sqliteDir = dirname(
  Bun.resolveSync("better-sqlite3/package.json", join(import.meta.dir, "../packages/core")),
);
const sqlitePlatform = PLATFORM_FILES[target];
if (!sqlitePlatform) throw new Error(`Alvo sem binário do better-sqlite3: ${target}`);

const pinSqlite: BunPlugin = {
  name: "pin-better-sqlite3",
  setup(build) {
    build.onResolve({ filter: /^better-sqlite3$/ }, () => ({
      path: join(sqliteDir, "lib", `${sqlitePlatform}.js`),
    }));
  },
};

const result = await Bun.build({
  entrypoints: ["apps/cli/src/main.ts"],
  compile: { target: target as Bun.Build.Target, outfile },
  minify: true,
  plugins: [stubDevtools, pinSqlite],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log(`✔ ${outfile}`);
