import type { EntityPassDef } from "./pipeline";

const PART_HEAD = 0;
const PART_BODY = 1;
const PART_LEFT_FRONT_LEG = 2;
const PART_RIGHT_FRONT_LEG = 3;
const PART_LEFT_BACK_LEG = 4;
const PART_RIGHT_BACK_LEG = 5;
const PART_TAIL = 6;

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
      part: PART_TAIL,
      paletteMix: 0.65,
      color: [0.95, 0.95, 0.95],
      pivot: [0, legHeight + bodyHeight * 0.8, -bodyLength / 2],
      min: [-0.08, legHeight + bodyHeight * 0.78, -bodyLength / 2 - tailLength],
      max: [0.08, legHeight + bodyHeight * 0.88, -bodyLength / 2],
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
