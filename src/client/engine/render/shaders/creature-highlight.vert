precision mediump float;

uniform mat4 uView;
uniform mat4 uProj;
uniform float uTime;
uniform vec3 uCameraPos;

attribute vec4 aNorm;
attribute vec4 aVertPos;
attribute float aPart;
attribute vec3 aPivot;

attribute vec4 aOffset; // xyz = position, w = yaw
attribute vec2 aMotion; // x = walk speed, y = phase offset
attribute float aScale;

varying vec3 vNormal;
varying vec3 vToCamera;

const float PART_HEAD = 0.0;
const float PART_LEFT_FRONT_LEG = 2.0;
const float PART_RIGHT_FRONT_LEG = 3.0;
const float PART_LEFT_BACK_LEG = 4.0;
const float PART_RIGHT_BACK_LEG = 5.0;
const float PART_TAIL = 6.0;
const float MAX_WALK_SPEED = 4.0;
const float STRIDE_LENGTH = 1.45;

vec3 rotateAroundX(vec3 v, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
}

vec3 rotateAroundY(vec3 v, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}

float sampleKeyframes(float phase, float k0, float k1, float k2, float k3) {
  float scaled = fract(phase) * 4.0;
  if (scaled < 1.0) return mix(k0, k1, scaled);
  if (scaled < 2.0) return mix(k1, k2, scaled - 1.0);
  if (scaled < 3.0) return mix(k2, k3, scaled - 2.0);
  return mix(k3, k0, scaled - 3.0);
}

void main() {
  float walkSpeed = min(aMotion.x, MAX_WALK_SPEED * 1.4);
  float walkAmount = smoothstep(0.03, 0.16, clamp(walkSpeed / MAX_WALK_SPEED, 0.0, 1.2));
  float walkPhase = uTime * (walkSpeed / STRIDE_LENGTH) + aMotion.y;

  float frontLegSwing = sampleKeyframes(walkPhase, 1.0, 0.0, -1.0, 0.0) * 0.75 * walkAmount;
  float backLegSwing = sampleKeyframes(walkPhase, -1.0, 0.0, 1.0, 0.0) * 0.75 * walkAmount;
  float headNod = sampleKeyframes(walkPhase * 0.75, 0.0, 1.0, 0.0, -1.0) * 0.12 * walkAmount;
  float tailSwing = sampleKeyframes(walkPhase, -1.0, 0.0, 1.0, 0.0) * 0.32 * walkAmount;
  float bodyBob = sampleKeyframes(walkPhase, 0.0, 1.0, 0.0, 1.0) * 0.045 * walkAmount;

  float yaw = -aOffset.w + 3.14159265;
  vec3 localPos = aVertPos.xyz * aScale;
  vec3 localNorm = aNorm.xyz;
  vec3 pivot = aPivot * aScale;
  float partRotation = 0.0;

  if (abs(aPart - PART_HEAD) < 0.5) {
    partRotation = headNod;
  } else if (abs(aPart - PART_LEFT_FRONT_LEG) < 0.5) {
    partRotation = frontLegSwing;
  } else if (abs(aPart - PART_RIGHT_FRONT_LEG) < 0.5) {
    partRotation = -frontLegSwing;
  } else if (abs(aPart - PART_LEFT_BACK_LEG) < 0.5) {
    partRotation = backLegSwing;
  } else if (abs(aPart - PART_RIGHT_BACK_LEG) < 0.5) {
    partRotation = -backLegSwing;
  } else if (abs(aPart - PART_TAIL) < 0.5) {
    localPos = pivot + rotateAroundY(localPos - pivot, tailSwing);
    localNorm = rotateAroundY(localNorm, tailSwing);
  }

  if (abs(aPart - PART_TAIL) >= 0.5) {
    localPos = pivot + rotateAroundX(localPos - pivot, partRotation);
    localNorm = rotateAroundX(localNorm, partRotation);
  }

  localPos.y += bodyBob;

  // Slight expansion creates a clean halo around the silhouette.
  localPos += normalize(localNorm) * (0.032 * aScale);

  vec3 rotated = rotateAroundY(localPos, yaw);
  vec3 worldPos = rotated + aOffset.xyz;
  gl_Position = uProj * uView * vec4(worldPos, 1.0);

  vec3 rotatedNormal = rotateAroundY(localNorm, yaw);
  vNormal = normalize(rotatedNormal);
  vToCamera = uCameraPos - worldPos;
}
