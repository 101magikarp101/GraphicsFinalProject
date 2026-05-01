import { Mat4, Vec3 } from "gl-matrix";
import { WebGLUtilities } from "@/lib/webglutils/CanvasAnimation";
import { RenderPass } from "@/lib/webglutils/RenderPass";
import type { EntityDrawData, EntityPassDef } from "../entities/pipeline";
import { BlockHighlight } from "./block-highlight";
import { Cube } from "./cube";
import { GpuTimer } from "./gpu-timer";
import { Quad } from "./quad";
import blankCubeFSText from "./shaders/blankCube.frag";
import blankCubeVSText from "./shaders/blankCube.vert";
import cloudsFSText from "./shaders/clouds.frag";
import cloudsVSText from "./shaders/clouds.vert";
import debugLightArrowFSText from "./shaders/debugLightArrow.frag";
import debugLightArrowVSText from "./shaders/debugLightArrow.vert";
import debugShadowVolumeFSText from "./shaders/debugShadowVolume.frag";
import shadowMapFSText from "./shaders/shadowMap.frag";
import shadowMapVSText from "./shaders/shadowMap.vert";
import shadowOverlayFSText from "./shaders/shadowOverlay.frag";
import shadowOverlayVSText from "./shaders/shadowOverlay.vert";
import shadowVolumeFSText from "./shaders/shadowVolume.frag";
import shadowVolumeVSText from "./shaders/shadowVolume.vert";
import skyboxFSText from "./shaders/skybox.frag";
import skyboxVSText from "./shaders/skybox.vert";
import { type ShadowTechnique, shadowTechniqueIndex } from "./shadow-technique";
import { createDirectionalCubeShadowVolumeGeometry, SHADOW_VOLUME_INDEX_DATA } from "./shadow-volume";
import { buildShadowVolumeCasterPositions } from "./shadow-volume-casters";

const SHADOW_MAP_SIZE = 2048;
const SHADOW_STENCIL_NEUTRAL = 128;

export interface RenderView {
  viewMatrix: Mat4;
  projMatrix: Mat4;
  cubePositions: Float32Array;
  cubeColors: Float32Array;
  cubeAmbientOcclusion: Uint8Array;
  numCubes: number;
  lightPosition: Float32Array;
  lightDirection: Float32Array;
  /** Actual sun position (unflipped). Used by the skybox to place sun/moon discs. */
  sunPosition: Float32Array;
  backgroundColor: Float32Array;
  /** RGB ambient light color (changes with time of day). */
  ambientColor: Float32Array;
  /** RGB sun/moon light color (changes with time of day). */
  sunColor: Float32Array;
  shadowTechnique: ShadowTechnique;
  shadowStrength: number;
  debugShadowVolumes?: boolean;
  /** Wall-clock seconds since game start; drives fluid surface animation. */
  timeS: number;
  /** World-space camera eye position. Used for distance fog. */
  cameraPos: Float32Array;
  /** RGB fog color blended into distant fragments (typically matches horizon sky). */
  fogColor: Float32Array;
  /** Horizontal distance at which fog begins (blocks). */
  fogNear: number;
  /** Horizontal distance at which fog fully obscures fragments (blocks). */
  fogFar: number;
  entities: EntityDrawData[];
  highlightBlock?: { x: number; y: number; z: number; blockType?: number };
}

interface EntityPass {
  pass: RenderPass;
  cullFace: boolean;
  depthTest: boolean;
  blendAlpha: boolean;
  instancedAttributes: { name: string; size: number }[];
}

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: WebGL2RenderingContext;
  private readonly skyboxRenderPass: RenderPass;
  private readonly cloudRenderPass: RenderPass;
  private readonly blankCubeRenderPass: RenderPass;
  private readonly shadowMapRenderPass: RenderPass;
  private readonly shadowVolumeRenderPass: RenderPass;
  private readonly debugShadowVolumeRenderPass: RenderPass;
  private readonly debugShadowMaskRenderPass: RenderPass;
  private readonly debugLightArrowRenderPass: RenderPass;
  private readonly shadowOverlayRenderPass: RenderPass;
  private readonly entityPasses: Map<string, EntityPass>;
  private readonly blockHighlight: BlockHighlight;
  readonly gpuTimer: GpuTimer;

  private currentView!: RenderView;
  private readonly viewNoTranslation = new Float32Array(16);
  private readonly shadowLightViewProj = new Mat4();
  private readonly shadowLightView = new Mat4();
  private readonly shadowLightProj = new Mat4();
  private readonly shadowMapTexelSize = new Float32Array([1 / SHADOW_MAP_SIZE, 1 / SHADOW_MAP_SIZE]);
  private readonly cloudSeed = new Float32Array([Math.random() * 1000, Math.random() * 1000]);
  private readonly shadowFramebuffer: WebGLFramebuffer;
  private readonly shadowDepthTexture: WebGLTexture;
  private lastShadowVolumeDirectionKey = "";
  private shadowVolumeCasterPositions: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private shadowVolumeCasterScales: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private shadowVolumeCasterCount = 0;
  private readonly debugShadowVolumePosition = new Float32Array(4);
  private readonly debugShadowVolumeScale = new Float32Array([1, 1, 1, 0]);
  private readonly debugLightArrowPositions = new Float32Array(6 * 4);
  private lastShadowVolumeCubePositions: Float32Array | null = null;
  private lastCubePositions: Float32Array | null = null;
  private lastCubeColors: Float32Array | null = null;
  private lastCubeAmbientOcclusion: Uint8Array | null = null;

  constructor(canvas: HTMLCanvasElement, entityDefs: EntityPassDef[]) {
    this.canvas = canvas;
    this.ctx = WebGLUtilities.requestWebGLContext(canvas);
    this.gpuTimer = new GpuTimer(this.ctx);

    const cubeGeometry = new Cube();
    const shadowResources = this.createShadowResources();
    this.shadowFramebuffer = shadowResources.framebuffer;
    this.shadowDepthTexture = shadowResources.depthTexture;
    this.skyboxRenderPass = new RenderPass(this.ctx, skyboxVSText, skyboxFSText);
    this.initSkyboxPass(cubeGeometry);
    this.cloudRenderPass = new RenderPass(this.ctx, cloudsVSText, cloudsFSText);
    this.initCloudPass(cubeGeometry);
    this.shadowMapRenderPass = new RenderPass(this.ctx, shadowMapVSText, shadowMapFSText);
    this.initShadowMapPass(cubeGeometry);
    this.shadowVolumeRenderPass = new RenderPass(this.ctx, shadowVolumeVSText, shadowVolumeFSText);
    this.initShadowVolumePass();
    this.debugShadowVolumeRenderPass = new RenderPass(this.ctx, shadowVolumeVSText, debugShadowVolumeFSText);
    this.initDebugShadowVolumePass();
    this.debugShadowMaskRenderPass = new RenderPass(this.ctx, shadowOverlayVSText, debugShadowVolumeFSText);
    this.initDebugShadowMaskPass(new Quad());
    this.debugLightArrowRenderPass = new RenderPass(this.ctx, debugLightArrowVSText, debugLightArrowFSText);
    this.initDebugLightArrowPass();
    this.shadowOverlayRenderPass = new RenderPass(this.ctx, shadowOverlayVSText, shadowOverlayFSText);
    this.initShadowOverlayPass(new Quad());
    this.blankCubeRenderPass = new RenderPass(this.ctx, blankCubeVSText, blankCubeFSText);
    this.initBlankCubePass(cubeGeometry);

    this.blockHighlight = new BlockHighlight(this.ctx);
    this.entityPasses = new Map();
    for (const def of entityDefs) {
      const pass = new RenderPass(this.ctx, def.vertexShader, def.fragmentShader);
      this.initEntityPass(pass, def);
      this.entityPasses.set(def.key, {
        pass,
        cullFace: def.cullFace ?? true,
        depthTest: def.depthTest ?? true,
        blendAlpha: def.blendAlpha ?? false,
        instancedAttributes: def.instancedAttributes,
      });
    }
  }

  render(view: RenderView): void {
    this.currentView = view;
    this.updateShadowLightMatrix();
    if (view.cubePositions !== this.lastCubePositions) {
      this.blankCubeRenderPass.updateAttributeBuffer("aOffset", view.cubePositions);
      this.shadowMapRenderPass.updateAttributeBuffer("aOffset", view.cubePositions);
      this.lastCubePositions = view.cubePositions;
    }
    if (view.shadowTechnique === "shadow-volume" && view.cubePositions !== this.lastShadowVolumeCubePositions) {
      const casters = buildShadowVolumeCasterPositions(view.cubePositions);
      this.shadowVolumeCasterPositions = casters.positions;
      this.shadowVolumeCasterScales = casters.scales;
      this.shadowVolumeCasterCount = casters.count;
      this.shadowVolumeRenderPass.updateAttributeBuffer("aOffset", this.shadowVolumeCasterPositions);
      this.shadowVolumeRenderPass.updateAttributeBuffer("aScale", this.shadowVolumeCasterScales);
      this.lastShadowVolumeCubePositions = view.cubePositions;
    }
    if (view.cubeColors !== this.lastCubeColors) {
      this.blankCubeRenderPass.updateAttributeBuffer("aColor", view.cubeColors);
      this.lastCubeColors = view.cubeColors;
    }
    if (view.cubeAmbientOcclusion !== this.lastCubeAmbientOcclusion) {
      this.blankCubeRenderPass.updateAttributeBuffer("aAmbientOcclusion", view.cubeAmbientOcclusion);
      this.lastCubeAmbientOcclusion = view.cubeAmbientOcclusion;
    }
    if (view.shadowTechnique === "shadow-map") {
      this.drawShadowMap();
    }

    const gl = this.ctx;
    const [bgR = 0, bgG = 0, bgB = 0, bgA = 1] = view.backgroundColor;
    gl.clearColor(bgR, bgG, bgB, bgA);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.frontFace(gl.CCW);
    gl.cullFace(gl.BACK);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    this.gpuTimer.poll();
    this.gpuTimer.begin();

    this.drawSkybox();

    this.blankCubeRenderPass.drawInstanced(view.numCubes);

    for (const entity of view.entities) {
      if (entity.count === 0) continue;
      const ep = this.entityPasses.get(entity.key);
      if (!ep) continue;

      if (!ep.depthTest) gl.disable(gl.DEPTH_TEST);
      if (!ep.cullFace) gl.disable(gl.CULL_FACE);
      if (ep.blendAlpha) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
      }
      for (const { name, size } of ep.instancedAttributes) {
        const buf = entity.buffers[name];
        if (buf) ep.pass.updateAttributeBuffer(name, buf.subarray(0, entity.count * size));
      }
      ep.pass.drawInstanced(entity.count);
      if (ep.blendAlpha) {
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
      if (!ep.depthTest) gl.enable(gl.DEPTH_TEST);
      if (!ep.cullFace) gl.enable(gl.CULL_FACE);
    }

    if (view.shadowTechnique === "shadow-volume") {
      this.drawShadowVolumes();
    }

    this.drawClouds();

    if (view.highlightBlock) {
      this.blockHighlight.draw(
        view.viewMatrix,
        view.projMatrix,
        this.canvas.width,
        this.canvas.height,
        view.highlightBlock.x,
        view.highlightBlock.y,
        view.highlightBlock.z,
      );
    }
    if (view.debugShadowVolumes) {
      this.drawDebugShadowVolumes();
      this.drawDebugLightArrow();
    }

    this.gpuTimer.end();
  }

  private drawSkybox(): void {
    const gl = this.ctx;
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    this.skyboxRenderPass.draw();
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }

  private drawClouds(): void {
    const gl = this.ctx;
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.cloudRenderPass.draw();
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.depthFunc(gl.LESS);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }

  private drawShadowMap(): void {
    const gl = this.ctx;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFramebuffer);
    gl.viewport(0, 0, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    gl.colorMask(false, false, false, false);
    gl.depthMask(true);
    gl.depthFunc(gl.LESS);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.5, 2.0);
    this.shadowMapRenderPass.drawInstanced(this.currentView.numCubes);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.cullFace(gl.BACK);
    gl.colorMask(true, true, true, true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private drawShadowVolumes(): void {
    const gl = this.ctx;
    if (this.shadowVolumeCasterCount === 0) return;
    this.updateShadowVolumeGeometry();

    gl.clearStencil(SHADOW_STENCIL_NEUTRAL);
    gl.clear(gl.STENCIL_BUFFER_BIT);
    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(0xff);
    gl.stencilFunc(gl.ALWAYS, 0, 0xff);
    gl.colorMask(false, false, false, false);
    gl.depthMask(false);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);

    gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.INCR, gl.KEEP);
    gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.DECR, gl.KEEP);
    this.shadowVolumeRenderPass.drawInstanced(this.shadowVolumeCasterCount);

    gl.colorMask(true, true, true, true);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.GREATER);
    gl.depthMask(false);
    gl.stencilMask(0x00);
    gl.stencilFunc(gl.NOTEQUAL, SHADOW_STENCIL_NEUTRAL, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
    this.shadowOverlayRenderPass.draw();
    gl.disable(gl.BLEND);

    gl.stencilMask(0xff);
    gl.disable(gl.STENCIL_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }

  private drawDebugShadowVolumes(): void {
    const gl = this.ctx;
    const block = this.currentView.highlightBlock;
    if (!block || !isDebugShadowVolumeCasterType(block.blockType)) return;
    this.updateShadowVolumeGeometry();
    this.debugShadowVolumePosition[0] = block.x;
    this.debugShadowVolumePosition[1] = block.y;
    this.debugShadowVolumePosition[2] = block.z;
    this.debugShadowVolumePosition[3] = 0;
    this.debugShadowVolumeRenderPass.updateAttributeBuffer("aOffset", this.debugShadowVolumePosition);
    this.debugShadowVolumeRenderPass.updateAttributeBuffer("aScale", this.debugShadowVolumeScale);

    gl.clearStencil(SHADOW_STENCIL_NEUTRAL);
    gl.clear(gl.STENCIL_BUFFER_BIT);
    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(0xff);
    gl.stencilFunc(gl.ALWAYS, 0, 0xff);
    gl.colorMask(false, false, false, false);
    gl.depthMask(false);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.INCR, gl.KEEP);
    gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.DECR, gl.KEEP);
    this.debugShadowVolumeRenderPass.drawInstanced(1);

    gl.colorMask(true, true, true, true);
    gl.depthFunc(gl.GREATER);
    gl.stencilMask(0x00);
    gl.stencilFunc(gl.NOTEQUAL, SHADOW_STENCIL_NEUTRAL, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.debugShadowMaskRenderPass.draw();
    gl.disable(gl.BLEND);
    gl.stencilMask(0xff);
    gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
  }

  private drawDebugLightArrow(): void {
    const gl = this.ctx;
    this.updateDebugLightArrowPositions();

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.lineWidth(3);
    this.debugLightArrowRenderPass.updateAttributeBuffer("aVertPos", this.debugLightArrowPositions);
    this.debugLightArrowRenderPass.draw();
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.DEPTH_TEST);
  }

  private updateDebugLightArrowPositions(): void {
    const lightDirection = new Vec3([
      this.currentView.lightDirection[0] ?? 0,
      this.currentView.lightDirection[1] ?? 1,
      this.currentView.lightDirection[2] ?? 0,
    ]).normalize();
    const origin = new Vec3([
      this.currentView.cameraPos[0] ?? 0,
      (this.currentView.cameraPos[1] ?? 0) + 5,
      this.currentView.cameraPos[2] ?? 0,
    ]);
    const tip = Vec3.clone(origin).add(Vec3.clone(lightDirection).scale(9));
    const side = new Vec3();
    Vec3.cross(side, lightDirection, new Vec3([0, 1, 0]));
    if (Vec3.len(side) < 0.01) Vec3.cross(side, lightDirection, new Vec3([1, 0, 0]));
    side.normalize();
    const headBase = Vec3.clone(tip).subtract(Vec3.clone(lightDirection).scale(1.6));
    const headA = Vec3.clone(headBase).add(Vec3.clone(side).scale(0.8));
    const headB = Vec3.clone(headBase).subtract(Vec3.clone(side).scale(0.8));

    this.writeDebugArrowVertex(0, origin);
    this.writeDebugArrowVertex(1, tip);
    this.writeDebugArrowVertex(2, tip);
    this.writeDebugArrowVertex(3, headA);
    this.writeDebugArrowVertex(4, tip);
    this.writeDebugArrowVertex(5, headB);
  }

  private writeDebugArrowVertex(index: number, position: Readonly<Vec3>): void {
    const offset = index * 4;
    this.debugLightArrowPositions[offset] = position.x;
    this.debugLightArrowPositions[offset + 1] = position.y;
    this.debugLightArrowPositions[offset + 2] = position.z;
    this.debugLightArrowPositions[offset + 3] = 1;
  }

  private createShadowResources(): { framebuffer: WebGLFramebuffer; depthTexture: WebGLTexture } {
    const gl = this.ctx;
    const depthTexture = gl.createTexture();
    if (!depthTexture) throw new Error("Failed to create shadow depth texture");
    gl.bindTexture(gl.TEXTURE_2D, depthTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.DEPTH_COMPONENT24,
      SHADOW_MAP_SIZE,
      SHADOW_MAP_SIZE,
      0,
      gl.DEPTH_COMPONENT,
      gl.UNSIGNED_INT,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) throw new Error("Failed to create shadow framebuffer");
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("Shadow framebuffer is incomplete");
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { framebuffer, depthTexture };
  }

  private updateShadowLightMatrix(): void {
    const view = this.currentView;
    const center = new Vec3([view.cameraPos[0] ?? 0, view.cameraPos[1] ?? 0, view.cameraPos[2] ?? 0]);
    const lightDirection = new Vec3([
      view.lightDirection[0] ?? 0,
      view.lightDirection[1] ?? 0,
      view.lightDirection[2] ?? 1,
    ]).normalize();
    const lightEye = Vec3.clone(center).add(lightDirection.scale(190));
    const up =
      Math.abs(Vec3.dot(lightDirection, new Vec3([0, 1, 0]))) > 0.92 ? new Vec3([0, 0, 1]) : new Vec3([0, 1, 0]);
    Mat4.lookAt(this.shadowLightView, lightEye, center, up);

    const radius = Math.max(72, Math.min(220, view.fogFar * 0.45));
    Mat4.ortho(this.shadowLightProj, -radius, radius, -radius, radius, 1, 420);
    Mat4.multiply(this.shadowLightViewProj, this.shadowLightProj, this.shadowLightView);
  }

  private updateShadowVolumeGeometry(): void {
    const lightDirection = this.currentView.lightDirection;
    const key = `${(lightDirection[0] ?? 0).toFixed(3)},${(lightDirection[1] ?? 0).toFixed(3)},${(lightDirection[2] ?? 1).toFixed(3)}`;
    if (key === this.lastShadowVolumeDirectionKey) return;
    this.lastShadowVolumeDirectionKey = key;
    const geometry = createDirectionalCubeShadowVolumeGeometry(
      new Vec3([lightDirection[0] ?? 0, lightDirection[1] ?? 0, lightDirection[2] ?? 1]),
    );
    this.shadowVolumeRenderPass.updateAttributeBuffer("aVertPos", geometry);
    this.debugShadowVolumeRenderPass.updateAttributeBuffer("aVertPos", geometry);
  }

  private initEntityPass(pass: RenderPass, def: EntityPassDef): void {
    const gl = this.ctx;
    const geo = def.geometry;

    pass.setIndexBufferData(geo.indices);
    pass.addAttribute("aVertPos", 4, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, geo.positions);
    pass.addAttribute("aNorm", 4, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, geo.normals);
    pass.addAttribute("aUV", 2, gl.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, geo.uvs);
    for (const attr of geo.extraAttributes ?? []) {
      pass.addAttribute(
        attr.name,
        attr.size,
        gl.FLOAT,
        false,
        attr.size * Float32Array.BYTES_PER_ELEMENT,
        0,
        undefined,
        attr.data,
      );
    }

    for (const attr of def.instancedAttributes) {
      pass.addInstancedAttribute(
        attr.name,
        attr.size,
        gl.FLOAT,
        false,
        attr.size * Float32Array.BYTES_PER_ELEMENT,
        0,
        undefined,
        new Float32Array(0),
      );
    }

    this.addSharedUniforms(pass);
    pass.setDrawData(gl.TRIANGLES, geo.indices.length, gl.UNSIGNED_INT, 0);
    pass.setup();
  }

  // LUT data — indexed by CubeType (0–19), must stay in sync with blankCube.frag
  // col1 = mix(vertexColor, lut1Fixed, lut1Blend)
  // col2 = mix(vertexColor * lut2Scale, lut2Fixed, lut2Blend)
  // Entries for Water (12), Lava (13), and Permafrost (14) are dummies:
  //   Water/Lava compute kd directly in the fluid branch (col1/col2 unused).
  //   Permafrost overrides col1/col2 in the grass/permafrost branch.
  private static readonly LUT1_FIXED = new Float32Array([
    0.0,
    0.0,
    0.0, // 0  Air         (unused)
    0.0,
    0.0,
    0.0, // 1  Grass       (overridden by face logic)
    0.0,
    0.0,
    0.0, // 2  Dirt
    0.0,
    0.0,
    0.0, // 3  Stone
    0.0,
    0.0,
    0.0, // 4  Sand
    0.0,
    0.0,
    0.0, // 5  Snow
    0.08,
    0.08,
    0.09, // 6  Bedrock
    0.0,
    0.0,
    0.0, // 7  ForestGrass (overridden by face logic)
    0.5,
    0.5,
    0.5, // 8  CoalOre
    0.5,
    0.5,
    0.5, // 9  IronOre
    0.5,
    0.5,
    0.5, // 10 GoldOre
    0.5,
    0.5,
    0.5, // 11 DiamondOre
    0.0,
    0.0,
    0.0, // 12 Water
    0.0,
    0.0,
    1.0, // 13 Lava
    0.7,
    0.1,
    0.0, // 14 Permafrost  (overridden by face logic)
    0.0,
    0.0,
    0.0, // 15 OakLog
    0.0,
    0.0,
    0.0, // 16 OakLeaf
    0.0,
    0.0,
    0.0, // 17 ShrubLeaf
    0.0,
    0.0,
    0.0, // 18 ShrubStem
    0.0,
    0.0,
    0.0, // 19 Cactus
  ]);
  private static readonly LUT1_BLEND = new Float32Array([
    0, // Air
    0, // Grass
    0, // Dirt
    0, // Stone
    0, // Sand
    0, // Snow
    1, // Bedrock
    0, // ForestGrass
    1, // CoalOre
    1, // IronOre
    1, // GoldOre
    1, // DiamondOre
    0, // Water
    0.3, // Lava
    0, // Permafrost
    0, // OakLog
    0, // OakLeaf
    0, // ShrubLeaf
    0, // ShrubStem
    0, // Cactus
  ]);
  private static readonly LUT2_FIXED = new Float32Array([
    0.0,
    0.0,
    0.0, // 0  Air         (unused)
    0.0,
    0.0,
    0.0, // 1  Grass       (overridden by face logic)
    0.0,
    0.0,
    0.0, // 2  Dirt
    0.3,
    0.3,
    0.335, // 3  Stone
    0.53,
    0.47,
    0.18, // 4  Sand
    0.8,
    0.9,
    1.0, // 5  Snow
    0.02,
    0.02,
    0.03, // 6  Bedrock
    0.0,
    0.0,
    0.0, // 7  ForestGrass (overridden by face logic)
    0.12,
    0.12,
    0.13, // 8  CoalOre
    0.72,
    0.46,
    0.3, // 9  IronOre
    0.94,
    0.82,
    0.08, // 10 GoldOre
    0.25,
    0.88,
    0.92, // 11 DiamondOre
    0.0,
    0.0,
    0.0, // 12 Water
    0.7,
    0.1,
    0.0, // 13 Lava
    0.0,
    0.0,
    0.0, // 14 Permafrost  (overridden by face logic)
    0.28,
    0.16,
    0.07, // 15 OakLog      (dark bark)
    0.1,
    0.3,
    0.05, // 16 OakLeaf     (dark leaf)
    0.22,
    0.34,
    0.08, // 17 ShrubLeaf   (dark shrub leaf)
    0.2,
    0.14,
    0.06, // 18 ShrubStem   (dark stem)
    0.04,
    0.28,
    0.07, // 19 Cactus      (dark cactus)
  ]);
  private static readonly LUT2_BLEND = new Float32Array([
    0, // Air
    0, // Grass
    0, // Dirt
    1, // Stone
    0.4, // Sand
    1, // Snow
    1, // Bedrock
    0, // ForestGrass
    1, // CoalOre
    1, // IronOre
    1, // GoldOre
    1, // DiamondOre
    0, // Water
    0.6, // Lava
    0, // Permafrost
    0.35, // OakLog
    0.3, // OakLeaf
    0.3, // ShrubLeaf
    0.3, // ShrubStem
    0.3, // Cactus
  ]);
  private static readonly LUT2_SCALE = new Float32Array([
    0.5, // Air
    0.5, // Grass
    0.5, // Dirt
    0.5, // Stone
    0.85, // Sand
    0.5, // Snow        (irrelevant, blend=1)
    0.5, // Bedrock     (irrelevant, blend=1)
    0.5, // ForestGrass
    0.5, // CoalOre     (irrelevant, blend=1)
    0.5, // IronOre     (irrelevant, blend=1)
    0.5, // GoldOre     (irrelevant, blend=1)
    0.5, // DiamondOre  (irrelevant, blend=1)
    0.7, // Water
    0.5, // Lava
    0.5, // Permafrost
    0.55, // OakLog
    0.6, // OakLeaf
    0.6, // ShrubLeaf
    0.55, // ShrubStem
    0.6, // Cactus
  ]);

  private initShadowMapPass(cube: Cube): void {
    const gl = this.ctx;
    const pass = this.shadowMapRenderPass;

    pass.setIndexBufferData(cube.indicesFlat());
    pass.addAttribute(
      "aVertPos",
      4,
      gl.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      cube.positionsFlat(),
    );
    pass.addInstancedAttribute(
      "aOffset",
      4,
      gl.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      new Float32Array(0),
    );
    pass.addUniform("uLightViewProj", (glCtx: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      glCtx.uniformMatrix4fv(loc, false, new Float32Array(this.shadowLightViewProj));
    });
    pass.setDrawData(gl.TRIANGLES, cube.indicesFlat().length, gl.UNSIGNED_INT, 0);
    pass.setup();
  }

  private initShadowVolumePass(): void {
    const gl = this.ctx;
    const pass = this.shadowVolumeRenderPass;

    pass.setIndexBufferData(SHADOW_VOLUME_INDEX_DATA);
    pass.addAttribute(
      "aVertPos",
      4,
      gl.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      createDirectionalCubeShadowVolumeGeometry(new Vec3([0, 1, 0])),
    );
    pass.addInstancedAttribute(
      "aOffset",
      4,
      gl.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      new Float32Array(0),
    );
    pass.addInstancedAttribute(
      "aScale",
      4,
      gl.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      new Float32Array(0),
    );
    pass.addUniform("uProj", (glCtx: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      glCtx.uniformMatrix4fv(loc, false, new Float32Array(this.currentView.projMatrix));
    });
    pass.addUniform("uView", (glCtx: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      glCtx.uniformMatrix4fv(loc, false, new Float32Array(this.currentView.viewMatrix));
    });
    pass.addUniform("uLightDir", (glCtx: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      glCtx.uniform3fv(loc, this.currentView.lightDirection);
    });
    pass.setDrawData(gl.TRIANGLES, SHADOW_VOLUME_INDEX_DATA.length, gl.UNSIGNED_INT, 0);
    pass.setup();
  }

  private initDebugShadowVolumePass(): void {
    const gl = this.ctx;
    const pass = this.debugShadowVolumeRenderPass;

    pass.setIndexBufferData(SHADOW_VOLUME_INDEX_DATA);
    pass.addAttribute(
      "aVertPos",
      4,
      gl.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      createDirectionalCubeShadowVolumeGeometry(new Vec3([0, 1, 0])),
    );
    pass.addInstancedAttribute(
      "aOffset",
      4,
      gl.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      new Float32Array(0),
    );
    pass.addInstancedAttribute(
      "aScale",
      4,
      gl.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      new Float32Array(0),
    );
    pass.addUniform("uProj", (glCtx: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      glCtx.uniformMatrix4fv(loc, false, new Float32Array(this.currentView.projMatrix));
    });
    pass.addUniform("uView", (glCtx: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      glCtx.uniformMatrix4fv(loc, false, new Float32Array(this.currentView.viewMatrix));
    });
    pass.addUniform("uLightDir", (glCtx: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      glCtx.uniform3fv(loc, this.currentView.lightDirection);
    });
    pass.setDrawData(gl.TRIANGLES, SHADOW_VOLUME_INDEX_DATA.length, gl.UNSIGNED_INT, 0);
    pass.setup();
  }

  private initDebugShadowMaskPass(quad: Quad): void {
    const gl = this.ctx;
    const pass = this.debugShadowMaskRenderPass;

    pass.setIndexBufferData(quad.indicesFlat());
    pass.addAttribute(
      "aVertPos",
      4,
      gl.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      quad.positionsFlat(),
    );
    pass.setDrawData(gl.TRIANGLES, quad.indicesFlat().length, gl.UNSIGNED_INT, 0);
    pass.setup();
  }

  private initDebugLightArrowPass(): void {
    const gl = this.ctx;
    const pass = this.debugLightArrowRenderPass;

    pass.setIndexBufferData(new Uint32Array([0, 1, 2, 3, 4, 5]));
    pass.addAttribute(
      "aVertPos",
      4,
      gl.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.debugLightArrowPositions,
    );
    pass.addUniform("uProj", (glCtx: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      glCtx.uniformMatrix4fv(loc, false, new Float32Array(this.currentView.projMatrix));
    });
    pass.addUniform("uView", (glCtx: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      glCtx.uniformMatrix4fv(loc, false, new Float32Array(this.currentView.viewMatrix));
    });
    pass.setDrawData(gl.LINES, 6, gl.UNSIGNED_INT, 0);
    pass.setup();
  }

  private initShadowOverlayPass(quad: Quad): void {
    const gl = this.ctx;
    const pass = this.shadowOverlayRenderPass;

    pass.setIndexBufferData(quad.indicesFlat());
    pass.addAttribute(
      "aVertPos",
      4,
      gl.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      quad.positionsFlat(),
    );
    pass.addUniform("uShadowStrength", (glCtx: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      glCtx.uniform1f(loc, this.currentView.shadowStrength);
    });
    pass.addUniform("uLightDir", (glCtx: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      glCtx.uniform3fv(loc, this.currentView.lightDirection);
    });
    pass.setDrawData(gl.TRIANGLES, quad.indicesFlat().length, gl.UNSIGNED_INT, 0);
    pass.setup();
  }

  private initBlankCubePass(cube: Cube): void {
    const gl = this.ctx;
    const pass = this.blankCubeRenderPass;

    pass.setIndexBufferData(cube.indicesFlat());
    pass.addAttribute(
      "aVertPos",
      4,
      gl.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      cube.positionsFlat(),
    );
    pass.addAttribute(
      "aNorm",
      4,
      gl.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      cube.normalsFlat(),
    );
    pass.addAttribute("aUV", 2, gl.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, cube.uvFlat());
    pass.addInstancedAttribute(
      "aOffset",
      4,
      gl.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      new Float32Array(0),
    );
    pass.addInstancedAttribute(
      "aColor",
      3,
      this.ctx.FLOAT,
      false,
      3 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      new Float32Array(0),
    );
    const aoStride = 24 * Uint8Array.BYTES_PER_ELEMENT;
    const aoBuffer = "aAmbientOcclusion";
    pass.addInstancedAttribute("aAOTop", 4, gl.UNSIGNED_BYTE, false, aoStride, 0, aoBuffer, new Uint8Array(0));
    pass.addInstancedAttribute(
      "aAOLeft",
      4,
      gl.UNSIGNED_BYTE,
      false,
      aoStride,
      4 * Uint8Array.BYTES_PER_ELEMENT,
      aoBuffer,
    );
    pass.addInstancedAttribute(
      "aAORight",
      4,
      gl.UNSIGNED_BYTE,
      false,
      aoStride,
      8 * Uint8Array.BYTES_PER_ELEMENT,
      aoBuffer,
    );
    pass.addInstancedAttribute(
      "aAOFront",
      4,
      gl.UNSIGNED_BYTE,
      false,
      aoStride,
      12 * Uint8Array.BYTES_PER_ELEMENT,
      aoBuffer,
    );
    pass.addInstancedAttribute(
      "aAOBack",
      4,
      gl.UNSIGNED_BYTE,
      false,
      aoStride,
      16 * Uint8Array.BYTES_PER_ELEMENT,
      aoBuffer,
    );
    pass.addInstancedAttribute(
      "aAOBottom",
      4,
      gl.UNSIGNED_BYTE,
      false,
      aoStride,
      20 * Uint8Array.BYTES_PER_ELEMENT,
      aoBuffer,
    );

    this.addSharedUniforms(pass);

    pass.addUniform("uLut1Fixed", (gl: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      gl.uniform3fv(loc, Renderer.LUT1_FIXED);
    });
    pass.addUniform("uLut1Blend", (gl: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      gl.uniform1fv(loc, Renderer.LUT1_BLEND);
    });
    pass.addUniform("uLut2Fixed", (gl: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      gl.uniform3fv(loc, Renderer.LUT2_FIXED);
    });
    pass.addUniform("uLut2Blend", (gl: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      gl.uniform1fv(loc, Renderer.LUT2_BLEND);
    });
    pass.addUniform("uLut2Scale", (gl: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      gl.uniform1fv(loc, Renderer.LUT2_SCALE);
    });
    pass.addUniform("uShadowTechnique", (gl: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      gl.uniform1i(loc, shadowTechniqueIndex(this.currentView.shadowTechnique));
    });
    pass.addUniform("uShadowMap", (gl: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.shadowDepthTexture);
      gl.uniform1i(loc, 3);
    });
    pass.addUniform("uShadowMapTexelSize", (gl: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      gl.uniform2fv(loc, this.shadowMapTexelSize);
    });

    pass.setDrawData(gl.TRIANGLES, cube.indicesFlat().length, gl.UNSIGNED_INT, 0);
    pass.setup();
  }

  private initSkyboxPass(cube: Cube): void {
    const gl = this.ctx;
    const pass = this.skyboxRenderPass;

    pass.setIndexBufferData(cube.indicesFlat());
    pass.addAttribute(
      "aVertPos",
      4,
      gl.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      cube.positionsFlat(),
    );

    pass.addUniform("uProj", (glCtx: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      glCtx.uniformMatrix4fv(loc, false, new Float32Array(this.currentView.projMatrix));
    });
    pass.addUniform("uViewNoTranslation", (glCtx: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      this.viewNoTranslation.set(this.currentView.viewMatrix);
      this.viewNoTranslation[12] = 0;
      this.viewNoTranslation[13] = 0;
      this.viewNoTranslation[14] = 0;
      glCtx.uniformMatrix4fv(loc, false, this.viewNoTranslation);
    });
    pass.addUniform("uAmbient", (glCtx: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      glCtx.uniform3fv(loc, this.currentView.ambientColor);
    });
    pass.addUniform("uSunColor", (glCtx: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      glCtx.uniform3fv(loc, this.currentView.sunColor);
    });
    pass.addUniform("uLightPos", (glCtx: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      glCtx.uniform4fv(loc, this.currentView.sunPosition);
    });

    pass.setDrawData(gl.TRIANGLES, cube.indicesFlat().length, gl.UNSIGNED_INT, 0);
    pass.setup();
  }

  private initCloudPass(cube: Cube): void {
    const gl = this.ctx;
    const pass = this.cloudRenderPass;

    pass.setIndexBufferData(cube.indicesFlat());
    pass.addAttribute(
      "aVertPos",
      4,
      gl.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      cube.positionsFlat(),
    );

    pass.addUniform("uProj", (glCtx: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      glCtx.uniformMatrix4fv(loc, false, new Float32Array(this.currentView.projMatrix));
    });
    pass.addUniform("uViewNoTranslation", (glCtx: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      this.viewNoTranslation.set(this.currentView.viewMatrix);
      this.viewNoTranslation[12] = 0;
      this.viewNoTranslation[13] = 0;
      this.viewNoTranslation[14] = 0;
      glCtx.uniformMatrix4fv(loc, false, this.viewNoTranslation);
    });
    pass.addUniform("uAmbient", (glCtx: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      glCtx.uniform3fv(loc, this.currentView.ambientColor);
    });
    pass.addUniform("uSunColor", (glCtx: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      glCtx.uniform3fv(loc, this.currentView.sunColor);
    });
    pass.addUniform("uCameraPos", (glCtx: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      glCtx.uniform3fv(loc, this.currentView.cameraPos);
    });
    pass.addUniform("uTime", (glCtx: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      glCtx.uniform1f(loc, this.currentView.timeS);
    });
    pass.addUniform("uCloudSeed", (glCtx: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      glCtx.uniform2fv(loc, this.cloudSeed);
    });

    pass.setDrawData(gl.TRIANGLES, cube.indicesFlat().length, gl.UNSIGNED_INT, 0);
    pass.setup();
  }

  private addSharedUniforms(pass: RenderPass): void {
    pass.addUniform("uLightPos", (gl: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      gl.uniform4fv(loc, this.currentView.lightPosition);
    });
    pass.addUniform("uLightDir", (gl: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      gl.uniform3fv(loc, this.currentView.lightDirection);
    });
    pass.addUniform("uProj", (gl: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      gl.uniformMatrix4fv(loc, false, new Float32Array(this.currentView.projMatrix));
    });
    pass.addUniform("uView", (gl: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      gl.uniformMatrix4fv(loc, false, new Float32Array(this.currentView.viewMatrix));
    });
    pass.addUniform("uLightViewProj", (gl: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      gl.uniformMatrix4fv(loc, false, new Float32Array(this.shadowLightViewProj));
    });
    pass.addUniform("uAmbient", (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
      gl.uniform3fv(loc, this.currentView.ambientColor);
    });
    pass.addUniform("uSunColor", (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
      gl.uniform3fv(loc, this.currentView.sunColor);
    });
    pass.addUniform("uTime", (gl: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      gl.uniform1f(loc, this.currentView.timeS);
    });
    pass.addUniform("uCameraPos", (gl: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      gl.uniform3fv(loc, this.currentView.cameraPos);
    });
    pass.addUniform("uFogColor", (gl: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      gl.uniform3fv(loc, this.currentView.fogColor);
    });
    pass.addUniform("uFogNear", (gl: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      gl.uniform1f(loc, this.currentView.fogNear);
    });
    pass.addUniform("uFogFar", (gl: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      gl.uniform1f(loc, this.currentView.fogFar);
    });
    pass.addUniform("uShadowStrength", (gl: WebGL2RenderingContext, loc: WebGLUniformLocation) => {
      gl.uniform1f(loc, this.currentView.shadowStrength);
    });
  }
}

function isDebugShadowVolumeCasterType(blockType: number | undefined): boolean {
  return blockType !== undefined && blockType !== 0 && blockType !== 6 && blockType !== 12 && blockType !== 13;
}
