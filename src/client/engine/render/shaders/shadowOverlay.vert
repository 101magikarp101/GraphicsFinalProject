#version 300 es
precision highp float;

in vec4 aVertPos;

void main() {
  gl_Position = vec4(aVertPos.xy * 2.0, 1.0, 1.0);
}
