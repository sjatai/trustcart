export class ConfigError extends Error {
  public readonly name = "ConfigError";
  public readonly code = "config_error";
  constructor(message: string) {
    super(message);
  }
}

export function requireEnvVars(names: string[], help?: string): void {
  const missing = names.filter((n) => !process.env[n] || String(process.env[n]).trim().length === 0);
  if (missing.length === 0) return;
  const details = missing.map((m) => `- ${m}`).join("\n");
  throw new ConfigError(
    `Missing required configuration.\n\nSet the following environment variables:\n${details}\n\n${
      help || "Add them to `.env.local` (recommended for dev) and restart the server."
    }`
  );
}


