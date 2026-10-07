import type { Jukebox, PlayerState, ScanProgress } from "@jukeboxdl/core";
import { useEffect, useState } from "react";

/** Estado do player, com a posição atualizada no máximo a cada `interval` ms. */
export function usePlayerState(player: Jukebox["player"], interval = 250): PlayerState {
  const [state, setState] = useState<PlayerState>(player.state);
  useEffect(() => {
    let timer: NodeJS.Timeout | undefined;
    let last = player.state;
    const onChange = (next: PlayerState) => {
      const onlyPosition =
        next.status === last.status &&
        next.track?.id === last.track?.id &&
        next.volume === last.volume;
      last = next;
      if (!onlyPosition) {
        clearTimeout(timer);
        timer = undefined;
        setState(next);
        return;
      }
      timer ??= setTimeout(() => {
        timer = undefined;
        setState(player.state);
      }, interval);
    };
    player.on("change", onChange);
    return () => {
      player.off("change", onChange);
      clearTimeout(timer);
    };
  }, [player, interval]);
  return state;
}

/** Faixas da biblioteca e o progresso da varredura em andamento. */
export function useLibrary(library: Jukebox["library"]) {
  const [tracks, setTracks] = useState(library.tracks);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  useEffect(() => {
    const onUpdate = () => {
      setTracks(library.tracks);
      setProgress(null);
    };
    library.on("update", onUpdate);
    library.on("progress", setProgress);
    return () => {
      library.off("update", onUpdate);
      library.off("progress", setProgress);
    };
  }, [library]);
  return { tracks, progress };
}
