import { useState } from "react";
import type { Label } from "@/core/types";
import type { Attached } from "@/services/accounts";
import type { ItemRow } from "@/core/types";
import { Thumb } from "@/app/components/Thumb";
import { dims, fmtDate } from "@/core/format";

const PAGE = 200; // photos drawn per account at a time

export function LibrariesPage({ items, accounts }: { items: Record<Label, ItemRow[]>; accounts: Attached[] }) {
  const [limit, setLimit] = useState<Record<Label, number>>({ A: PAGE, B: PAGE });
  return (
    <div className="libs">
      {(["A", "B"] as Label[]).map((l, i) => (
        <section key={l} className="panel">
          <h3>
            Account {l}
            <span>
              {accounts[i]?.account ? `${accounts[i].account} · ` : ""}
              {items[l].length} photos
            </span>
          </h3>
          <div className="grid">
            {items[l].slice(0, limit[l]).map((it) => (
              <figure key={it.mediaKey}>
                <Thumb base={it.thumbUrl} px={96} />
                <figcaption>
                  {dims(it)}
                  {it.isLivePhoto ? " · live" : ""}
                  <br />
                  {fmtDate(it.captureTime)}
                </figcaption>
              </figure>
            ))}
          </div>
          {items[l].length > limit[l] && (
            <button className="btn more" onClick={() => setLimit((o) => ({ ...o, [l]: o[l] + PAGE }))}>
              Show {Math.min(PAGE, items[l].length - limit[l])} more ({items[l].length - limit[l]} left)
            </button>
          )}
          {items[l].length === 0 && <div className="empty">Nothing stored. Scan the libraries first.</div>}
        </section>
      ))}
    </div>
  );
}
