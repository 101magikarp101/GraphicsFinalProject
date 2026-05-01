export const SHADOW_TECHNIQUES = ["ambient-occlusion", "shadow-map", "shadow-volume"] as const;

export type ShadowTechnique = (typeof SHADOW_TECHNIQUES)[number];

export function isShadowTechnique(value: string): value is ShadowTechnique {
  return (SHADOW_TECHNIQUES as readonly string[]).includes(value);
}

export function shadowTechniqueIndex(value: ShadowTechnique): number {
  return SHADOW_TECHNIQUES.indexOf(value);
}
