export class JukeboxError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ConfigError extends JukeboxError {
  constructor(
    message: string,
    readonly file: string,
    readonly issues: string[] = [],
  ) {
    super(message);
  }
}

export class TemplateError extends JukeboxError {
  constructor(
    message: string,
    readonly issues: TemplateIssue[],
  ) {
    super(message);
  }
}

export interface TemplateIssue {
  message: string;
  /** Posição (índice do caractere) no template onde o problema começa. */
  position: number;
}

export class BinaryError extends JukeboxError {}

export class DownloadError extends JukeboxError {}

export class UnsupportedPlatformError extends JukeboxError {}
