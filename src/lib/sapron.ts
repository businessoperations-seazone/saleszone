/**
 * Calls the Sapron MCP HTTP endpoint (Cloudflare Access tunnel).
 * Returns rows as an array of plain objects.
 * Credentials: CF_ACCESS_CLIENT_ID + CF_ACCESS_CLIENT_SECRET in env.
 */
export async function querySapron(sql: string): Promise<Record<string, unknown>[]> {
  const clientId = process.env.CF_ACCESS_CLIENT_ID
  const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET
  if (!clientId || !clientSecret)
    throw new Error("CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET not configured")

  const res = await fetch("https://mcp.sapron.com.br/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "CF-Access-Client-Id": clientId,
      "CF-Access-Client-Secret": clientSecret,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "consultar_banco", arguments: { query: sql } },
      id: 1,
    }),
  })

  if (!res.ok) throw new Error(`Sapron HTTP ${res.status}: ${await res.text()}`)

  const ct = res.headers.get("content-type") || ""
  let rpc: { result?: { content?: Array<{ text: string }> }; error?: unknown }

  if (ct.includes("text/event-stream")) {
    const text = await res.text()
    const lines = text.split("\n").filter(l => l.startsWith("data:"))
    if (!lines.length) throw new Error("Sapron SSE: no data lines")
    rpc = JSON.parse(lines[lines.length - 1].slice(5).trim())
  } else {
    rpc = await res.json() as typeof rpc
  }

  if (rpc.error) throw new Error(`Sapron RPC error: ${JSON.stringify(rpc.error)}`)

  const text = rpc.result?.content?.[0]?.text
  if (!text) throw new Error(`Sapron: no content in response`)

  const parsed: unknown = JSON.parse(text)
  if (Array.isArray(parsed)) return parsed as Record<string, unknown>[]
  if (parsed && typeof parsed === "object" && "rows" in (parsed as object))
    return (parsed as { rows: Record<string, unknown>[] }).rows
  throw new Error(`Sapron: unexpected result shape: ${text.substring(0, 200)}`)
}
