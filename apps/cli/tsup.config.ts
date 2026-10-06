import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  target: "node22",
  clean: true,
  sourcemap: true,
  banner: { js: "#!/usr/bin/env node" },
  // O core é empacotado a partir do código-fonte; o resto fica como dependência.
  noExternal: ["@jukeboxdl/core"],
});
