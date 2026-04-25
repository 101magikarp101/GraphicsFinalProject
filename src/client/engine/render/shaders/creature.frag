precision mediump float;

uniform vec4 uLightPos;
uniform vec3 uAmbient;
uniform vec3 uSunColor;
uniform vec3 uCameraPos;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;

varying vec4 normal;
varying vec4 wsPos;
varying vec2 uv;
varying vec3 baseColor;

void main() {
  vec3 kd = baseColor;

  // Slight belly lift to avoid fully flat shading on underside faces.
  if (uv.y > 0.8) {
    kd = mix(kd, kd * 1.08, 0.2);
  }

  vec4 n = gl_FrontFacing ? normal : -normal;
  vec4 lightDirection = uLightPos - wsPos;
  float dot_nl = dot(normalize(lightDirection), normalize(n));
  dot_nl = clamp(dot_nl, 0.0, 1.0);

  vec3 ambient = uAmbient * kd;
  vec3 diffuse = dot_nl * kd * uSunColor;
  vec3 lit = clamp(ambient + diffuse, 0.0, 1.0);

  vec3 d = wsPos.xyz - uCameraPos;
  float cylDist = max(length(d.xz), abs(d.y));
  float fog = clamp((cylDist - uFogNear) / max(uFogFar - uFogNear, 0.0001), 0.0, 1.0);

  gl_FragColor = vec4(mix(lit, uFogColor, fog), 1.0);
}
