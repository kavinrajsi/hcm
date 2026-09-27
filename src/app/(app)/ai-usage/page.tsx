import { gateway } from "ai";
import { requireRole } from "@/lib/rbac";
import {
  AI_FEATURE_LABELS,
  AI_RANGES,
  AI_RANGE_LABELS,
  AI_TRIGGER_LABELS,
  aiUsageSummary,
  formatUsd,
  type AiRange,
} from "@/lib/ai-usage";
import { BarChart } from "@/components/charts/bar-chart";
import { ListCard } from "@/components/list-card";
import {
  DesktopTable,
  MobileList,
  PageHeader,
  PageShell,
} from "@/components/page";
import { Segmented } from "@/components/segmented";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "AI usage" };

// Rough rupee view of USD costs; set USD_INR_RATE to change it.
const INR_RATE = Number(process.env.USD_INR_RATE) || 88;

const num = (n: number) => n.toLocaleString("en-IN");
const inr = (usd: number) => {
  const v = usd * INR_RATE;
  return v === 0 ? "₹0" : v < 1 ? `₹${v.toFixed(2)}` : `₹${Math.round(v).toLocaleString("en-IN")}`;
};
const shortDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
const when = (d: Date) =>
  d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

/** Remaining AI Gateway credit for the Vercel team; null if unavailable. */
async function gatewayBalance(): Promise<number | null> {
  try {
    const { balance } = await gateway.getCredits();
    const n = Number(balance);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 p-3 md:p-4 dark:border-zinc-800">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums md:text-xl">
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="font-medium">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

const feature = (f: string) => AI_FEATURE_LABELS[f] ?? f;
const trigger = (t: string | null) => (t ? (AI_TRIGGER_LABELS[t] ?? t) : "—");

export default async function AiUsagePage({
  searchParams,
}: PageProps<"/ai-usage">) {
  await requireRole("HR_ADMIN");
  const raw = (await searchParams).range;
  const range: AiRange = AI_RANGES.includes(raw as AiRange)
    ? (raw as AiRange)
    : "month";

  const [s, balance] = await Promise.all([
    aiUsageSummary(range),
    gatewayBalance(),
  ]);
  const t = s.totals;

  return (
    <PageShell>
      <PageHeader
        title="AI usage"
        description={
          <>
            What HCM&apos;s AI features cost, as reported by the Vercel AI
            Gateway for each request. Amounts in US dollars; ₹ at ≈ ₹
            {INR_RATE}/$.
            {s.firstRecordedAt &&
              ` Recorded since ${when(s.firstRecordedAt)}.`}
          </>
        }
      />

      <div className="mt-5">
        <Segmented
          label="Period"
          items={AI_RANGES.map((r) => ({
            key: r,
            href: r === "month" ? "/ai-usage" : `/ai-usage?range=${r}`,
            label: AI_RANGE_LABELS[r],
            active: r === range,
          }))}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Tile label="Cost" value={formatUsd(t.cost)} sub={`≈ ${inr(t.cost)}`} />
        <Tile
          label="Requests"
          value={num(t.requests)}
          sub={t.failed > 0 ? `${num(t.failed)} failed` : undefined}
        />
        <Tile label="Posts classified" value={num(t.items)} />
        <Tile
          label="Tokens"
          value={num(t.inputTokens + t.outputTokens)}
          sub={`${num(t.inputTokens)} in · ${num(t.outputTokens)} out`}
        />
        <Tile
          label="Cost per post"
          value={formatUsd(t.costPerItem)}
          sub={t.items > 0 ? `≈ ${inr(t.costPerItem * 1000)} per 1,000` : undefined}
        />
        <Tile
          label="Gateway credit left"
          value={balance === null ? "—" : formatUsd(balance)}
          sub={
            balance === null ? "Unavailable" : "Whole Vercel team, all apps"
          }
        />
      </div>

      {t.requests === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800">
          No AI requests in this period.
          {!s.firstRecordedAt &&
            " Costs are recorded from now on; earlier usage wasn't tracked."}
        </p>
      ) : (
        <>
          <Section title="Daily cost" subtitle="Per day, Asia/Kolkata">
            <div className="min-w-0 rounded-lg border border-zinc-200 p-3 md:p-4 dark:border-zinc-800">
              <BarChart
                formatTick="usd"
                ariaLabel={`Daily AI cost, ${AI_RANGE_LABELS[range]}. Totals in the tables below.`}
                bars={s.daily.map((d) => ({
                  key: d.day,
                  label: shortDay(d.day),
                  value: d.cost,
                  display: formatUsd(d.cost),
                  detail: `${num(d.requests)} request${d.requests === 1 ? "" : "s"}`,
                }))}
              />
            </div>
          </Section>

          <Section title="Breakdown" subtitle="By feature, trigger and model">
            <MobileList isEmpty={false} empty="">
              {s.breakdown.map((b) => (
                <ListCard
                  key={`${b.feature}|${b.trigger}|${b.model}`}
                  title={feature(b.feature)}
                  subtitle={`${trigger(b.trigger)} · ${b.model}`}
                  badge={
                    <span className="font-semibold tabular-nums">
                      {formatUsd(b.cost)}
                    </span>
                  }
                  meta={`${num(b.requests)} requests · ${num(b.items)} posts · ${num(b.inputTokens + b.outputTokens)} tokens`}
                />
              ))}
            </MobileList>
            <DesktopTable>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Posts</TableHead>
                    <TableHead className="text-right">Tokens in / out</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.breakdown.map((b) => (
                    <TableRow key={`${b.feature}|${b.trigger}|${b.model}`}>
                      <TableCell>{feature(b.feature)}</TableCell>
                      <TableCell>{trigger(b.trigger)}</TableCell>
                      <TableCell className="text-zinc-500">{b.model}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {num(b.requests)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {num(b.items)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {num(b.inputTokens)} / {num(b.outputTokens)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatUsd(b.cost)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DesktopTable>
          </Section>

          <Section
            title="Recent requests"
            subtitle={`Latest ${s.recent.length} in this period`}
          >
            <MobileList isEmpty={false} empty="">
              {s.recent.map((r) => (
                <ListCard
                  key={r.id}
                  title={when(r.createdAt)}
                  subtitle={`${feature(r.feature)} · ${trigger(r.trigger)}`}
                  badge={
                    r.ok ? (
                      <span className="font-semibold tabular-nums">
                        {r.costUsd === null ? "—" : formatUsd(r.costUsd)}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
                        Failed
                      </span>
                    )
                  }
                  meta={`${num(r.items)} posts · ${num(r.inputTokens)} in / ${num(r.outputTokens)} out`}
                />
              ))}
            </MobileList>
            <DesktopTable>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Feature</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead className="text-right">Posts</TableHead>
                    <TableHead className="text-right">Tokens in / out</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.recent.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">
                        {when(r.createdAt)}
                      </TableCell>
                      <TableCell>{feature(r.feature)}</TableCell>
                      <TableCell>{trigger(r.trigger)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {num(r.items)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {num(r.inputTokens)} / {num(r.outputTokens)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.ok ? (
                          r.costUsd === null ? (
                            "—"
                          ) : (
                            formatUsd(r.costUsd)
                          )
                        ) : (
                          <span className="text-rose-600 dark:text-rose-400">
                            Failed
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DesktopTable>
          </Section>
        </>
      )}
    </PageShell>
  );
}
