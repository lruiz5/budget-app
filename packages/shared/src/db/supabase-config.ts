import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const DB_PATH = process.env.PGLITE_DB_LOCATION || './data/budget-local';
const DATA_DIR = path.dirname(DB_PATH);
const CONFIG_PATH = path.join(DATA_DIR, 'supabase-config.json');

export interface SupabaseConfig {
  enabled: boolean;
  databaseUrl: string;
  lastSyncAt: string | null;
  instanceId: string;
}

const DEFAULT_CONFIG: SupabaseConfig = {
  enabled: false,
  databaseUrl: '',
  lastSyncAt: null,
  instanceId: '',
};

export function loadSupabaseConfig(): SupabaseConfig | null {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return null;
  }
}

export function saveSupabaseConfig(config: Partial<SupabaseConfig>): SupabaseConfig {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const existing = loadSupabaseConfig() || { ...DEFAULT_CONFIG };
  const merged: SupabaseConfig = { ...existing, ...config };

  if (!merged.instanceId) {
    merged.instanceId = crypto.randomUUID();
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

export function isSupabaseEnabled(): boolean {
  const config = loadSupabaseConfig();
  return config !== null && config.enabled && !!config.databaseUrl;
}

export function getInstanceId(): string {
  const config = loadSupabaseConfig();
  if (config?.instanceId) return config.instanceId;

  const newId = crypto.randomUUID();
  saveSupabaseConfig({ instanceId: newId });
  return newId;
}

/** Mask sensitive connection strings for display */
export function maskKey(key: string): string {
  if (!key || key.length < 16) return key ? '***' : '';
  return key.slice(0, 8) + '...' + key.slice(-4);
}
