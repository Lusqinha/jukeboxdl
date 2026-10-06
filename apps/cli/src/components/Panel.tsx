import { Box, Spacer, Text } from "ink";
import type { ReactNode } from "react";
import { type Theme, useTheme } from "../tui/theme";

/** Linhas ocupadas pela moldura do painel (bordas + título com separador). */
export function panelChrome(theme: Theme, titled: boolean): number {
  if (!theme.retro) return 0;
  return 2 + (titled ? 2 : 0);
}

/**
 * Caixa com borda chanfrada no tema retrô: "raised" (topo/esquerda claros) para painéis,
 * "sunken" (invertido) para campos. No tema clássico, só agrupa o conteúdo.
 */
export function Panel({
  title,
  right,
  variant = "raised",
  children,
  flexGrow,
}: {
  title?: string;
  right?: ReactNode;
  variant?: "raised" | "sunken";
  children: ReactNode;
  flexGrow?: number;
}) {
  const theme = useTheme();
  if (!theme.retro) {
    return (
      <Box flexDirection="column" {...(flexGrow !== undefined && { flexGrow })}>
        {children}
      </Box>
    );
  }
  const [light, dark] =
    variant === "raised"
      ? [theme.bevelLight, theme.bevelDark]
      : [theme.bevelDark, theme.bevelLight];
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderTopColor={light}
      borderLeftColor={light}
      borderBottomColor={dark}
      borderRightColor={dark}
      paddingX={1}
      {...(flexGrow !== undefined && { flexGrow })}
    >
      {title && (
        <>
          <Box>
            <Text color={theme.accent}>
              {"// "}
              {title}
            </Text>
            <Spacer />
            {right}
          </Box>
          <Box
            borderStyle="single"
            borderTop={false}
            borderLeft={false}
            borderRight={false}
            borderBottomColor={theme.bevelDark}
          />
        </>
      )}
      {children}
    </Box>
  );
}
