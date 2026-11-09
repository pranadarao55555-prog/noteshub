import { useEffect, useRef } from 'react';

interface FireworksBurstProps {
  contained?: boolean;
}

export default function FireworksBurst({ contained = false }: FireworksBurstProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const fit = () => {
      if (contained && c.parentElement) {
        c.width = c.parentElement.clientWidth * dpr;
        c.height = c.parentElement.clientHeight * dpr;
      } else {
        c.width = window.innerWidth * dpr;
        c.height = window.innerHeight * dpr;
      }
    };
    fit();
    window.addEventListener('resize', fit);

    const colors = ['#ffd37a', '#ff7a59', '#8b7bff', '#5ec8ff', '#ff6fae'];
    const startedAt = performance.now();
    let parts: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      col: string;
      r: number;
    }> = [];
    let raf: number;
    let last = startedAt;
    let nextSpawn = startedAt;

    const burst = (x: number, y: number) => {
      const col = colors[(Math.random() * colors.length) | 0];
      for (let i = 0; i < 70; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = (2 + Math.random() * 5) * dpr;
        parts.push({
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: 1,
          col,
          r: (1 + Math.random() * 2) * dpr,
        });
      }
    };

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 16.7, 3);
      last = now;

      if (now < startedAt + 1700 && now >= nextSpawn) {
        burst(c.width * (0.15 + Math.random() * 0.7), c.height * (0.15 + Math.random() * 0.4));
        nextSpawn = now + 180;
      }

      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.fillRect(0, 0, c.width, c.height);

      ctx.globalCompositeOperation = 'lighter';
      parts = parts.filter((p) => p.life > 0);
      for (const p of parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 0.06 * dt * dpr;
        p.vx *= 0.985;
        p.life -= 0.014 * dt;
        ctx.globalAlpha = Math.max(p.life, 0);
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      style={{
        position: contained ? 'absolute' : 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: contained ? 10 : 25,
      }}
    />
  );
}
