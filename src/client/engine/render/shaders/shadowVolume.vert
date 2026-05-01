#version 300 es
precision highp float;

uniform mat4 uView;
uniform mat4 uProj;

in vec4 aVertPos;
in vec4 aOffset;

void main() {
  gl_Position = uProj * uView * vec4(aVertPos.xyz + aOffset.xyz, 1.0);
}
