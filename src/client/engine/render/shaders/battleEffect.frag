precision mediump float;

varying vec2 uv;
varying vec4 effectColor;

void main() {
  vec2 centered = uv * 2.0 - 1.0;
  float dist = length(centered);
  float alpha = smoothstep(1.0, 0.2, dist) * effectColor.a;
  if (alpha <= 0.02) discard;
  gl_FragColor = vec4(effectColor.rgb, alpha);
}
