import { useEffect, useRef } from "react";
import type { CellSnapshot } from "@/lib/swarm/engine";

const TAG_RGB: Record<string, [number, number, number]> = {
  lit: [107, 114, 128],
  run: [138, 160, 184],
  match: [200, 204, 212],
  idle: [42, 42, 48],
  clone: [109, 122, 110],
};

export function NcaCanvas({
  cells,
  className,
}: {
  cells: CellSnapshot[];
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const w = Math.max(1, parent?.clientWidth ?? 640);
    const h = 96;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#121214";
    ctx.fillRect(0, 0, w, h);
    if (!cells.length) return;

    const n = Math.min(cells.length, 1024);
    const cellW = w / n;
    for (let i = 0; i < n; i++) {
      const c = cells[i]!;
      const [r, g, b] = TAG_RGB[c.tag] ?? TAG_RGB.idle!;
      const lift = 0.55 + 0.45 * ((c.hidden + 1) / 2);
      ctx.fillStyle = `rgb(${Math.round(r * lift)} ${Math.round(g * lift)} ${Math.round(b * lift)})`;
      ctx.fillRect(i * cellW, 0, Math.max(1, cellW + 0.4), h);
    }
  }, [cells]);

  return <canvas ref={ref} className={className} aria-label="NCA cell field" />;
}
