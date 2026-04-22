import { useState, useEffect, useRef } from "react";

interface CountdownProps {
  targetTime: string; // ISO string
  onReached: () => void;
}

function getRemaining(targetTime: string): number {
  return Math.max(0, Math.floor((new Date(targetTime).getTime() - Date.now()) / 1000));
}

function formatSeconds(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}

export default function Countdown({ targetTime, onReached }: CountdownProps) {
  const [remaining, setRemaining] = useState(() => getRemaining(targetTime));
  const reachedRef = useRef(false);

  useEffect(() => {
    if (remaining <= 0 && !reachedRef.current) {
      reachedRef.current = true;
      onReached();
      return;
    }

    const interval = setInterval(() => {
      const r = getRemaining(targetTime);
      setRemaining(r);
      if (r <= 0 && !reachedRef.current) {
        reachedRef.current = true;
        clearInterval(interval);
        onReached();
      }
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetTime]);

  if (reachedRef.current) return null;

  return (
    <span className="font-mono text-2xl font-bold text-gray-800">
      {formatSeconds(remaining)}
    </span>
  );
}
