precision mediump float;

uniform mat4 uView;
uniform mat4 uProj;
uniform vec3 uCameraPos;

attribute vec4 aVertPos;
attribute vec4 aNorm;
attribute vec2 aUV;
attribute vec4 aOffset; // xyz = center, w = scale
attribute vec4 aColor;

varying vec2 uv;
varying vec4 effectColor;

void main() {
  vec3 toCamera = normalize(uCameraPos - aOffset.xyz);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCamera));
  vec3 up = normalize(cross(toCamera, right));
  vec3 worldPos = aOffset.xyz + (right * aVertPos.x + up * aVertPos.y) * aOffset.w;
  gl_Position = uProj * uView * vec4(worldPos, 1.0);
  uv = aUV;
  effectColor = aColor;
}
