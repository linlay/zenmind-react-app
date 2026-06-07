export function readPublicEnv(name: string): string {
  const runtime = globalThis as typeof globalThis & {
    process?: {
      env?: Record<string, string | undefined>;
    };
  };

  return String(runtime.process?.env?.[name] || '');
}
