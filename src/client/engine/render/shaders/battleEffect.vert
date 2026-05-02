precision mediump float;

uniform mat4 uView;
uniform mat4 uProj;
uniform mat4 uLightViewProj;

attribute vec4 aVertPos;
attribute vec4 aNorm;
attribute vec2 aUV;
attribute vec4 aOffset; // xyz = center, w = scale
attribute vec4 aMeta; // x = shape, y = elongation, z = yaw
attribute vec4 aColor;

varying vec4 normal;
varying vec4 wsPos;
varying vec2 uv;
varying vec4 effectColor;
varying vec4 shadowPos;

vec3 rotateAroundY(vec3 v, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}

void main() {
  float scale = aOffset.w;
  float shape = aMeta.x;
  float elongation = max(0.6, aMeta.y);
  float yaw = aMeta.z;

  vec3 p = (aVertPos.xyz - vec3(0.5, 0.5, 0.5));
  p.y *= elongation;

  // shape 0: block, shape 1: triangular/pyramidal projectile.
  if (shape > 0.5) {
    float top = clamp((p.y + 0.5) / 1.0, 0.0, 1.0);
    float taper = mix(1.0, 0.18, top);
    p.xz *= taper;
  }

  p *= scale;
  vec3 n = aNorm.xyz;
  n = rotateAroundY(n, yaw);
  p = rotateAroundY(p, yaw);
  vec3 worldPos = aOffset.xyz + p;

  wsPos = vec4(worldPos, 1.0);
  normal = vec4(normalize(n), 0.0);
  uv = aUV;
  effectColor = aColor;
  shadowPos = uLightViewProj * vec4(worldPos, 1.0);
  gl_Position = uProj * uView * vec4(worldPos, 1.0);
}
