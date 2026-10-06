/**
 * Gera o executável único com `bun build --compile`.
 * Uso: bun scripts/build-binary.ts [alvo] [saída]
 *   alvo: bun-linux-x64, bun-linux-arm64, bun-darwin-x64, bun-darwin-arm64, bun-windows-x64
 */
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

const result = await Bun.build({
  entrypoints: ["apps/cli/src/main.ts"],
  compile: { target: target as Bun.Build.Target, outfile },
  minify: true,
  plugins: [stubDevtools],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log(`✔ ${outfile}`);
