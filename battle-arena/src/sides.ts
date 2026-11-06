export const DRIVER_NAMES = ["game-engine", "game-engine-fast", "teacher", "hedgehog", "xg"] as const;

export type DriverName = (typeof DRIVER_NAMES)[number];

export type SideId = "a" | "b";

/** Highest `ply` any driver accepts (game-engine-fast's cap, ADR 0028). */
export const MAX_PLY = 4;

/**
 * Drivers that take a GnuBG `ply` (0 = net, 1 = one opponent roll, ...), with their range and
 * the value used when the side does not set one. Every other driver drops `ply` with a warning.
 */
const PLY: Partial<Record<DriverName, { max: number; default: number }>> = {
  hedgehog: { max: 1, default: 1 },
  "game-engine-fast": { max: MAX_PLY, default: 0 },
};

export type RequestedParams = {
  url?: string;
  ply?: number;
};

export type SideSpec = {
  id: SideId;
  driver: DriverName;
  url: string;
  ply?: number;
  label: string;
};

export function isDriverName(name: string): name is DriverName {
  return (DRIVER_NAMES as readonly string[]).includes(name);
}

export function defaultDriverUrl(driver: DriverName): string {
  switch (driver) {
    case "game-engine":
      return process.env.ENGINE_BASE_URL ?? "http://127.0.0.1:3000";
    case "game-engine-fast":
      return process.env.FAST_ENGINE_BASE_URL ?? "http://127.0.0.1:3001";
    case "teacher":
      return process.env.BGWEB_BASE_URL ?? "http://127.0.0.1:8080";
    case "hedgehog":
      return process.env.HEDGEHOG_BASE_URL ?? "http://127.0.0.1:8090";
    case "xg":
      return process.env.XG_BASE_URL ?? "http://127.0.0.1:8091";
  }
}

export function sideLabel(driver: DriverName, ply?: number): string {
  return ply === undefined ? driver : `${driver}-ply${ply}`;
}

/**
 * Keep a requested `ply` only when this driver takes one; fill in the driver's default otherwise.
 * A `ply` above the driver's maximum is an error. `ply` on any other driver is a warning and is
 * dropped.
 */
export function resolveSide(
  id: SideId,
  driver: DriverName,
  requested: RequestedParams,
): { side: SideSpec; warnings: string[] } {
  const range = PLY[driver];
  const warnings: string[] = [];
  let ply: number | undefined;
  if (requested.ply !== undefined) {
    if (!range) {
      warnings.push(`warning: ${id} (${driver}) does not support ply; ignoring --${id}-ply`);
    } else if (requested.ply > range.max) {
      throw new Error(`--${id}-ply ${requested.ply} is above ${driver}'s maximum ${range.max}`);
    } else {
      ply = requested.ply;
    }
  } else if (range) {
    ply = range.default;
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
