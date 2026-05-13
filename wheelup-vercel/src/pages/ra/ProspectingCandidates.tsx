// Candidates editor — full version coming in next step. This stub renders the
// 4 candidates read-only so the build doesn't break in the interim.
import { useEffect, useState } from "react";
import { listCandidates } from "../../lib/ra/queries";
import type { Candidate } from "../../lib/ra/types";

export default function ProspectingCandidates() {
  const [list, setList] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    listCandidates().then((d) => { if (alive) setList(d); }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="text-sm text-gray-500">読み込み中…</div>;

  return (
    <div className="space-y-3">
      {list.map((c) => (
        <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-baseline gap-3">
            <h3 className="text-sm font-black text-[#4b4b4b]">{c.name}</h3>
            <span className="text-[10px] font-bold text-[#afafaf]">{c.code}</span>
          </div>
          {c.headline && <p className="mt-1 text-xs text-gray-500">{c.headline}</p>}
          <div className="mt-2 grid gap-2 md:grid-cols-2 text-xs">
            <Field label="specialties"    items={c.profile.specialties} />
            <Field label="industries_ok"  items={c.profile.industries_ok} />
            <Field label="deal_breakers"  items={c.profile.deal_breakers} />
            <Field label="in_progress"    items={c.profile.in_progress} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({ label, items }: { label: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] font-bold text-[#afafaf] uppercase">{label}</div>
      <ul className="mt-0.5 text-xs text-[#4b4b4b]">
        {items.map((s, i) => <li key={i}>• {s}</li>)}
      </ul>
    </div>
  );
}
