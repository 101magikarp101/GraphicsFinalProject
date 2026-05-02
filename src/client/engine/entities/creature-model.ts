import type { EntityPassDef } from "./pipeline";

const PART_HEAD = 0;
const PART_BODY = 1;
const PART_LEFT_FRONT_LEG = 2;
const PART_RIGHT_FRONT_LEG = 3;
const PART_LEFT_BACK_LEG = 4;
const PART_RIGHT_BACK_LEG = 5;
const PART_TAIL = 6;
const PART_NECK = 7;
const PART_TAIL_TIP = 8;
const PART_LEFT_WING = 9;
const PART_RIGHT_WING = 10;
const PART_HORN = 11;
const PART_LEFT_EYE = 12;
const PART_RIGHT_EYE = 13;
const PART_MOUTH = 14;
const PART_DORSAL_FIN = 15;
const PART_CREST = 16;
const PART_SPIKE_ROW = 17;

interface BoxDef {
  part: number;
  paletteMix: number;
  color: readonly [number, number, number];
  pivot: readonly [number, number, number];
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}

interface MeshBuffers {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  parts: number[];
  pivots: number[];
  paletteMix: number[];
  indices: number[];
}

export function createCreatureModelGeometry(): EntityPassDef["geometry"] {
  const mesh: MeshBuffers = {
    positions: [],
    normals: [],
    uvs: [],
    colors: [],
    parts: [],
    pivots: [],
    paletteMix: [],
    indices: [],
  };

  const bodyLength = 0.8;
  const bodyHeight = 0.36;
  const bodyWidth = 0.34;
  const legWidth = 0.14;
  const legHeight = 0.34;
  const headSize = 0.28;
  const tailLength = 0.22;

  const boxes: BoxDef[] = [
    {
      part: PART_BODY,
      paletteMix: 0.15,
      color: [0.86, 0.86, 0.86],
      pivot: [0, legHeight + bodyHeight / 2, 0],
      min: [-bodyWidth, legHeight, -bodyLength / 2],
      max: [bodyWidth, legHeight + bodyHeight, bodyLength / 2],
    },
    {
      part: PART_HEAD,
      paletteMix: 0.0,
      color: [1, 1, 1],
      pivot: [0, legHeight + bodyHeight * 0.9, bodyLength / 2],
      min: [-headSize / 2, legHeight + bodyHeight * 0.72, bodyLength / 2],
      max: [headSize / 2, legHeight + bodyHeight * 0.72 + headSize, bodyLength / 2 + headSize],
    },
    {
      part: PART_LEFT_EYE,
      paletteMix: 0.0,
      color: [0.06, 0.06, 0.08],
      pivot: [-headSize * 0.22, legHeight + bodyHeight * 0.9, bodyLength / 2 + headSize * 0.93],
      min: [-headSize * 0.33, legHeight + bodyHeight * 0.865, bodyLength / 2 + headSize * 0.9],
      max: [-headSize * 0.11, legHeight + bodyHeight * 0.965, bodyLength / 2 + headSize * 1.06],
    },
    {
      part: PART_RIGHT_EYE,
      paletteMix: 0.0,
      color: [0.06, 0.06, 0.08],
      pivot: [headSize * 0.22, legHeight + bodyHeight * 0.9, bodyLength / 2 + headSize * 0.93],
      min: [headSize * 0.11, legHeight + bodyHeight * 0.865, bodyLength / 2 + headSize * 0.9],
      max: [headSize * 0.33, legHeight + bodyHeight * 0.965, bodyLength / 2 + headSize * 1.06],
    },
    {
      part: PART_MOUTH,
      paletteMix: 0.0,
      color: [0.18, 0.08, 0.08],
      pivot: [0, legHeight + bodyHeight * 0.79, bodyLength / 2 + headSize * 0.99],
      min: [-headSize * 0.2, legHeight + bodyHeight * 0.735, bodyLength / 2 + headSize * 0.93],
      max: [headSize * 0.2, legHeight + bodyHeight * 0.835, bodyLength / 2 + headSize * 1.11],
    },
    {
      part: PART_NECK,
      paletteMix: 0.22,
      color: [0.92, 0.92, 0.92],
      pivot: [0, legHeight + bodyHeight * 0.82, bodyLength * 0.42],
      min: [-0.1, legHeight + bodyHeight * 0.7, bodyLength * 0.33],
      max: [0.1, legHeight + bodyHeight * 0.95, bodyLength * 0.58],
    },
    {
      part: PART_TAIL,
      paletteMix: 0.65,
      color: [0.95, 0.95, 0.95],
      pivot: [0, legHeight + bodyHeight * 0.8, -bodyLength / 2],
      min: [-0.08, legHeight + bodyHeight * 0.78, -bodyLength / 2 - tailLength],
      max: [0.08, legHeight + bodyHeight * 0.88, -bodyLength / 2],
    },
    {
      part: PART_TAIL_TIP,
      paletteMix: 0.78,
      color: [0.98, 0.98, 0.98],
      pivot: [0, legHeight + bodyHeight * 0.82, -bodyLength / 2 - tailLength],
      min: [-0.06, legHeight + bodyHeight * 0.8, -bodyLength / 2 - tailLength - 0.2],
      max: [0.06, legHeight + bodyHeight * 0.9, -bodyLength / 2 - tailLength],
    },
    {
      part: PART_LEFT_WING,
      paletteMix: 0.48,
      color: [0.9, 0.9, 0.9],
      pivot: [-bodyWidth * 0.5, legHeight + bodyHeight * 0.95, -0.03],
      min: [-bodyWidth - 0.28, legHeight + bodyHeight * 0.9, -0.1],
      max: [-bodyWidth * 0.5, legHeight + bodyHeight * 1.02, 0.18],
    },
    {
      part: PART_RIGHT_WING,
      paletteMix: 0.48,
      color: [0.9, 0.9, 0.9],
      pivot: [bodyWidth * 0.5, legHeight + bodyHeight * 0.95, -0.03],
      min: [bodyWidth * 0.5, legHeight + bodyHeight * 0.9, -0.1],
      max: [bodyWidth + 0.28, legHeight + bodyHeight * 1.02, 0.18],
    },
    {
      part: PART_HORN,
      paletteMix: 0.7,
      color: [0.96, 0.96, 0.96],
      pivot: [0, legHeight + bodyHeight * 1.08, bodyLength / 2 + headSize * 0.2],
      min: [-0.05, legHeight + bodyHeight * 1.0, bodyLength / 2 + headSize * 0.1],
      max: [0.05, legHeight + bodyHeight * 1.2, bodyLength / 2 + headSize * 0.35],
    },
    {
      part: PART_DORSAL_FIN,
      paletteMix: 0.62,
      color: [0.95, 0.95, 0.95],
      pivot: [0, legHeight + bodyHeight * 1.0, -0.02],
      min: [-0.04, legHeight + bodyHeight * 0.96, -bodyLength * 0.18],
      max: [0.04, legHeight + bodyHeight * 1.26, bodyLength * 0.24],
    },
    {
      part: PART_CREST,
      paletteMix: 0.57,
      color: [0.92, 0.92, 0.92],
      pivot: [0, legHeight + bodyHeight * 1.0, bodyLength / 2 + headSize * 0.08],
      min: [-0.035, legHeight + bodyHeight * 1.0, bodyLength / 2 - headSize * 0.05],
      max: [0.035, legHeight + bodyHeight * 1.24, bodyLength / 2 + headSize * 0.26],
    },
    {
      part: PART_SPIKE_ROW,
      paletteMix: 0.8,
      color: [0.96, 0.96, 0.96],
      pivot: [0, legHeight + bodyHeight * 1.02, -bodyLength * 0.06],
      min: [-0.03, legHeight + bodyHeight * 0.98, -bodyLength * 0.34],
      max: [0.03, legHeight + bodyHeight * 1.2, bodyLength * 0.12],
    },
    {
      part: PART_LEFT_FRONT_LEG,
      paletteMix: 0.35,
      color: [0.9, 0.9, 0.9],
      pivot: [-bodyWidth * 0.7, legHeight + bodyHeight * 0.9, bodyLength * 0.3],
      min: [-bodyWidth * 0.85, 0, bodyLength * 0.15],
      max: [-bodyWidth * 0.85 + legWidth, legHeight, bodyLength * 0.15 + legWidth],
    },
    {
      part: PART_RIGHT_FRONT_LEG,
      paletteMix: 0.35,
      color: [0.9, 0.9, 0.9],
      pivot: [bodyWidth * 0.7, legHeight + bodyHeight * 0.9, bodyLength * 0.3],
      min: [bodyWidth * 0.85 - legWidth, 0, bodyLength * 0.15],
      max: [bodyWidth * 0.85, legHeight, bodyLength * 0.15 + legWidth],
    },
    {
      part: PART_LEFT_BACK_LEG,
      paletteMix: 0.35,
      color: [0.9, 0.9, 0.9],
      pivot: [-bodyWidth * 0.7, legHeight + bodyHeight * 0.9, -bodyLength * 0.3],
      min: [-bodyWidth * 0.85, 0, -bodyLength * 0.15 - legWidth],
      max: [-bodyWidth * 0.85 + legWidth, legHeight, -bodyLength * 0.15],
    },
    {
      part: PART_RIGHT_BACK_LEG,
      paletteMix: 0.35,
      color: [0.9, 0.9, 0.9],
      pivot: [bodyWidth * 0.7, legHeight + bodyHeight * 0.9, -bodyLength * 0.3],
      min: [bodyWidth * 0.85 - legWidth, 0, -bodyLength * 0.15 - legWidth],
      max: [bodyWidth * 0.85, legHeight, -bodyLength * 0.15],
    },
  ];

  for (const box of boxes) appendBox(mesh, box);

  return {
    positions: new Float32Array(mesh.positions),
    indices: new Uint32Array(mesh.indices),
    normals: new Float32Array(mesh.normals),
    uvs: new Float32Array(mesh.uvs),
    extraAttributes: [
      { name: "aColor", size: 3, data: new Float32Array(mesh.colors) },
      { name: "aPart", size: 1, data: new Float32Array(mesh.parts) },
      { name: "aPivot", size: 3, data: new Float32Array(mesh.pivots) },
      { name: "aPaletteMix", size: 1, data: new Float32Array(mesh.paletteMix) },
    ],
  };
}

function appendBox(mesh: MeshBuffers, box: BoxDef): void {
  const [minX, minY, minZ] = box.min;
  const [maxX, maxY, maxZ] = box.max;

  const faces = [
    {
      normal: [0, 1, 0, 0],
      indices: [0, 1, 2, 0, 2, 3],
      corners: [
        [minX, maxY, minZ],
        [minX, maxY, maxZ],
        [maxX, maxY, maxZ],
        [maxX, maxY, minZ],
      ],
    },
    {
      normal: [-1, 0, 0, 0],
      indices: [1, 0, 2, 2, 0, 3],
      corners: [
        [minX, maxY, maxZ],
        [minX, minY, maxZ],
        [minX, minY, minZ],
        [minX, maxY, minZ],
      ],
    },
    {
      normal: [1, 0, 0, 0],
      indices: [0, 1, 2, 0, 2, 3],
      corners: [
        [maxX, maxY, maxZ],
        [maxX, minY, maxZ],
        [maxX, minY, minZ],
        [maxX, maxY, minZ],
      ],
    },
    {
      normal: [0, 0, 1, 0],
      indices: [1, 0, 2, 2, 0, 3],
      corners: [
        [maxX, maxY, maxZ],
        [maxX, minY, maxZ],
        [minX, minY, maxZ],
        [minX, maxY, maxZ],
      ],
    },
    {
      normal: [0, 0, -1, 0],
      indices: [0, 1, 2, 0, 2, 3],
      corners: [
        [maxX, maxY, minZ],
        [maxX, minY, minZ],
        [minX, minY, minZ],
        [minX, maxY, minZ],
      ],
    },
    {
      normal: [0, -1, 0, 0],
      indices: [1, 0, 2, 2, 0, 3],
      corners: [
        [minX, minY, minZ],
        [minX, minY, maxZ],
        [maxX, minY, maxZ],
        [maxX, minY, minZ],
      ],
    },
  ] as const;

  const faceUv = [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 0],
  ] as const;

  for (const face of faces) {
    const faceBase = mesh.positions.length / 4;
    for (let i = 0; i < 4; i++) {
      const [x, y, z] = face.corners[i] as readonly [number, number, number];
      const [u, v] = faceUv[i] as readonly [number, number];
      mesh.positions.push(x, y, z, 1);
      mesh.normals.push(...face.normal);
      mesh.uvs.push(u, v);
      mesh.colors.push(...box.color);
      mesh.parts.push(box.part);
      mesh.pivots.push(...box.pivot);
      mesh.paletteMix.push(box.paletteMix);
    }
    for (const index of face.indices) mesh.indices.push(faceBase + index);
  }
}
