// Substituto de @vercel/blob usando Supabase Storage (bucket saleszone-audit).
// API mínima usada pela app: putBlob, fetchBlobJson, casAcquireBlob, deleteBlob.
// Requer SUPABASE_SERVICE_ROLE_KEY server-side (service role bypassa RLS).

import { createClient } from "@supabase/supabase-js"

const BUCKET = "saleszone-audit"

let _client: ReturnType<typeof createClient> | null = null

function getAdminClient() {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (blob.ts)")
  _client = createClient(url, key, { auth: { persistSession: false } })
  return _client
}

export async function putBlob(path: string, data: unknown): Promise<void> {
  const body = typeof data === "string" ? data : JSON.stringify(data)
  const { error } = await getAdminClient().storage.from(BUCKET).upload(path, body, {
    upsert: true,
    contentType: "application/json",
  })
  if (error) throw new Error(`putBlob ${path}: ${error.message}`)
}

export async function fetchBlobJson<T>(path: string): Promise<T | null> {
  const { data, error } = await getAdminClient().storage.from(BUCKET).download(path)
  if (error || !data) return null
  try {
    const text = await data.text()
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

// CAS: upload sem upsert. Retorna true se conseguiu criar (path não existia), false caso contrário.
export async function casAcquireBlob(path: string, data: unknown): Promise<boolean> {
  const body = typeof data === "string" ? data : JSON.stringify(data)
  const { error } = await getAdminClient().storage.from(BUCKET).upload(path, body, {
    upsert: false,
    contentType: "text/plain",
  })
  return !error
}

export async function deleteBlob(path: string): Promise<void> {
  await getAdminClient().storage.from(BUCKET).remove([path])
}
