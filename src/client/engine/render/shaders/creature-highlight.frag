precision mediump float;

varying vec3 vNormal;
varying vec3 vToCamera;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vToCamera);

  float fresnel = pow(1.0 - abs(dot(normal, viewDir)), 2.2);
  float alpha = clamp(0.25 + fresnel * 0.75, 0.2, 0.85);

  vec3 inner = vec3(0.15, 1.0, 0.45);
  vec3 outer = vec3(1.0, 1.0, 0.45);
  vec3 color = mix(inner, outer, fresnel);

  gl_FragColor = vec4(color, alpha);
}
