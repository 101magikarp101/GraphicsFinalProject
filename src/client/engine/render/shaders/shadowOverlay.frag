#version 300 es
precision highp float;

uniform float uShadowStrength;
uniform vec3 uLightDir;

out vec4 fragColor;

void main() {
  float horizonFade = smoothstep(0.08, 0.24, max(uLightDir.y, 0.0));
  float factor = 1.0 - clamp(uShadowStrength, 0.0, 0.95) * horizonFade;
  fragColor = vec4(vec3(factor), 1.0);
}
