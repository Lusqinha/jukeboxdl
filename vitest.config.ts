import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{packages,apps}/*/src/**/*.test.{ts,tsx}"],
    // Mensagens nos testes sempre em pt-BR, independente do idioma do sistema.
    env: { JUKEBOXDL_LANG: "pt-BR" },
  },
});
