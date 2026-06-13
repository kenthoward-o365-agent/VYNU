import { useEffect, useState } from "react";

const dateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "2-digit",
  month: "short",
});
const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export default function POSClock({ className }: { className?: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className={className}>
      <span className="opacity-80">{dateFmt.format(now)}</span>
      <span className="mx-2 opacity-40">·</span>
      <span className="tabular-nums font-medium">{timeFmt.format(now)}</span>
    </div>
  );
}
