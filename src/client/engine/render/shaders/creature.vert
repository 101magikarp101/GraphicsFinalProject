precision mediump float;

uniform vec4 uLightPos;
uniform mat4 uView;
uniform mat4 uProj;
uniform float uTime;

attribute vec4 aNorm;
attribute vec4 aVertPos;
attribute vec2 aUV;
attribute vec3 aColor;
attribute float aPart;
attribute vec3 aPivot;
attribute float aPaletteMix;

attribute vec4 aOffset; // xyz = position, w = yaw
attribute vec3 aMotion; // x = walk speed, y = phase offset, z = local move direction
attribute float aScale;
attribute vec3 aPrimaryColor;
attribute vec3 aSecondaryColor;
attribute vec4 aMorphA;
attribute vec4 aMorphB;
attribute vec4 aMorphC;
attribute vec3 aAnimProfile;

varying vec4 normal;
varying vec4 wsPos;
varying vec2 uv;
varying vec3 baseColor;

const float PART_HEAD = 0.0;
const float PART_LEFT_FRONT_LEG = 2.0;
const float PART_RIGHT_FRONT_LEG = 3.0;
const float PART_LEFT_BACK_LEG = 4.0;
const float PART_RIGHT_BACK_LEG = 5.0;
const float PART_TAIL = 6.0;
const float PART_NECK = 7.0;
const float PART_TAIL_TIP = 8.0;
const float PART_LEFT_WING = 9.0;
const float PART_RIGHT_WING = 10.0;
const float PART_HORN = 11.0;
const float PART_LEFT_EYE = 12.0;
const float PART_RIGHT_EYE = 13.0;
const float PART_MOUTH = 14.0;
const float PART_DORSAL_FIN = 15.0;
const float PART_CREST = 16.0;
const float PART_SPIKE_ROW = 17.0;
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

vec3 rotateAroundZ(vec3 v, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z);
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
  float walkAmount = smoothstep(0.05, 0.2, clamp(walkSpeed / MAX_WALK_SPEED, 0.0, 1.2));
  float restAmount = 1.0 - walkAmount;
  float moveDir = aMotion.z;
  float moveForward = cos(moveDir);
  float moveStrafe = sin(moveDir);
  float walkPhase = uTime * (walkSpeed / STRIDE_LENGTH) + aMotion.y;
  float idlePhase = uTime * 1.35 + aMotion.y;

  float gait = sampleKeyframes(walkPhase, 1.0, 0.0, -1.0, 0.0) * (0.75 * aAnimProfile.x) * walkAmount;
  float strafeGait = sampleKeyframes(walkPhase, -1.0, 0.0, 1.0, 0.0) * (0.34 * aAnimProfile.x) * walkAmount;
  float idleLeg = sin(idlePhase) * (0.07 * aAnimProfile.x) * restAmount;

  float leftFrontLegSwing = gait * moveForward - strafeGait * moveStrafe + idleLeg;
  float rightFrontLegSwing = -gait * moveForward + strafeGait * moveStrafe - idleLeg;
  float leftBackLegSwing = -gait * moveForward + strafeGait * moveStrafe - idleLeg;
  float rightBackLegSwing = gait * moveForward - strafeGait * moveStrafe + idleLeg;

  float walkHeadNod = sampleKeyframes(walkPhase * 0.75, 0.0, 1.0, 0.0, -1.0) * (0.12 + 0.05 * (aAnimProfile.x - 1.0)) * walkAmount;
  float idleHeadNod = sin(idlePhase * 0.7) * 0.04 * restAmount;
  float headNod = walkHeadNod + idleHeadNod;

  float walkTailSwing = sampleKeyframes(walkPhase, -1.0, 0.0, 1.0, 0.0) * (0.32 * aAnimProfile.z) * walkAmount;
  float idleTailSwing = sin(idlePhase * 0.9) * (0.16 * aAnimProfile.z) * restAmount;
  float tailSwing = walkTailSwing + idleTailSwing;
  float tailTipSwing = tailSwing * 1.35;
  float wingFlap = sampleKeyframes(walkPhase * 0.9, 0.0, 1.0, 0.0, -1.0) * 0.42 * (0.35 + aAnimProfile.z * 0.65) * walkAmount;
  float walkBodyBob = sampleKeyframes(walkPhase, 0.0, 1.0, 0.0, 1.0) * (0.045 * aAnimProfile.y) * walkAmount;
  float restBodyBob = sin(idlePhase * 0.65) * (0.02 * aAnimProfile.y) * restAmount;
  float bodyBob = walkBodyBob + restBodyBob;
  float blinkWave = sin(uTime * 2.35 + aMotion.y * 1.7);
  float blink = pow(max(blinkWave, 0.0), 14.0);
  float eyeOpen = 1.0 - blink * 0.97;
  float talk = 0.5 + 0.5 * sin(uTime * 6.4 + aMotion.y * 2.3 + walkAmount * 2.0);

  float yaw = -aOffset.w + 3.14159265;
  vec3 localPos = aVertPos.xyz * aScale;
  vec3 localNorm = aNorm.xyz;
  vec3 pivot = aPivot * aScale;
  float partRotation = 0.0;

  bool isHead = abs(aPart - PART_HEAD) < 0.5;
  bool isTail = abs(aPart - PART_TAIL) < 0.5;
  bool isLeg = abs(aPart - PART_LEFT_FRONT_LEG) < 0.5 ||
    abs(aPart - PART_RIGHT_FRONT_LEG) < 0.5 ||
    abs(aPart - PART_LEFT_BACK_LEG) < 0.5 ||
    abs(aPart - PART_RIGHT_BACK_LEG) < 0.5;
  bool isNeck = abs(aPart - PART_NECK) < 0.5;
  bool isTailTip = abs(aPart - PART_TAIL_TIP) < 0.5;
  bool isLeftWing = abs(aPart - PART_LEFT_WING) < 0.5;
  bool isRightWing = abs(aPart - PART_RIGHT_WING) < 0.5;
  bool isHorn = abs(aPart - PART_HORN) < 0.5;
  bool isEye = abs(aPart - PART_LEFT_EYE) < 0.5 || abs(aPart - PART_RIGHT_EYE) < 0.5;
  bool isMouth = abs(aPart - PART_MOUTH) < 0.5;
  float hornMask = 1.0;
  float finMask = 1.0;
  float tailMask = 1.0;
  float wingMask = 1.0;
  float crestMask = 1.0;
  float spikeMask = 1.0;
  bool isDorsalFin = abs(aPart - PART_DORSAL_FIN) < 0.5;
  bool isCrest = abs(aPart - PART_CREST) < 0.5;
  bool isSpikeRow = abs(aPart - PART_SPIKE_ROW) < 0.5;

  if (isHead) {
    vec3 headPivot = pivot + vec3(0.0, aMorphC.x * aScale, aMorphC.y * aScale);
    vec3 rel = localPos - headPivot;
    rel *= vec3(aMorphA.w, aMorphA.w, aMorphA.w * 1.03);
    localPos = headPivot + rel;
  } else if (isTail || isTailTip) {
    vec3 tailPivot = pivot + vec3(0.0, aMorphC.w * aScale, 0.0);
    vec3 rel = localPos - tailPivot;
    rel *= vec3(0.9 + (aMorphB.z - 1.0) * 0.2, aMorphB.w, aMorphB.z * mix(0.65, 1.0, tailMask));
    localPos = tailPivot + rel;
    pivot = tailPivot;
  } else if (isNeck) {
    vec3 rel = localPos - pivot;
    float dorsal = max(finMask, crestMask);
    rel *= vec3(0.86 + aMorphA.w * 0.2, (0.88 + aMorphA.w * 0.15) * mix(0.9, 1.22, dorsal), 0.9 + aMorphA.z * 0.2);
    localPos = pivot + rel;
  } else if (isLeftWing || isRightWing) {
    vec3 rel = localPos - pivot;
    float wingScale = mix(0.12, 1.0, wingMask);
    rel *= vec3((0.8 + aMorphA.z * 0.35) * wingScale, (0.7 + aMorphA.y * 0.2) * wingScale, (0.7 + aMorphA.z * 0.2) * wingScale);
    localPos = pivot + rel;
  } else if (isHorn) {
    vec3 rel = localPos - pivot;
    float hornScale = mix(0.08, 1.0, max(hornMask, spikeMask));
    rel *= vec3((0.75 + aMorphA.w * 0.25) * hornScale, (0.9 + aMorphA.w * 0.35) * hornScale, (0.75 + aMorphA.w * 0.25) * hornScale);
    localPos = pivot + rel;
  } else if (isEye) {
    vec3 rel = localPos - pivot;
    rel *= vec3(1.0, 0.14 + eyeOpen * 0.9, 0.9 + 0.12 * eyeOpen);
    localPos = pivot + rel;
  } else if (isMouth) {
    vec3 rel = localPos - pivot;
    rel *= vec3(1.0, 0.42 + talk * 1.04, 0.86 + talk * 0.24);
    localPos = pivot + rel;
    localPos.y += (talk - 0.5) * 0.045 * aScale;
  } else if (isDorsalFin) {
    vec3 rel = localPos - pivot;
    rel *= vec3(0.7 + finMask * 0.5, 0.1 + finMask * 1.05, 0.75 + finMask * 0.35);
    localPos = pivot + rel;
  } else if (isCrest) {
    vec3 rel = localPos - pivot;
    rel *= vec3(0.7 + crestMask * 0.55, 0.1 + crestMask * 1.05, 0.7 + crestMask * 0.45);
    localPos = pivot + rel;
  } else if (isSpikeRow) {
    vec3 rel = localPos - pivot;
    rel *= vec3(0.6 + spikeMask * 0.7, 0.08 + spikeMask * 1.15, 0.65 + spikeMask * 0.55);
    localPos = pivot + rel;
  } else if (isLeg) {
    vec3 rel = localPos - pivot;
    rel *= vec3(aMorphB.y, aMorphB.x, aMorphB.y);
    localPos = pivot + rel;
    localPos.x += sign(localPos.x) * aMorphC.z * aScale;
  } else {
    vec3 rel = localPos - pivot;
    rel *= vec3(aMorphA.x, aMorphA.y + crestMask * 0.08, aMorphA.z + finMask * 0.05);
    localPos = pivot + rel;
  }

  if (isHead) {
    partRotation = headNod;
  } else if (isNeck) {
    partRotation = headNod * 0.62;
  } else if (abs(aPart - PART_LEFT_FRONT_LEG) < 0.5) {
    partRotation = leftFrontLegSwing;
  } else if (abs(aPart - PART_RIGHT_FRONT_LEG) < 0.5) {
    partRotation = rightFrontLegSwing;
  } else if (abs(aPart - PART_LEFT_BACK_LEG) < 0.5) {
    partRotation = leftBackLegSwing;
  } else if (abs(aPart - PART_RIGHT_BACK_LEG) < 0.5) {
    partRotation = rightBackLegSwing;
  } else if (isTail) {
    localPos = pivot + rotateAroundY(localPos - pivot, tailSwing);
    localNorm = rotateAroundY(localNorm, tailSwing);
  } else if (isTailTip) {
    localPos = pivot + rotateAroundY(localPos - pivot, tailTipSwing);
    localNorm = rotateAroundY(localNorm, tailTipSwing);
  } else if (isLeftWing) {
    localPos = pivot + rotateAroundZ(localPos - pivot, wingFlap);
    localNorm = rotateAroundZ(localNorm, wingFlap);
  } else if (isRightWing) {
    localPos = pivot + rotateAroundZ(localPos - pivot, -wingFlap);
    localNorm = rotateAroundZ(localNorm, -wingFlap);
  } else if (isHorn) {
    partRotation = headNod * 0.4;
  } else if (isDorsalFin || isSpikeRow) {
    partRotation = tailSwing * 0.25;
  } else if (isCrest) {
    partRotation = headNod * 0.34;
  } else if (isEye || isMouth) {
    partRotation = headNod * 0.28;
  }

  if (!isTail && !isTailTip && !isLeftWing && !isRightWing) {
    localPos = pivot + rotateAroundX(localPos - pivot, partRotation);
    localNorm = rotateAroundX(localNorm, partRotation);
  }

  localPos.y += bodyBob;

  vec3 rotated = rotateAroundY(localPos, yaw);
  vec3 worldPos = rotated + aOffset.xyz;
  gl_Position = uProj * uView * vec4(worldPos, 1.0);
  wsPos = vec4(worldPos, 1.0);

  vec3 rotatedNormal = rotateAroundY(localNorm, yaw);
  normal = vec4(normalize(rotatedNormal), 0.0);
  uv = aUV;

  vec3 paletteColor = mix(aPrimaryColor, aSecondaryColor, clamp(aPaletteMix, 0.0, 1.0));
  baseColor = paletteColor * aColor;
}
