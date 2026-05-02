precision mediump float;

uniform vec3 uLightDir;
uniform vec3 uAmbient;
uniform vec3 uSunColor;
uniform vec3 uCameraPos;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform int uShadowTechnique;
uniform float uShadowStrength;
uniform sampler2D uShadowMap;
uniform vec2 uShadowMapTexelSize;

varying vec4 normal;
varying vec4 wsPos;
varying vec2 uv;
varying vec4 effectColor;
varying vec4 shadowPos;

float sampleShadowMapVisibility(vec4 lightSpacePos, float dotNL) {
  vec3 projected = lightSpacePos.xyz / max(lightSpacePos.w, 0.0001);
  vec3 coord = projected * 0.5 + 0.5;
  if (coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0 || coord.z < 0.0 || coord.z > 1.0) {
    return 1.0;
  }

  float bias = max(0.002, 0.005 * (1.0 - dotNL));
  float visibility = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      float closestDepth = texture2D(uShadowMap, coord.xy + vec2(float(x), float(y)) * uShadowMapTexelSize).r;
      visibility += coord.z - bias <= closestDepth ? 1.0 : 0.0;
    }
  }
  return visibility / 9.0;
}

float shadowVolumeVisibility(vec3 worldPos, vec3 lightDir, vec3 normalDir) {
  vec2 volumePlane = worldPos.xz - lightDir.xz * max(worldPos.y - 48.0, 0.0) * 0.38;
  vec2 cell = floor(volumePlane * 0.12);
  float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
  float silhouette = step(0.56, h);
  float sideFacing = smoothstep(0.0, 0.72, 1.0 - abs(dot(normalDir, lightDir)));
  float extrusion = smoothstep(0.2, 1.0, 1.0 - dot(normalDir, lightDir));
  return mix(1.0, 0.48, silhouette * sideFacing * extrusion);
}

void main() {
  vec4 n = gl_FrontFacing ? normal : -normal;
  vec3 nrm = normalize(n.xyz);
  vec3 ldir = normalize(uLightDir);
  float dotNL = clamp(dot(ldir, nrm), 0.0, 1.0);

  float visibility = 1.0;
  if (uShadowTechnique == 1) {
    visibility = mix(1.0 - clamp(uShadowStrength, 0.0, 0.95), 1.0, sampleShadowMapVisibility(shadowPos, dotNL));
  } else if (uShadowTechnique == 2) {
    visibility = mix(1.0 - clamp(uShadowStrength, 0.0, 0.95), 1.0, shadowVolumeVisibility(wsPos.xyz, ldir, nrm));
  }

  // AO variant: use a face-orientation factor so cubes/triangles get readable self-darkening.
  float ao = mix(0.7, 1.0, clamp(nrm.y * 0.5 + 0.5, 0.0, 1.0));
  if (uShadowTechnique != 0) ao = 1.0;

  vec3 diffuse = dotNL * uSunColor * visibility;
  // Keep move hue stable under strong sunlight/shadow transitions.
  vec3 lit = effectColor.rgb * (uAmbient * 0.95 + diffuse * 0.33) * ao;
  // Bounded Reinhard tonemap prevents channels from blowing out to full white.
  vec3 toned = lit / (1.0 + lit);
  float baseMax = max(max(effectColor.r, effectColor.g), max(effectColor.b, 0.0001));
  vec3 baseChroma = effectColor.rgb / baseMax;
  float tonedLuma = dot(toned, vec3(0.2126, 0.7152, 0.0722));
  vec3 hueLocked = baseChroma * tonedLuma;
  vec3 colorOut = mix(toned, hueLocked, 0.78);
  colorOut = mix(colorOut, effectColor.rgb, 0.22);

  // If chroma collapses in highlights, pull it back toward the move hue.
  float cMax = max(max(colorOut.r, colorOut.g), colorOut.b);
  float cMin = min(min(colorOut.r, colorOut.g), colorOut.b);
  float chroma = cMax - cMin;
  if (chroma < 0.1) {
    colorOut = mix(colorOut, hueLocked, 0.6);
  }

  // Hard ceiling below 1.0 avoids 255,255,255 clipping while preserving hue.
  float peak = max(max(colorOut.r, colorOut.g), colorOut.b);
  if (peak > 0.82) {
    colorOut *= 0.82 / peak;
  }

  vec3 d = wsPos.xyz - uCameraPos;
  float cylDist = max(length(d.xz), abs(d.y));
  float fog = clamp((cylDist - uFogNear) / max(uFogFar - uFogNear, 0.0001), 0.0, 1.0);
  // Preserve move hue in fog instead of lerping directly to bright sky fog color.
  vec3 fogTint = mix(uFogColor, colorOut, 0.58);
  gl_FragColor = vec4(mix(colorOut, fogTint, fog * 0.55), effectColor.a);
}
