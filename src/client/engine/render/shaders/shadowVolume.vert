#version 300 es
precision highp float;

uniform mat4 uView;
uniform mat4 uProj;
uniform vec3 uLightDir;

in vec4 aVertPos;
in vec4 aOffset;
in vec4 aScale;

const float SHADOW_VOLUME_LIGHT_BIAS = 0.03;

void main() {
  vec3 lightBias = -normalize(uLightDir) * SHADOW_VOLUME_LIGHT_BIAS;
  vec3 world = aVertPos.xyz * aScale.xyz + aOffset.xyz - normalize(uLightDir) * aVertPos.w + lightBias;
  gl_Position = uProj * uView * vec4(world, 1.0);
}
