import { z } from 'zod';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z.string().default('info'),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    STORE_BACKEND: z.enum(['supabase', 'memory']).default('supabase'),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.STORE_BACKEND === 'supabase') {
      if (!env.SUPABASE_URL) {
        ctx.addIssue({ code: 'custom', path: ['SUPABASE_URL'], message: 'required when STORE_BACKEND=supabase' });
      }
      if (!env.SUPABASE_SERVICE_ROLE_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['SUPABASE_SERVICE_ROLE_KEY'],
          message: 'required when STORE_BACKEND=supabase',
        });
      }
    }
  });

export type Config = z.infer<typeof EnvSchema> & { corsOrigins: string[] };

/** Validate configuration once at startup so a bad deploy fails loudly, not on the first request. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Invalid configuration:\n  ${issues}`);
  }
  return {
    ...parsed.data,
    corsOrigins: parsed.data.CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
