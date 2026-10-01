import { db } from "@/lib/db";
import { ALL_GUIDE_SHOTS } from "@/lib/mcp-guide";

// Guide screenshots uploaded by HR on MCP access: private Blob files under
// mcp-guide/, listed in one AppSetting so pages don't have to list Blob.
// Served publicly (the guide is a public page) by /api/mcp-guide/[file].

export const GUIDE_SHOTS_SETTING = "mcpGuideShots";

export type ShotMap = Record<string, { pathname: string; version: number }>;

export const isGuideShot = (file: string) => ALL_GUIDE_SHOTS.some((shot) => shot.file === file);

export async function getShotMap(): Promise<ShotMap> {
  const row = await db.appSetting.findUnique({ where: { key: GUIDE_SHOTS_SETTING } });
  const value = row?.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const map: ShotMap = {};
  for (const [file, entry] of Object.entries(value as Record<string, unknown>)) {
    const item = entry as { pathname?: unknown; version?: unknown };
    if (isGuideShot(file) && typeof item?.pathname === "string" && typeof item.version === "number")
      map[file] = { pathname: item.pathname, version: item.version };
  }
  return map;
}

export async function saveShotMap(map: ShotMap): Promise<void> {
  await db.appSetting.upsert({
    where: { key: GUIDE_SHOTS_SETTING },
    create: { key: GUIDE_SHOTS_SETTING, value: map },
    update: { value: map },
  });
}

/** Public URL for an uploaded shot; the version busts caches on replace. */
export const shotUrl = (file: string, version: number) => `/api/mcp-guide/${file}?v=${version}`;

/** file → URL for every uploaded shot. */
export async function shotUrls(): Promise<Record<string, string>> {
  const map = await getShotMap();
  return Object.fromEntries(Object.entries(map).map(([file, entry]) => [file, shotUrl(file, entry.version)]));
}
