import Link from "next/link";
import { BarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { LineChart } from "@/components/charts/line-chart";
import type { WidgetResult } from "@/lib/dashboard/run";
import { cn } from "@/lib/utils";

// Dashboard: draws one widget's result. No server imports, so the builder's
// live preview (client) and the dashboard (server) share it. Clicking opens
// the matching page, filtered, when the viewer can open it.

export function WidgetView({ result, title }: { result: WidgetResult; title: string }) {
  if (result.kind !== "message" && result.period) {
    return (
      <>
        <p className="-mt-1 mb-2 text-xs text-sky-700 dark:text-sky-400">{result.period}</p>
        <WidgetBody result={result} title={title} />
      </>
    );
  }
  return <WidgetBody result={result} title={title} />;
}

function WidgetBody({ result, title }: { result: WidgetResult; title: string }) {
  if (result.kind === "message") {
    return <p className="text-sm text-zinc-500">{result.message}</p>;
  }

  if (result.kind === "number") {
    const tone =
      result.change?.startsWith("+") ? "text-emerald-700 dark:text-emerald-400" : result.change?.startsWith("−") ? "text-rose-600 dark:text-rose-400" : "text-zinc-500";
    const body = (
      <>
        <div className="text-3xl font-semibold tracking-tight tabular-nums">{result.display}</div>
        {result.change && (
          <div className="mt-1 text-xs text-zinc-500">
            <span className={cn("font-medium", tone)}>{result.change}</span> vs {result.previousDisplay} the period before
          </div>
        )}
      </>
    );
    return result.href ? (
      <Link href={result.href} className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {body}
      </Link>
    ) : (
      body
    );
  }

  const groups = result.groups;
  if (groups.length === 0 || groups.every((group) => group.value === 0)) {
    return <p className="text-sm text-zinc-500">Nothing for these filters yet.</p>;
  }

  if (result.byTime && (result.chart === "bar" || result.chart === "line")) {
    return result.chart === "line" ? (
      <div className="viz-root">
        <LineChart
          labels={groups.map((group) => group.label)}
          series={[{ key: "value", label: result.label, color: "var(--viz-series-1)", values: groups.map((group) => group.value) }]}
          ariaLabel={`${title}: ${result.label} over time, total ${result.total}`}
        />
      </div>
    ) : (
      <div className="viz-root">
        <BarChart
          bars={groups.map((group) => ({ key: group.key, label: group.label, value: group.value, display: group.display }))}
          ariaLabel={`${title}: ${result.label} over time, total ${result.total}`}
        />
      </div>
    );
  }

  if (result.chart === "pie") {
    return <DonutChart slices={groups} ariaLabel={title} total={result.total} />;
  }

  if (result.chart === "table") {
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-zinc-500">
            <th className="pb-1 font-medium">{result.byTime ? "Period" : "Name"}</th>
            <th className="pb-1 text-right font-medium">{result.label}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {groups.map((group) => (
            <tr key={group.key}>
              <td className="py-1.5 pr-3 break-words">
                {group.href ? (
                  <Link href={group.href} className="hover:underline">
                    {group.label}
                  </Link>
                ) : (
                  group.label
                )}
              </td>
              <td className="py-1.5 text-right font-medium tabular-nums">{group.display}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-zinc-200 dark:border-zinc-800">
            <td className="pt-1.5 text-xs text-zinc-500">Total</td>
            <td className="pt-1.5 text-right font-semibold tabular-nums">{result.total}</td>
          </tr>
        </tfoot>
      </table>
    );
  }

  // Bars (or a line) across names: horizontal bars, each one a link.
  const max = Math.max(1, ...groups.map((group) => group.value));
  return (
    <ul className="viz-root flex flex-col gap-2.5">
      {groups.map((group) => {
        const row = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{group.label}</span>
              <span className="font-semibold tabular-nums">{group.display}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-2 rounded-full"
                style={{
                  width: `${Math.max(1, (group.value / max) * 100)}%`,
                  background: group.key === "__other" ? "var(--viz-other)" : "var(--viz-bar)",
                }}
              />
            </div>
          </>
        );
        return (
          <li key={group.key}>
            {group.href ? (
              <Link href={group.href} className="block rounded outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}
