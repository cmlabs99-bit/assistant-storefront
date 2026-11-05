import type { Config } from '../lib/config.js';
import { MemoryStore } from './memory.js';
import { SupabaseStore } from './supabase.js';
import type { Store } from './types.js';

export type { Store } from './types.js';
export { MemoryStore } from './memory.js';

export function createStore(config: Config): Store {
  if (config.STORE_BACKEND === 'memory') return new MemoryStore();
  // loadConfig() already guarantees these are present for the supabase backend.
  return new SupabaseStore(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!);
}
