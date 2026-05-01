#version 300 es
precision highp float;

uniform mat4 uLightViewProj;

in vec4 aVertPos;
in vec4 aOffset;

void main() {
  gl_Position = uLightViewProj * vec4(aVertPos.xyz + aOffset.xyz, 1.0);
}
