import { gateway } from "ai";
import { requirePageRole } from "@/lib/rbac";
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
import { formatDateTime } from "@/lib/format-date";
import { madmaxCap, madmaxMonthInr, madmaxSpendByUser } from "@/lib/madmax/cap";
import { CapForm } from "./cap-form";

export const metadata = { title: "AI usage" };

// Rough rupee view of USD costs; set USD_INR_RATE to change it.
const INR_RATE = Number(process.env.USD_INR_RATE) || 88;

const formatNumber = (value: number) => value.toLocaleString("en-IN");
const inr = (usd: number) => {
  const amount = usd * INR_RATE;
  return amount === 0
    ? "₹0"
    : amount < 1
      ? `₹${amount.toFixed(2)}`
      : `₹${Math.round(amount).toLocaleString("en-IN")}`;
};
const rupees = (amount: number) =>
  amount < 1 && amount > 0
    ? `₹${amount.toFixed(2)}`
    : `₹${Math.round(amount).toLocaleString("en-IN")}`;
const shortDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
const when = (date: Date) => formatDateTime(date);

/** Remaining AI Gateway credit for the Vercel team; null if unavailable. */
async function gatewayBalance(): Promise<number | null> {
  try {
    const { balance } = await gateway.getCredits();
    const credits = Number(balance);
    return Number.isFinite(credits) ? credits : null;
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

const feature = (featureKey: string) =>
  AI_FEATURE_LABELS[featureKey] ?? featureKey;
const trigger = (triggerKey: string | null) =>
  triggerKey ? (AI_TRIGGER_LABELS[triggerKey] ?? triggerKey) : "—";

export default async function AiUsagePage({
  searchParams,
}: PageProps<"/ai-usage">) {
  await requirePageRole("HR_ADMIN");
  const raw = (await searchParams).range;
  const range: AiRange = AI_RANGES.includes(raw as AiRange)
    ? (raw as AiRange)
    : "month";

  const [summary, balance, cap, madmaxUsers, madmaxMonth] = await Promise.all([
    aiUsageSummary(range),
    gatewayBalance(),
    madmaxCap(),
    madmaxSpendByUser(),
    madmaxMonthInr(),
  ]);
  const totals = summary.totals;

  return (
    <PageShell>
      <PageHeader
        title="AI usage"
        description={
          <>
            What HCM&apos;s AI features cost, as reported by the Vercel AI
            Gateway for each request. Amounts in US dollars; ₹ at ≈ ₹{INR_RATE}
            /$.
            {summary.firstRecordedAt &&
              ` Recorded since ${when(summary.firstRecordedAt)}.`}
          </>
        }
      />

      <div className="mt-5">
        <Segmented
          label="Period"
          items={AI_RANGES.map((option) => ({
            key: option,
            href:
              option === "month" ? "/ai-usage" : `/ai-usage?range=${option}`,
            label: AI_RANGE_LABELS[option],
            active: option === range,
          }))}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Tile
          label="Cost"
          value={formatUsd(totals.cost)}
          sub={`≈ ${inr(totals.cost)}`}
        />
        <Tile
          label="Requests"
          value={formatNumber(totals.requests)}
          sub={
            totals.failed > 0
              ? `${formatNumber(totals.failed)} failed`
              : undefined
          }
        />
        <Tile label="Posts classified" value={formatNumber(totals.items)} />
        <Tile
          label="Tokens"
          value={formatNumber(totals.inputTokens + totals.outputTokens)}
          sub={`${formatNumber(totals.inputTokens)} in · ${formatNumber(totals.outputTokens)} out`}
        />
        <Tile
          label="Cost per post"
          value={formatUsd(totals.costPerItem)}
          sub={
            totals.items > 0
              ? `≈ ${inr(totals.costPerItem * 1000)} per 1,000`
              : undefined
          }
        />
        <Tile
          label="Gateway credit left"
          value={balance === null ? "—" : formatUsd(balance)}
          sub={balance === null ? "Unavailable" : "Whole Vercel team, all apps"}
        />
      </div>

      <Section
        title="MadMax AI cap"
        subtitle="Monthly limits in rupees (Asia/Kolkata months). At a limit, MadMax stops answering until the 1st. Applies to everyone, HR included."
      >
        <div className="rounded-lg border border-zinc-200 p-3 md:p-4 dark:border-zinc-800">
          <CapForm cap={cap} />
          <p className="mt-4 text-sm">
            This month:{" "}
            <span className="font-medium tabular-nums">
              {rupees(madmaxMonth)}
            </span>
            {cap.totalInr !== null && (
              <span className="text-zinc-500">
                {" "}
                of {rupees(cap.totalInr)} company cap
              </span>
            )}
          </p>
          {madmaxUsers.length > 0 && (
            <ul className="mt-2 divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
              {madmaxUsers.map((row) => {
                const over =
                  cap.perUserInr !== null && row.spentInr >= cap.perUserInr;
                return (
                  <li
                    key={row.userId}
                    className="flex items-center justify-between gap-3 py-1.5"
                  >
                    <span className="min-w-0 truncate">{row.name}</span>
                    <span
                      className={
                        over
                          ? "shrink-0 font-medium text-red-600 tabular-nums dark:text-red-400"
                          : "shrink-0 text-zinc-500 tabular-nums"
                      }
                    >
                      {rupees(row.spentInr)}
                      {cap.perUserInr !== null &&
                        ` / ${rupees(cap.perUserInr)}`}
                      {` · ${formatNumber(row.requests)} requests`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Section>

      {totals.requests === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800">
          No AI requests in this period.
          {!summary.firstRecordedAt &&
            " Costs are recorded from now on; earlier usage wasn't tracked."}
        </p>
      ) : (
        <>
          <Section title="Daily cost" subtitle="Per day, Asia/Kolkata">
            <div className="min-w-0 rounded-lg border border-zinc-200 p-3 md:p-4 dark:border-zinc-800">
              <BarChart
                formatTick="usd"
                ariaLabel={`Daily AI cost, ${AI_RANGE_LABELS[range]}. Totals in the tables below.`}
                bars={summary.daily.map((bucket) => ({
                  key: bucket.day,
                  label: shortDay(bucket.day),
                  value: bucket.cost,
                  display: formatUsd(bucket.cost),
                  detail: `${formatNumber(bucket.requests)} request${bucket.requests === 1 ? "" : "s"}`,
                }))}
              />
            </div>
          </Section>

          <Section title="Breakdown" subtitle="By feature, trigger and model">
            <MobileList isEmpty={false} empty="">
              {summary.breakdown.map((row) => (
                <ListCard
                  key={`${row.feature}|${row.trigger}|${row.model}`}
                  title={feature(row.feature)}
                  subtitle={`${trigger(row.trigger)} · ${row.model}`}
                  badge={
                    <span className="font-semibold tabular-nums">
                      {formatUsd(row.cost)}
                    </span>
                  }
                  meta={`${formatNumber(row.requests)} requests · ${formatNumber(row.items)} posts · ${formatNumber(row.inputTokens + row.outputTokens)} tokens`}
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
                    <TableHead className="text-right">
                      Tokens in / out
                    </TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.breakdown.map((row) => (
                    <TableRow
                      key={`${row.feature}|${row.trigger}|${row.model}`}
                    >
                      <TableCell>{feature(row.feature)}</TableCell>
                      <TableCell>{trigger(row.trigger)}</TableCell>
                      <TableCell className="text-zinc-500">
                        {row.model}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.requests)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.items)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.inputTokens)} /{" "}
                        {formatNumber(row.outputTokens)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatUsd(row.cost)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DesktopTable>
          </Section>

          <Section
            title="Recent requests"
            subtitle={`Latest ${summary.recent.length} in this period`}
          >
            <MobileList isEmpty={false} empty="">
              {summary.recent.map((request) => (
                <ListCard
                  key={request.id}
                  title={when(request.createdAt)}
                  subtitle={`${feature(request.feature)} · ${trigger(request.trigger)}`}
                  badge={
                    request.ok ? (
                      <span className="font-semibold tabular-nums">
                        {request.costUsd === null
                          ? "—"
                          : formatUsd(request.costUsd)}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
                        Failed
                      </span>
                    )
                  }
                  meta={`${formatNumber(request.items)} posts · ${formatNumber(request.inputTokens)} in / ${formatNumber(request.outputTokens)} out`}
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
                    <TableHead className="text-right">
                      Tokens in / out
                    </TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.recent.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="whitespace-nowrap">
                        {when(request.createdAt)}
                      </TableCell>
                      <TableCell>{feature(request.feature)}</TableCell>
                      <TableCell>{trigger(request.trigger)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(request.items)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(request.inputTokens)} /{" "}
                        {formatNumber(request.outputTokens)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {request.ok ? (
                          request.costUsd === null ? (
                            "—"
                          ) : (
                            formatUsd(request.costUsd)
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
