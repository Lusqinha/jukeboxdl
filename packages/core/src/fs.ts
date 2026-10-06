import { access, copyFile, rename, rm } from "node:fs/promises";

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Move um arquivo, copiando quando origem e destino estão em sistemas de arquivos diferentes. */
export async function moveFile(source: string, destination: string): Promise<void> {
  try {
    await rename(source, destination);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EXDEV")) throw error;
    await copyFile(source, destination);
    await rm(source, { force: true });
  }
}
