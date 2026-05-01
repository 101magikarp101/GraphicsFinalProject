#version 300 es
precision highp float;

uniform mat4 uView;
uniform mat4 uProj;

in vec4 aVertPos;

void main() {
  gl_Position = uProj * uView * aVertPos;
}
