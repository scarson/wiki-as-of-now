// ABOUTME: Renders the honesty/degradation banner for a WorksheetHonestyState (the four spec states + supported).
// ABOUTME: Neutral/dust styling — NOT rust (rust is staleness-only, the Two Lanes Rule); a degradation banner is not a staleness signal.
import type { WorksheetHonestyState } from "@/worksheet/view-types";
import { honestyBannerText } from "@/worksheet/honesty-banner";

export function HonestyBanner({ honesty }: { honesty: WorksheetHonestyState }) {
  const supported = honesty.kind === "supported";
  return (
    <div className="rounded-md border border-hairline-gray bg-shelf-gray px-4 py-3">
      <p
        className={`text-sm ${supported ? "text-ledger-olive-bright" : "text-dust-gray"}`}
        role="status"
      >
        {honestyBannerText(honesty.kind)}
      </p>
      {honesty.revisionDrift && (
        <p className="mt-2 font-mono text-xs text-dust-gray">
          revision drift: this article has changed since detection — re-verify before editing
        </p>
      )}
    </div>
  );
}
