import { getLookDirection } from "../utils/look-direction";
import { getPlayerEyePosition, type PlayerState } from "./player";

const RAY_EPSILON = 1e-6;
export const CREATURE_TARGET_RANGE = 6;
const CREATURE_RADIUS = 0.6;
const CREATURE_HEIGHT = 1.35;

type AimState = Pick<PlayerState, "x" | "y" | "z" | "yaw" | "pitch">;
type CreatureCandidate = { id: string; x: number; y: number; z: number };

export function findTargetedCreatureId(
  attacker: AimState,
  candidates: Iterable<CreatureCandidate>,
  maxDistance = CREATURE_TARGET_RANGE,
): string | undefined {
  const origin = getPlayerEyePosition(attacker);
  const direction = getLookDirection(attacker.yaw, attacker.pitch);
  let nearestDistance = maxDistance;
  let nearestTargetId: string | undefined;

  for (const candidate of candidates) {
    const hitDistance = intersectRayWithCreatureBounds(origin, direction, candidate, maxDistance);
    if (hitDistance === undefined || hitDistance > nearestDistance) continue;

    nearestDistance = hitDistance;
    nearestTargetId = candidate.id;
  }

  return nearestTargetId;
}

function creatureBounds(target: CreatureCandidate) {
  return {
    minX: target.x - CREATURE_RADIUS,
    maxX: target.x + CREATURE_RADIUS,
    minY: target.y,
    maxY: target.y + CREATURE_HEIGHT,
    minZ: target.z - CREATURE_RADIUS,
    maxZ: target.z + CREATURE_RADIUS,
  };
}

function intersectRayWithCreatureBounds(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  target: CreatureCandidate,
  maxDistance: number,
): number | undefined {
  const bounds = creatureBounds(target);
  let entry = 0;
  let exit = maxDistance;

  const xHit = intersectAxis(origin.x, direction.x, bounds.minX, bounds.maxX);
  if (!xHit) return undefined;
  entry = Math.max(entry, xHit.entry);
  exit = Math.min(exit, xHit.exit);

  const yHit = intersectAxis(origin.y, direction.y, bounds.minY, bounds.maxY);
  if (!yHit) return undefined;
  entry = Math.max(entry, yHit.entry);
  exit = Math.min(exit, yHit.exit);

  const zHit = intersectAxis(origin.z, direction.z, bounds.minZ, bounds.maxZ);
  if (!zHit) return undefined;
  entry = Math.max(entry, zHit.entry);
  exit = Math.min(exit, zHit.exit);

  if (entry > exit || exit < 0 || entry > maxDistance) return undefined;
  return Math.max(0, entry);
}

function intersectAxis(origin: number, direction: number, min: number, max: number) {
  if (Math.abs(direction) < RAY_EPSILON) {
    if (origin < min || origin > max) return undefined;
    return { entry: -Infinity, exit: Infinity };
  }

  let entry = (min - origin) / direction;
  let exit = (max - origin) / direction;
  if (entry > exit) {
    const swap = entry;
    entry = exit;
    exit = swap;
  }

  return { entry, exit };
}
