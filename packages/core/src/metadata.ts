/** Metadados de uma faixa, usados nas tags ID3 e no template de nome do arquivo. */
export interface TrackMetadata {
  id: string;
  title: string;
  artist?: string | undefined;
  album?: string | undefined;
  track?: number | undefined;
  year?: number | undefined;
  playlist?: string | undefined;
  /** Posição da faixa na playlist (começando em 1). */
  index?: number | undefined;
  uploader?: string | undefined;
}
