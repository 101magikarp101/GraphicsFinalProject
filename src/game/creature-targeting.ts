import { getLookDirection } from "../utils/look-direction";
import { getPlayerEyePosition, type PlayerState } from "./player";

const RAY_EPSILON = 1e-6;
export const CREATURE_TARGET_RANGE = 8;
const CREATURE_RADIUS = 1.2;
const CREATURE_HEIGHT = 2.15;
const AIM_ASSIST_RADIUS = 2.05;

type AimState = Pick<PlayerState, "x" | "y" | "z" | "yaw" | "pitch">;
type CreatureCandidate = { id: string; x: number; y: number; z: number };

export function findTargetedCreatureId(
  attacker: AimState,
  candidates: Iterable<CreatureCandidate>,
  maxDistance = CREATURE_TARGET_RANGE,
): string | undefined {
  const origin = getPlayerEyePosition(attacker);
  const direction = getLookDirection(attacker.yaw, attacker.pitch);
  let nearestDirectDistance = maxDistance;
  let nearestDirectTargetId: string | undefined;
  let nearestAssistDistance = maxDistance;
  let nearestAssistTargetId: string | undefined;

  for (const candidate of candidates) {
    const hitDistance = intersectRayWithCreatureBounds(origin, direction, candidate, maxDistance);
    if (hitDistance !== undefined && hitDistance <= nearestDirectDistance) {
      nearestDirectDistance = hitDistance;
      nearestDirectTargetId = candidate.id;
      continue;
    }

    const assistDistance = aimAssistDistance(origin, direction, candidate, maxDistance);
    if (assistDistance === undefined || assistDistance > nearestAssistDistance) continue;

    nearestAssistDistance = assistDistance;
    nearestAssistTargetId = candidate.id;
  }

  return nearestDirectTargetId ?? nearestAssistTargetId;
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

function aimAssistDistance(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  target: CreatureCandidate,
  maxDistance: number,
): number | undefined {
  const centerX = target.x;
  const centerY = target.y + CREATURE_HEIGHT * 0.5;
  const centerZ = target.z;

  const vx = centerX - origin.x;
  const vy = centerY - origin.y;
  const vz = centerZ - origin.z;

  const along = vx * direction.x + vy * direction.y + vz * direction.z;
  if (along < 0 || along > maxDistance) return undefined;

  const nearestX = origin.x + direction.x * along;
  const nearestY = origin.y + direction.y * along;
  const nearestZ = origin.z + direction.z * along;

  const dx = centerX - nearestX;
  const dy = centerY - nearestY;
  const dz = centerZ - nearestZ;
  const perpendicular = Math.hypot(dx, dy, dz);
  if (perpendicular > AIM_ASSIST_RADIUS) return undefined;

  return along;
}
