#version 300 es
precision highp float;

uniform float uShadowStrength;

out vec4 fragColor;

void main() {
  fragColor = vec4(0.0, 0.0, 0.0, clamp(uShadowStrength, 0.0, 0.95));
}
