import { useEffect, useRef, useState } from 'react';

/** Counts up to `value` once it scrolls into view. Non-numeric values render as-is. */
export function CountUp({ value, duration = 1100, decimals = 0 }: { value: number | string | null | undefined; duration?: number; decimals?: number }) {
  const target = typeof value === 'number' ? value : NaN;
  const [shown, setShown] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (Number.isNaN(target)) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setShown(target); return; }
    let raf = 0;
    const run = () => {
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / duration);
        setShown(target * (1 - Math.pow(1 - p, 4)));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    if (started.current) { setShown(target); return () => cancelAnimationFrame(raf); }
    started.current = true;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setShown(target); return; }
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { run(); io.disconnect(); } }, { threshold: 0.2 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [target, duration]);

  if (Number.isNaN(target)) return <span>{value ?? '—'}</span>;
  return <span ref={ref}>{shown.toFixed(decimals)}</span>;
}

/** Adds `.in` to every `.reveal` element as it enters the viewport. Re-run with `deps` when content loads. */
export function useReveal(deps: unknown[] = []) {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.reveal:not(.in)'));
    if (!els.length) return;
    if (typeof IntersectionObserver === 'undefined') { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }),
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Pointer-follow spotlight for cards: sets --mx / --my on hover. */
export function trackPointer(e: React.MouseEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
}

export function Orbs({ n = 3 }: { n?: 2 | 3 | 4 }) {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => <span key={i} className={`orb o${i + 1}`} aria-hidden />)}
    </>
  );
}
