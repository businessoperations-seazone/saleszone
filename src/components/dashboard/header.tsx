"use client";

import { useState, useRef, useEffect } from "react";
import { RefreshCw, BarChart3, Users, Clock, Scale, Megaphone, Timer, ShoppingCart, Activity, LogOut, TrendingUp, Target, Wallet, ChevronDown, Settings, ClipboardList, Layers, Mic, Calendar, UserX } from "lucide-react";
import type { UserRole } from "@/lib/types";
import { T } from "@/lib/constants";
import type { ModuleConfig } from "@/lib/modules";
import { MODULES, MODULE_IDS } from "@/lib/modules";
import { pillBtnStyle, pillBtnPrimaryStyle, viewBtnStyle } from "./ui";

const META_ADS_VIEWS = ["campanhas", "diagnostico-mkt", "orcamento", "planejamento", "explorador", "otimizacao"] as const;
const VENDAS_VIEWS = ["perf-vendas", "baseline", "diagnostico-vendas", "ociosidade", "leadtime", "avaliacoes", "losts-vendas"] as const;
const PRE_VENDAS_VIEWS = ["presales", "perf-prevendas", "balanceamento", "squad-atividades", "losts-prevendas", "noshow"] as const;
const RESULTADOS_VIEWS = ["geral", "resultados", "acompanhamento", "forecast", "mensal", "resultados-szs", "resultados-mktp", "resultados-decor"] as const;

const SeazoneIcon = () => (
  <svg width="28" height="29" viewBox="0 0 48 49" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M46.2131 15.1755L37.6794 10.1673C37.6977 10.0485 37.7528 9.9388 37.7528 9.81999V2.2665C37.7528 1.01444 36.7342 0 35.4771 0H30.9257C29.6686 0 28.6501 1.01444 28.6501 2.2665V4.90314L25.5531 3.09816C24.296 2.34876 22.6397 2.4767 21.4744 3.33578L21.4147 3.35863L1.78243 14.7003C0.144493 15.6736-0.539125 17.9355 0.479423 19.6308C1.53468 21.3901 3.86081 21.8654 5.49416 20.892L6.6687 20.2157C5.27852 22.9255 4.41138 25.9871 4.41138 29.3275C4.41138 34.6099 6.44848 39.8146 10.2107 43.5662C11.688 45.0422 13.4086 46.276 15.2942 47.1853C16.7441 47.8845 18.2765 48.4694 19.8685 48.7618C21.979 49.1457 24.1629 48.9492 26.2964 48.9537C28.5996 48.9537 30.9074 48.9583 33.2106 48.9629C35.2982 48.9674 37.3857 48.9766 39.4962 48.9811C40.0239 48.9811 40.5423 48.8441 41.0103 48.6064C41.6113 48.3003 41.9692 47.9667 42.3638 47.4412C42.8134 46.8472 43.1254 46.1297 43.1254 45.3621V21.582C44.6899 22.1441 46.5894 21.6552 47.5207 20.1015C48.5393 18.4062 47.8557 16.1443 46.2131 15.171M36.3947 29.7022C36.3947 36.9312 31.4809 42.8077 24.0712 42.8077C16.6615 42.8077 11.2155 36.5565 11.2155 29.3275C11.2155 22.0984 16.6615 16.0757 24.0712 16.0757C31.4809 16.0757 36.3947 21.6506 36.3947 28.802V29.7067V29.7022Z"
      fill="#FC6058"
    />
  </svg>
);

interface HeaderProps {
  mainView: string;
  setMainView: (v: string) => void;
  onRefresh: () => void;
  loading: boolean;
  syncElapsed?: number;
  lastUpdated?: Date | null;
  user?: { email: string; name: string };
  onLogout?: () => void;
  userRole?: UserRole | null;
  activeModule: string;
  onModuleChange: (moduleId: string) => void;
}

export function Header({ mainView, setMainView, onRefresh, loading, syncElapsed, lastUpdated, user, onLogout, userRole, activeModule, onModuleChange }: HeaderProps) {
  const [metaDropdownOpen, setMetaDropdownOpen] = useState(false);
  const metaDropdownRef = useRef<HTMLDivElement>(null);
  const isMetaAdsView = (META_ADS_VIEWS as readonly string[]).includes(mainView);

  const [vendasDropdownOpen, setVendasDropdownOpen] = useState(false);
  const vendasDropdownRef = useRef<HTMLDivElement>(null);
  const isVendasView = (VENDAS_VIEWS as readonly string[]).includes(mainView);

  const [preVendasDropdownOpen, setPreVendasDropdownOpen] = useState(false);
  const preVendasDropdownRef = useRef<HTMLDivElement>(null);
  const isPreVendasView = (PRE_VENDAS_VIEWS as readonly string[]).includes(mainView);

  const [resultadosDropdownOpen, setResultadosDropdownOpen] = useState(false);
  const resultadosDropdownRef = useRef<HTMLDivElement>(null);
  const isResultadosView = (RESULTADOS_VIEWS as readonly string[]).includes(mainView);

  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (metaDropdownRef.current && !metaDropdownRef.current.contains(e.target as Node)) {
        setMetaDropdownOpen(false);
      }
      if (vendasDropdownRef.current && !vendasDropdownRef.current.contains(e.target as Node)) {
        setVendasDropdownOpen(false);
      }
      if (preVendasDropdownRef.current && !preVendasDropdownRef.current.contains(e.target as Node)) {
        setPreVendasDropdownOpen(false);
      }
      if (resultadosDropdownRef.current && !resultadosDropdownRef.current.contains(e.target as Node)) {
        setResultadosDropdownOpen(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    }
    if (metaDropdownOpen || vendasDropdownOpen || preVendasDropdownOpen || resultadosDropdownOpen || userDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [metaDropdownOpen, vendasDropdownOpen, preVendasDropdownOpen, resultadosDropdownOpen, userDropdownOpen]);

  return (
    <header
      style={{
        backgroundColor: T.bg,
        borderBottom: `1px solid ${T.border}`,
        padding: "12px 20px",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "12px",
        position: "sticky",
        top: 0,
        zIndex: 20,
      }}
    >
      <SeazoneIcon />
      <div style={{ flex: 1 }}>
        <h4 style={{ fontSize: "17px", fontWeight: 500, color: T.fg, margin: 0 }}>Acompanhamento de Vendas</h4>
        <span style={{ fontSize: "11px", fontWeight: 400, color: T.mutedFg }}>Squads Manual · Pipeline {MODULES[activeModule]?.shortLabel ?? "SZI"}</span>
      </div>
      <div
        style={{
          display: "flex",
          gap: "2px",
          backgroundColor: T.cinza50,
          borderRadius: "9999px",
          padding: "3px",
          border: `1px solid ${T.border}`,
        }}
      >
        <div ref={resultadosDropdownRef} style={{ position: "relative" }}>
          <button
            onClick={() => setResultadosDropdownOpen((v) => !v)}
            style={{
              ...viewBtnStyle,
              backgroundColor: isResultadosView ? T.fg : "transparent",
              color: isResultadosView ? "#FFF" : T.cinza600,
              gap: "4px",
            }}
          >
            <TrendingUp size={12} /> Resultados <ChevronDown size={10} style={{ transition: "transform 0.2s", transform: resultadosDropdownOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
          </button>
          {resultadosDropdownOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                backgroundColor: "#FFF",
                border: `1px solid ${T.border}`,
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                zIndex: 50,
                minWidth: "180px",
                padding: "4px",
              }}
            >
              {([
                ...(activeModule === "szs" ? [{ key: "resultados-szs", label: "Resultados SZS", icon: <BarChart3 size={13} /> }] : []),
                ...(activeModule === "szi" ? [{ key: "geral", label: "Resultados SZNI", icon: <Layers size={13} /> }] : []),
                ...(activeModule === "mktp" ? [{ key: "resultados-mktp", label: "Resultados MKTP", icon: <BarChart3 size={13} /> }] : []),
                ...(activeModule === "decor" ? [{ key: "resultados-decor", label: "Resultados Decor", icon: <BarChart3 size={13} /> }] : []),
                { key: "resultados", label: "Funil", icon: <TrendingUp size={13} /> },
                { key: "acompanhamento", label: "Acompanhamento", icon: <BarChart3 size={13} /> },
                { key: "forecast", label: "Forecast", icon: <Target size={13} /> },
                { key: "mensal", label: "Mensal", icon: <Calendar size={13} /> },
              ] as Array<{ key: string; label: string; icon: React.ReactNode }>).map((item) => (
                <button
                  key={item.key}
                  onClick={() => { setMainView(item.key); setResultadosDropdownOpen(false); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                    padding: "8px 12px",
                    border: "none",
                    borderRadius: "6px",
                    backgroundColor: mainView === item.key ? T.azul50 : "transparent",
                    color: mainView === item.key ? T.fg : T.cinza600,
                    fontWeight: mainView === item.key ? 600 : 400,
                    fontSize: "13px",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => { if (mainView !== item.key) (e.currentTarget.style.backgroundColor = T.cinza50); }}
                  onMouseLeave={(e) => { if (mainView !== item.key) (e.currentTarget.style.backgroundColor = "transparent"); }}
                >
                  {item.icon} {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div ref={metaDropdownRef} style={{ position: "relative" }}>
          <button
            onClick={() => setMetaDropdownOpen((v) => !v)}
            style={{
              ...viewBtnStyle,
              backgroundColor: isMetaAdsView ? T.fg : "transparent",
              color: isMetaAdsView ? "#FFF" : T.cinza600,
              gap: "4px",
            }}
          >
            <Megaphone size={12} /> Growth <ChevronDown size={10} style={{ transition: "transform 0.2s", transform: metaDropdownOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
          </button>
          {metaDropdownOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                backgroundColor: "#FFF",
                border: `1px solid ${T.border}`,
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                zIndex: 50,
                minWidth: "180px",
                padding: "4px",
              }}
            >
              {([
                { key: "campanhas", label: "Campanhas", icon: <Megaphone size={13} /> },
                { key: "diagnostico-mkt", label: "Diagnóstico Mkt", icon: <Activity size={13} /> },
                { key: "orcamento", label: "Orçamento", icon: <Wallet size={13} /> },
                { key: "planejamento", label: "Planejamento", icon: <Target size={13} /> },
                { key: "otimizacao", label: "Otimização Diária", icon: <Timer size={13} /> },
                { key: "explorador", label: "Explorador de Dados", icon: <Layers size={13} /> },
              ] as const).map((item) => (
                <button
                  key={item.key}
                  onClick={() => { setMainView(item.key); setMetaDropdownOpen(false); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                    padding: "8px 12px",
                    border: "none",
                    borderRadius: "6px",
                    backgroundColor: mainView === item.key ? T.azul50 : "transparent",
                    color: mainView === item.key ? T.fg : T.cinza600,
                    fontWeight: mainView === item.key ? 600 : 400,
                    fontSize: "13px",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => { if (mainView !== item.key) (e.currentTarget.style.backgroundColor = T.cinza50); }}
                  onMouseLeave={(e) => { if (mainView !== item.key) (e.currentTarget.style.backgroundColor = "transparent"); }}
                >
                  {item.icon} {item.label}
                </button>
              ))}
              <div style={{ height: "1px", backgroundColor: T.border, margin: "4px 0" }} />
              <button
                onClick={() => { window.location.href = "/growth/audit-mql"; }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  width: "100%",
                  padding: "8px 12px",
                  border: "none",
                  borderRadius: "6px",
                  backgroundColor: "transparent",
                  color: T.cinza600,
                  fontWeight: 400,
                  fontSize: "13px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => { (e.currentTarget.style.backgroundColor = T.cinza50); }}
                onMouseLeave={(e) => { (e.currentTarget.style.backgroundColor = "transparent"); }}
              >
                <ClipboardList size={13} /> Audit MQL
              </button>
              <button
                onClick={() => { window.location.href = "/growth/sla-mql"; }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  width: "100%",
                  padding: "8px 12px",
                  border: "none",
                  borderRadius: "6px",
                  backgroundColor: "transparent",
                  color: T.cinza600,
                  fontWeight: 400,
                  fontSize: "13px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => { (e.currentTarget.style.backgroundColor = T.cinza50); }}
                onMouseLeave={(e) => { (e.currentTarget.style.backgroundColor = "transparent"); }}
              >
                <Target size={13} /> SLA de MQL
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => setMainView("alinhamento")}
          style={{
            ...viewBtnStyle,
            backgroundColor: mainView === "alinhamento" ? T.fg : "transparent",
            color: mainView === "alinhamento" ? "#FFF" : T.cinza600,
          }}
        >
          <Users size={12} /> Alinhamento Squad
        </button>
        <div ref={preVendasDropdownRef} style={{ position: "relative" }}>
          <button
            onClick={() => setPreVendasDropdownOpen((v) => !v)}
            style={{
              ...viewBtnStyle,
              backgroundColor: isPreVendasView ? T.fg : "transparent",
              color: isPreVendasView ? "#FFF" : T.cinza600,
              gap: "4px",
            }}
          >
            <Timer size={12} /> Pré-Venda <ChevronDown size={10} style={{ transition: "transform 0.2s", transform: preVendasDropdownOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
          </button>
          {preVendasDropdownOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                backgroundColor: "#FFF",
                border: `1px solid ${T.border}`,
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                zIndex: 50,
                minWidth: "220px",
                padding: "4px",
              }}
            >
              {([
                { key: "perf-prevendas", label: "Perf. Pré-Vendas", icon: <BarChart3 size={13} /> },
                { key: "presales", label: "Diagnóstico Pré-Venda", icon: <Timer size={13} /> },
                { key: "balanceamento", label: "Régua de Qualificação", icon: <Scale size={13} /> },
                { key: "squad-atividades", label: "Atividades", icon: <Activity size={13} /> },
                { key: "losts-prevendas", label: "Monitor Losts", icon: <Layers size={13} /> },
                { key: "noshow", label: "Monitor No-Show", icon: <UserX size={13} /> },
              ] as const).map((item) => (
                <button
                  key={item.key}
                  onClick={() => { setMainView(item.key); setPreVendasDropdownOpen(false); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                    padding: "8px 12px",
                    border: "none",
                    borderRadius: "6px",
                    backgroundColor: mainView === item.key ? T.azul50 : "transparent",
                    color: mainView === item.key ? T.fg : T.cinza600,
                    fontWeight: mainView === item.key ? 600 : 400,
                    fontSize: "13px",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => { if (mainView !== item.key) (e.currentTarget.style.backgroundColor = T.cinza50); }}
                  onMouseLeave={(e) => { if (mainView !== item.key) (e.currentTarget.style.backgroundColor = "transparent"); }}
                >
                  {item.icon} {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div ref={vendasDropdownRef} style={{ position: "relative" }}>
          <button
            onClick={() => setVendasDropdownOpen((v) => !v)}
            style={{
              ...viewBtnStyle,
              backgroundColor: isVendasView ? T.fg : "transparent",
              color: isVendasView ? "#FFF" : T.cinza600,
              gap: "4px",
            }}
          >
            <ShoppingCart size={12} /> Vendas <ChevronDown size={10} style={{ transition: "transform 0.2s", transform: vendasDropdownOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
          </button>
          {vendasDropdownOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                backgroundColor: "#FFF",
                border: `1px solid ${T.border}`,
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                zIndex: 50,
                minWidth: "180px",
                padding: "4px",
              }}
            >
              {([
                { key: "perf-vendas", label: "Perf. Vendas", icon: <ShoppingCart size={13} /> },
                { key: "baseline", label: "Base-Line", icon: <BarChart3 size={13} /> },
                { key: "diagnostico-vendas", label: "Diagnóstico Vendas", icon: <Activity size={13} /> },
                { key: "ociosidade", label: "Ociosidade", icon: <Clock size={13} /> },
                { key: "leadtime", label: "Leadtime", icon: <Timer size={13} /> },
                { key: "avaliacoes", label: "Avaliação Reuniões", icon: <Mic size={13} /> },
                { key: "losts-vendas", label: "Monitor Losts", icon: <Layers size={13} /> },
              ] as const).map((item) => (
                <button
                  key={item.key}
                  onClick={() => { setMainView(item.key); setVendasDropdownOpen(false); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                    padding: "8px 12px",
                    border: "none",
                    borderRadius: "6px",
                    backgroundColor: mainView === item.key ? T.azul50 : "transparent",
                    color: mainView === item.key ? T.fg : T.cinza600,
                    fontWeight: mainView === item.key ? 600 : 400,
                    fontSize: "13px",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => { if (mainView !== item.key) (e.currentTarget.style.backgroundColor = T.cinza50); }}
                  onMouseLeave={(e) => { if (mainView !== item.key) (e.currentTarget.style.backgroundColor = "transparent"); }}
                >
                  {item.icon} {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <button onClick={onRefresh} disabled={loading} style={pillBtnPrimaryStyle()}>
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> {loading ? `Atualizando...${syncElapsed != null ? ` (${syncElapsed}s)` : ""}` : "Atualizar"}
        </button>
        {lastUpdated && (
          <span style={{ fontSize: "11px", color: T.mutedFg, whiteSpace: "nowrap" }}>
            Última atualização: {lastUpdated.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
      {user && (
        <div ref={userDropdownRef} style={{ position: "relative", marginLeft: "4px", flexShrink: 0 }}>
          <button
            onClick={() => setUserDropdownOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "9999px",
              border: `1px solid ${T.border}`,
              backgroundColor: userDropdownOpen ? T.cinza50 : "transparent",
              color: T.mutedFg,
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            <span style={{ maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user.name || user.email}
            </span>
            <ChevronDown size={10} style={{ transition: "transform 0.2s", transform: userDropdownOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
          </button>
          {userDropdownOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                right: 0,
                backgroundColor: "#FFF",
                border: `1px solid ${T.border}`,
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                zIndex: 50,
                minWidth: "160px",
                padding: "4px",
              }}
            >
              {userRole === "diretor" && (
                <button
                  onClick={() => { setMainView("admin"); setUserDropdownOpen(false); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                    padding: "8px 12px",
                    border: "none",
                    borderRadius: "6px",
                    backgroundColor: "transparent",
                    color: T.cinza600,
                    fontSize: "13px",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = T.cinza50)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <Settings size={13} /> Admin
                </button>
              )}
              <button
                onClick={() => { setMainView("backlog"); setUserDropdownOpen(false); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  width: "100%",
                  padding: "8px 12px",
                  border: "none",
                  borderRadius: "6px",
                  backgroundColor: "transparent",
                  color: T.cinza600,
                  fontSize: "13px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = T.cinza50)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <ClipboardList size={13} /> Backlog
              </button>
              {/* Module Selector */}
              <div style={{ borderTop: `1px solid ${T.border}`, margin: "4px 0" }} />
              <div style={{ padding: "4px 12px 2px", fontSize: "10px", fontWeight: 600, color: T.cinza400, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <Layers size={10} style={{ display: "inline", marginRight: "4px", verticalAlign: "middle" }} />Módulo
              </div>
              {MODULE_IDS.map((modId) => {
                const mod = MODULES[modId];
                const isActive = modId === activeModule;
                return (
                  <button
                    key={modId}
                    onClick={() => { onModuleChange(modId); setUserDropdownOpen(false); }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      width: "100%",
                      padding: "8px 12px",
                      border: "none",
                      borderRadius: "6px",
                      backgroundColor: isActive ? T.azul50 : "transparent",
                      color: isActive ? T.azul600 : T.cinza600,
                      fontWeight: isActive ? 600 : 400,
                      fontSize: "13px",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = T.cinza50; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "transparent"; }}
                  >
                    {mod.label} ({mod.shortLabel})
                    {isActive && <span style={{ marginLeft: "auto", fontSize: "11px" }}>●</span>}
                  </button>
                );
              })}
              <div style={{ borderTop: `1px solid ${T.border}`, margin: "4px 0" }} />
              <button
                onClick={() => { onLogout?.(); setUserDropdownOpen(false); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  width: "100%",
                  padding: "8px 12px",
                  border: "none",
                  borderRadius: "6px",
                  backgroundColor: "transparent",
                  color: T.destructive,
                  fontSize: "13px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = T.vermelho50)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <LogOut size={13} /> Sair
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
