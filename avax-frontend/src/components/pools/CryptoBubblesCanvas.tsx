"use client";

import React, { useEffect, useRef } from "react";
import type { StakePosition } from "./PoolDrawer";

export interface PoolToken {
  id: string;
  symbol: string;
  name: string;
  apy: number;
  tvl: number;
  poolType: "Daily Flex" | "Monthly Lock" | "x402 Sweep" | "RWA Lock";
  colorStart: string;
  colorEnd: string;
}

export const KAI_TOKENS: PoolToken[] = [
  { id: "nvr", symbol: "NVR", name: "Nuvari Governance", apy: 18.5, tvl: 1250000, poolType: "Monthly Lock", colorStart: "#c9a24b", colorEnd: "#1c3d2e" },
  { id: "nuvari-stable", symbol: "NVR-STABLE", name: "Nuvari Stablecoin", apy: 10.2, tvl: 3100000, poolType: "Daily Flex", colorStart: "#0f2e20", colorEnd: "#10b981" },
  { id: "ytoken", symbol: "YToken", name: "Yield Aggregator", apy: 14.8, tvl: 890000, poolType: "Daily Flex", colorStart: "#f59e0b", colorEnd: "#d97706" },
  { id: "ygold", symbol: "YGold", name: "RWA Gold Vault", apy: 12.4, tvl: 2100000, poolType: "RWA Lock", colorStart: "#d4af37", colorEnd: "#996515" },
  { id: "gami", symbol: "GAMI", name: "Community Rewards", apy: 22.0, tvl: 450000, poolType: "Daily Flex", colorStart: "#34d399", colorEnd: "#059669" },
  { id: "nuvari-cents", symbol: "NVR-CENTS", name: "x402 Micro-Unit", apy: 6.5, tvl: 620000, poolType: "x402 Sweep", colorStart: "#e2d1a6", colorEnd: "#8c6d31" },
];

/** Visual "liquidity graph" — which pools talk to each other. */
export const POOL_CONNECTIONS: [string, string][] = [
  ["nvr", "nuvari-stable"],
  ["ytoken", "ygold"],
  ["gami", "nuvari-cents"],
];

interface BubbleNode extends PoolToken {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  targetRadius: number;
}

export default function CryptoBubblesCanvas({
  onSelectPool,
  stakedPositions = {},
  connections = POOL_CONNECTIONS,
}: {
  onSelectPool: (token: PoolToken) => void;
  stakedPositions?: Record<string, StakePosition>;
  connections?: [string, string][];
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stakedRef = useRef(stakedPositions);
  useEffect(() => {
    stakedRef.current = stakedPositions;
  }, [stakedPositions]);

  const totalTvl = KAI_TOKENS.reduce((s, t) => s + t.tvl, 0);
  const formatTvl = (v: number) => (v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}M` : `$${(v / 1_000).toFixed(1)}K`);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    const height = (canvas.height = 480);
    let width = (canvas.width = canvas.parentElement?.clientWidth || 800);

    // Ambient starfield
    const stars = Array.from({ length: 46 }, () => ({
      x: Math.random() * 800,
      y: Math.random() * height,
      r: Math.random() * 1.4 + 0.3,
      tw: Math.random() * Math.PI * 2,
      sp: Math.random() * 0.4 + 0.3,
    }));

    // Initialize bubble positions
    const nodes: BubbleNode[] = KAI_TOKENS.map((token, i) => {
      const radius = Math.min(128, Math.max(52, Math.sqrt(token.tvl) / 15));
      return {
        ...token,
        x: (i + 1) * (width / 7),
        y: height / 2 + (Math.random() * 40 - 20),
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        radius,
        targetRadius: radius,
      };
    });

    const byId = new Map(nodes.map(n => [n.id, n]));

    let mouseX = -1000;
    let mouseY = -1000;
    let hoveredId: string | null = null;
    let isDragging = false;
    let draggedNode: BubbleNode | null = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragMoved = false;

    const handleResize = () => {
      width = canvas.parentElement?.clientWidth || 800;
      canvas.width = width;
      nodes.forEach(n => {
        n.x = Math.min(Math.max(n.x, n.radius), width - n.radius);
      });
    };
    const ro = new ResizeObserver(handleResize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    window.addEventListener("resize", handleResize);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;

      if (isDragging && draggedNode) {
        if (Math.abs(mouseX - dragStartX) > 5 || Math.abs(mouseY - dragStartY) > 5) {
          dragMoved = true;
        }
        draggedNode.x = mouseX;
        draggedNode.y = mouseY;
        draggedNode.vx = 0;
        draggedNode.vy = 0;
        return;
      }

      // Hover detection
      let found: string | null = null;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        const dx = mouseX - n.x;
        const dy = mouseY - n.y;
        if (dx * dx + dy * dy <= n.radius * n.radius) {
          found = n.id;
          break;
        }
      }
      hoveredId = found;
      canvas.style.cursor = found || isDragging ? "pointer" : "grab";
    };

    const handleMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      dragStartX = x;
      dragStartY = y;
      dragMoved = false;

      for (let i = 0; i < nodes.length; i++) {
        const dx = x - nodes[i].x;
        const dy = y - nodes[i].y;
        if (dx * dx + dy * dy <= nodes[i].radius * nodes[i].radius) {
          isDragging = true;
          draggedNode = nodes[i];
          return;
        }
      }
    };

    const handleMouseUp = () => {
      if (isDragging && draggedNode) {
        if (!dragMoved) {
          onSelectPool(draggedNode);
        } else {
          draggedNode.vx = (Math.random() - 0.5) * 4;
          draggedNode.vy = (Math.random() - 0.5) * 4;
        }
      }
      isDragging = false;
      draggedNode = null;
    };

    const handleMouseLeave = () => {
      isDragging = false;
      draggedNode = null;
      hoveredId = null;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const rect = canvas.getBoundingClientRect();
      dragStartX = e.touches[0].clientX - rect.left;
      dragStartY = e.touches[0].clientY - rect.top;
      dragMoved = false;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const dx = dragStartX - n.x;
        const dy = dragStartY - n.y;
        if (dx * dx + dy * dy <= n.radius * n.radius) {
          isDragging = true;
          draggedNode = n;
          return;
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging || !draggedNode) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.touches[0].clientX - rect.left;
      const y = e.touches[0].clientY - rect.top;
      if (Math.abs(x - dragStartX) > 5 || Math.abs(y - dragStartY) > 5) dragMoved = true;
      draggedNode.x = x;
      draggedNode.y = y;
      draggedNode.vx = 0;
      draggedNode.vy = 0;
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("touchstart", handleTouchStart, { passive: true });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: true });
    canvas.addEventListener("touchend", handleMouseUp, { passive: true });

    const render = (tMs: number) => {
      const t = tMs / 1000;
      ctx.clearRect(0, 0, width, height);
      const staked = stakedRef.current;

      // ── Starfield ──
      stars.forEach(s => {
        const a = 0.25 + Math.sin(t * s.sp + s.tw) * 0.2;
        ctx.beginPath();
        ctx.arc((s.x + t * 4) % width, s.y + Math.sin(t * 0.2 + s.tw) * 12, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${Math.max(a * 0.15, 0.03)})`;
        ctx.fill();
      });

      // ── Physics separation and hover scale ──
      const hovered = hoveredId ? byId.get(hoveredId) : null;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.targetRadius = n === hovered && !isDragging ? n.radius * 1.14 : n.radius;
        n.radius += (n.targetRadius - n.radius) * 0.12;

        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - n.x;
          const dy = nodes[j].y - n.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = n.radius + nodes[j].radius + 12;
          if (dist < minDist && dist > 0) {
            const angle = Math.atan2(dy, dx);
            const ax = (Math.cos(angle) * (minDist - dist)) * 0.06;
            const ay = (Math.sin(angle) * (minDist - dist)) * 0.06;
            if (n !== draggedNode) { n.vx -= ax; n.vy -= ay; }
            if (nodes[j] !== draggedNode) { nodes[j].vx += ax; nodes[j].vy += ay; }
          }
        }
      }

      // ── Connection lines between pool families ──
      connections.forEach(([aId, bId], ci) => {
        const a = byId.get(aId);
        const b = byId.get(bId);
        if (!a || !b) return;
        ctx.save();
        const pulse = 0.25 + Math.sin(t * 1.2 + ci * 1.7) * 0.15;
        ctx.strokeStyle = `rgba(16,185,129,${pulse})`;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([5, 7]);
        ctx.lineDashOffset = -t * 18;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();

        // energy node mid-way
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const glow = 3.5 + Math.sin(t * 3) * 1.5;
        ctx.fillStyle = `rgba(52,211,153,${0.5 + pulse})`;
        ctx.beginPath();
        ctx.arc(mx, my, glow, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // ── Nodes ──
      nodes.forEach(node => {
        if (node !== draggedNode) {
          node.x += node.vx;
          node.y += node.vy;
          node.vx *= 0.99;
          node.vy *= 0.99;
          if (Math.abs(node.vx) < 0.2) node.vx += (Math.random() - 0.5) * 0.08;
          if (Math.abs(node.vy) < 0.2) node.vy += (Math.random() - 0.5) * 0.08;
        }

        if (node.x - node.radius < 0) { node.x = node.radius; node.vx *= -0.8; }
        if (node.x + node.radius > width) { node.x = width - node.radius; node.vx *= -0.8; }
        if (node.y - node.radius < 0) { node.y = node.radius; node.vy *= -0.8; }
        if (node.y + node.radius > height) { node.y = height - node.radius; node.vy *= -0.8; }

        const isHovered = hoveredId === node.id;
        const isStaked = !!staked[node.id];
        const r = node.radius;

        // breathing ring
        const breathe = r + 7 + Math.sin(t * 1.4 + node.x) * 3;
        ctx.beginPath();
        ctx.arc(node.x, node.y, breathe, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // staked ring glow
        if (isStaked) {
          const ringRadius = r + 6 + Math.sin(t * 1.6) * 3;
          ctx.beginPath();
          ctx.arc(node.x, node.y, ringRadius, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(52, 211, 153, 0.85)";
          ctx.lineWidth = 2.5;
          ctx.setLineDash([6, 4]);
          ctx.lineDashOffset = -t * 22;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.shadowColor = "rgba(52,211,153,0.8)";
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.arc(node.x, node.y, ringRadius + 5, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(52,211,153,0.25)";
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        const gradient = ctx.createLinearGradient(node.x - r, node.y - r, node.x + r, node.y + r);
        gradient.addColorStop(0, node.colorStart);
        gradient.addColorStop(1, node.colorEnd);

        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.shadowColor = isHovered ? node.colorStart : "rgba(0,0,0,0.4)";
        ctx.shadowBlur = isHovered ? 34 : 15;
        ctx.fill();
        ctx.lineWidth = isHovered ? 2.5 : 2;
        ctx.strokeStyle = isHovered ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)";
        ctx.stroke();

        // inner shine
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fill();

        ctx.textAlign = "center";
        ctx.fillStyle = "#FFFFFF";
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = 6;
        ctx.font = "bold 16px Inter, sans-serif";
        ctx.fillText(node.symbol, node.x, node.y - 12);

        ctx.font = "bold 14px Inter, sans-serif";
        ctx.fillStyle = "#34d399";
        ctx.fillText(`+${node.apy.toFixed(1)}% APY`, node.x, node.y + 10);

        ctx.font = "10px Inter, sans-serif";
        ctx.fillStyle = isHovered ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.8)";
        ctx.fillText(node.poolType, node.x, node.y + 26);
        ctx.shadowBlur = 0;
      });

      // ── Hover tooltip ──
      if (hovered) {
        const lines = [
          [hovered.name, "700 13px Inter, sans-serif", "#fff"],
          [`APY +${hovered.apy.toFixed(1)}%`, "900 12px Inter, sans-serif", "#34d399"],
          [`TVL ${formatTvl(hovered.tvl)}`, "600 11px Inter, sans-serif", "rgba(255,255,255,0.7)"],
        ];
        const w = 170;
        const h = lines.length * 19 + 14;
        let tx = hovered.x + hovered.radius + 12;
        let ty = hovered.y - h / 2;
        if (tx + w > width) tx = hovered.x - w - 14;
        if (ty < 4) ty = 4;
        if (ty + h > height) ty = height - h - 4;

        ctx.fillStyle = "rgba(6,8,12,0.92)";
        ctx.strokeStyle = `${hovered.colorStart}66`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tx + 10, ty);
        ctx.lineTo(tx + w - 10, ty);
        ctx.quadraticCurveTo(tx + w, ty, tx + w, ty + 10);
        ctx.lineTo(tx + w, ty + h - 10);
        ctx.quadraticCurveTo(tx + w, ty + h, tx + w - 10, ty + h);
        ctx.lineTo(tx + 10, ty + h);
        ctx.quadraticCurveTo(tx, ty + h, tx, ty + h - 10);
        ctx.lineTo(tx, ty + 10);
        ctx.quadraticCurveTo(tx, ty, tx + 10, ty);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        lines.forEach(([text, font, color], i) => {
          ctx.font = font;
          ctx.fillStyle = color;
          ctx.textAlign = "left";
          ctx.fillText(text, tx + 12, ty + 24 + i * 19);
        });
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      ro.disconnect();
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleMouseUp);
    };
  }, [onSelectPool, connections]);

  return (
    <div className="w-full bg-[#0a1811] border border-[#1c3d2e] rounded-2xl p-4 shadow-2xl relative overflow-hidden">
      <div className="flex justify-between items-center mb-4 px-2">
        <div>
          <h2 className="text-xl font-bold text-[#faf7f0]">KAI Nuvari Token Pools</h2>
          <p className="text-xs text-[#c9a24b]">
            Live liquidity graph · {connections.length} pairs routed · click a bubble to open pool
          </p>
        </div>
        <div className="flex gap-2">
          <span className="text-xs bg-[#1c3d2e] text-[#34d399] px-3 py-1 rounded-full font-mono border border-[#34d399]/30">
            {formatTvl(totalTvl)} TVL
          </span>
          <span className="hidden sm:inline-flex text-xs bg-[#1c3d2e] text-[#c9a24b] px-3 py-1 rounded-full font-mono border border-[#c9a24b]/30">
            {KAI_TOKENS.length} Core Tokens
          </span>
        </div>
      </div>
      <canvas ref={canvasRef} className="w-full h-[480px] rounded-xl" style={{ cursor: "grab", touchAction: "none" }} />
    </div>
  );
}