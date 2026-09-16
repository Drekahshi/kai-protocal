"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Smoothly animates towards `value` with cubic ease-out.
 * Used for count-up TVL / reserves / APY figures.
 */
export function useAnimNumber(value: number, duration = 900): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;

    const start = performance.now();
    const delta = value - from;
    let raf = 0;

    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + delta * eased);
      if (p < 1) {
        raf = requestAnimationFrame(step);
      } else {
        fromRef.current = valueRef.current;
      }
    };

    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = valueRef.current;
    };
  }, [value, duration]);

  return display;
}