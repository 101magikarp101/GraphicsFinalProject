import { type Mat4, Vec3 } from "gl-matrix";
import { Camera } from "~/lib/webglutils/Camera";
import type { WalkKeys } from "./input";

const ROTATION_SPEED = 0.01;

export interface CameraOptions {
  width: number;
  height: number;
  fov?: number;
  zNear?: number;
  zFar?: number;
  eye?: Vec3;
  target?: Vec3;
}

export class CameraController {
  private camera: Camera;
  private readonly opts: Required<CameraOptions>;

  constructor(opts: CameraOptions) {
    this.opts = {
      fov: 45,
      zNear: 0.1,
      zFar: 1000,
      eye: new Vec3([0, 100, 0]),
      target: new Vec3([0, 100, -1]),
      ...opts,
    };
    this.camera = this.createCamera();
  }

  reset(): void {
    this.camera = this.createCamera();
  }

  rotate(mouseDx: number, mouseDy: number): void {
    if (mouseDx === 0 && mouseDy === 0) return;
    this.camera.rotate(new Vec3([0, 1, 0]), -ROTATION_SPEED * mouseDx);
    this.camera.rotate(this.camera.right(), -ROTATION_SPEED * mouseDy);
  }

  /** Convert WASD flags into a world-space walk vector using camera basis. */
  walkDir(keys: Readonly<WalkKeys>): Vec3 {
    const out = new Vec3();
    if (keys.w) out.add(this.camera.forward().negate());
    if (keys.a) out.add(this.camera.right().negate());
    if (keys.s) out.add(this.camera.forward());
    if (keys.d) out.add(this.camera.right());
    return out;
  }

  setPosition(pos: Vec3): void {
    this.camera.setPos(pos);
  }

  viewMatrix(): Mat4 {
    return this.camera.viewMatrix();
  }

  projMatrix(): Mat4 {
    return this.camera.projMatrix();
  }

  private createCamera(): Camera {
    const { eye, target, fov, width, height, zNear, zFar } = this.opts;
    return new Camera(
      Vec3.clone(eye),
      Vec3.clone(target),
      new Vec3([0, 1, 0]),
      fov,
      width / height,
      zNear,
      zFar,
    );
  }
}
