import type { SearchPly } from "ts-core";

export const DRIVER_NAMES = ["game-engine", "teacher", "hedgehog"] as const;

export type DriverName = (typeof DRIVER_NAMES)[number];

export type SideId = "a" | "b";

/** Optional knobs a side may be given. `url` is the endpoint, not one of these. */
export type DriverParam = "ply";

const SUPPORTED: Record<DriverName, readonly DriverParam[]> = {
  "game-engine": [],
  teacher: [],
  hedgehog: ["ply"],
};

export type RequestedParams = {
  url?: string;
  ply?: SearchPly;
};

export type SideSpec = {
  id: SideId;
  driver: DriverName;
  url: string;
  ply?: SearchPly;
  label: string;
};

export function isDriverName(name: string): name is DriverName {
  return (DRIVER_NAMES as readonly string[]).includes(name);
}

export function defaultDriverUrl(driver: DriverName): string {
  switch (driver) {
    case "game-engine":
      return process.env.ENGINE_BASE_URL ?? "http://127.0.0.1:3000";
    case "teacher":
      return process.env.BGWEB_BASE_URL ?? "http://127.0.0.1:8080";
    case "hedgehog":
      return process.env.HEDGEHOG_BASE_URL ?? "http://127.0.0.1:8090";
  }
}

export function sideLabel(driver: DriverName, ply?: SearchPly): string {
  return ply === undefined ? driver : `${driver}-ply${ply}`;
}

/**
 * Keep a requested parameter only when this driver lists it.
 * Hedgehog's omitted `ply` becomes 1 (GnuBG 1-ply).
 * Anything else is a warning and is dropped.
 */
export function resolveSide(
  id: SideId,
  driver: DriverName,
  requested: RequestedParams,
): { side: SideSpec; warnings: string[] } {
  const supported = new Set<DriverParam>(SUPPORTED[driver]);
  const warnings: string[] = [];
  let ply: SearchPly | undefined;
  if (requested.ply !== undefined) {
    if (supported.has("ply")) ply = requested.ply;
    else warnings.push(`warning: ${id} (${driver}) does not support ply; ignoring --${id}-ply`);
  } else if (supported.has("ply")) {
    ply = 1;
  }
  return {
    side: {
      id,
      driver,
      url: requested.url ?? defaultDriverUrl(driver),
      ply,
      label: sideLabel(driver, ply),
    },
    warnings,
  };
}
