import postgres from 'postgres';
import { loadSupabaseConfig } from './supabase-config';

let sql: ReturnType<typeof postgres> | null = null;

function ensureConnection(): ReturnType<typeof postgres> {
  if (sql) return sql;

  const config = loadSupabaseConfig();
  if (!config?.databaseUrl) {
    throw new Error('Supabase database URL is not configured');
  }

  sql = postgres(config.databaseUrl, {
    prepare: false,
    max: 5,
    idle_timeout: 30,
    connect_timeout: 10,
    ssl: 'prefer',
  });

  return sql;
}

/** Get the postgres.js SQL connection (for raw queries during sync) */
export function getSupabaseSQL(): ReturnType<typeof postgres> {
  return ensureConnection();
}

/** Close the Supabase connection */
export async function closeSupabaseDb(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = null;
  }
}

/** Reset the connection (e.g., when config changes) */
export async function resetSupabaseConnection(): Promise<void> {
  await closeSupabaseDb();
}

/** Test the connection by running a simple query */
export async function testSupabaseConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const conn = ensureConnection();
    const result = await conn`SELECT NOW() as now`;
    return { success: true, message: `Connected. Server time: ${result[0].now}` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, message: msg };
  }
}
