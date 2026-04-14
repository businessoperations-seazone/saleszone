"use client";

import { useState, useCallback, useEffect } from "react";
import { T } from "@/lib/constants";
import type { NoShowData } from "@/lib/types";
import { NoShowView } from "@/components/dashboard/noshow-view";

export default function NoShowPreview() {
  const [data, setData] = useState<NoShowData | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/noshow?days=${d}`);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }
      setData(await res.json());
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Fetch error:", err);
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(days);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ fontFamily: T.font, backgroundColor: T.cinza50, minHeight: "100vh", padding: "20px" }}>
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", padding: "12px 16px", backgroundColor: "#fef3c7", border: "1px solid #fde68a", borderRadius: "8px" }}>
          <span style={{ fontSize: "13px", color: "#92400e", fontWeight: 500 }}>
            ⚠️ Preview local — esta página é temporária para desenvolvimento
          </span>
        </div>

        {error && (
          <div style={{ padding: "12px 16px", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", marginBottom: "16px" }}>
            <span style={{ fontSize: "13px", color: "#dc2626", fontWeight: 500 }}>Erro: {error}</span>
          </div>
        )}

        <NoShowView
          data={data}
          loading={loading}
          lastUpdated={lastUpdated}
          days={days}
          onDaysChange={(d) => { setDays(d); setData(null); fetchData(d); }}
        />
      </div>
    </div>
  );
}
