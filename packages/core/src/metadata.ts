/** Metadados de uma faixa, usados nas tags ID3 e no template de nome do arquivo. */
export interface TrackMetadata {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  track?: number;
  year?: number;
  playlist?: string;
  /** Posição da faixa na playlist (começando em 1). */
  index?: number;
  uploader?: string;
}
