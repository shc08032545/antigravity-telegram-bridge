export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class Logger {
  private readonly minPriority: number;
  private readonly redactValues: string[];

  constructor(level: LogLevel = 'info', redactValues: string[] = []) {
    this.minPriority = LEVEL_PRIORITY[level];
    this.redactValues = redactValues.filter((value) => value.length > 0);
  }

  private sanitize(input: unknown): string {
    let text =
      typeof input === 'string'
        ? input
        : input instanceof Error
          ? input.stack ?? input.message
          : JSON.stringify(input);

    for (const secret of this.redactValues) {
      text = text.split(secret).join('[REDACTED]');
    }
    return text;
  }

  private log(level: LogLevel, message: string, meta?: unknown): void {
    if (LEVEL_PRIORITY[level] < this.minPriority) {
      return;
    }

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    const body =
      meta !== undefined
        ? `${this.sanitize(message)} ${this.sanitize(meta)}`
        : this.sanitize(message);

    if (level === 'error') {
      console.error(`${prefix} ${body}`);
    } else if (level === 'warn') {
      console.warn(`${prefix} ${body}`);
    } else {
      console.log(`${prefix} ${body}`);
    }
  }

  debug(message: string, meta?: unknown): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: unknown): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: unknown): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: unknown): void {
    this.log('error', message, meta);
  }
}
