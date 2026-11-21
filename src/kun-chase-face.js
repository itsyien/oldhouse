// The GLB carries a fixed, opaque mosaic for viewers without the chase shader.
export function prepareKunChaseFace(model) {
  const clock = { value: 0 };
  const card = model.getObjectByName('Kun_FaceBillboard');
  const material = card?.material;
  if (material?.name !== 'Kun_FaceMosaic') return { count: 0, setTime() {} };

  card.frustumCulled = false;
  material.toneMapped = false;
  material.customProgramCacheKey = () => 'kun-mosaic-billboard-v2';
  material.onBeforeCompile = shader => {
    shader.uniforms.kunTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float kunFront;')
      .replace('#include <project_vertex>', `
        vec4 mvPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec3 forward = normalize(modelViewMatrix[2].xyz);
        kunFront = dot(forward, normalize(-mvPosition.xyz));
        float side = 1.0 - clamp(kunFront, 0.0, 1.0);
        vec2 cardScale = vec2(length(modelViewMatrix[0].xyz), length(modelViewMatrix[1].xyz));
        mvPosition.xy += transformed.xy * cardScale * vec2(1.0 - side * 0.18, 1.0);
        mvPosition.xy -= forward.xy * (side * 0.070) * cardScale.x;
        mvPosition.z += (0.007 + side * 0.098) * cardScale.x;
        gl_Position = projectionMatrix * mvPosition;
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float kunFront;
        uniform float kunTime;
        float kunNoise(vec2 p) {
          vec3 q = fract(vec3(p.xyx) * .1031);
          q += dot(q, q.yzx + 33.33);
          return fract((q.x + q.y) * q.z);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (kunFront < -.34) discard;
        float tick = mod(floor(kunTime * 17.0), 197.0);
        vec2 cells = vMapUv * vec2(14.0, 12.0);
        float row = floor(cells.y);
        float band = step(.85, kunNoise(vec2(row, floor(tick / 3.0))));
        vec2 block = floor(cells + vec2(band * 2.0, 0.0));
        float flicker = kunNoise(block + vec2(tick * 2.3, tick * 4.1));
        float grains = kunNoise(floor(gl_FragCoord.xy) + vec2(31.0, 7.0) * tick);
        float signal = clamp(flicker + grains * .11 - band * .16, 0.0, 1.0);
        vec3 dark = vec3(.008, .27, .024);
        vec3 green = vec3(.027, .85, .057);
        vec3 bright = vec3(.56, 1.4, .57);
        vec3 pixels = mix(dark, green, smoothstep(0.0, .38, signal));
        pixels = mix(pixels, bright, smoothstep(.54, .98, signal));
        diffuseColor.rgb = mix(diffuseColor.rgb, pixels, .88);
      `);
  };
  material.needsUpdate = true;
  return { count: 1, setTime: seconds => { clock.value = seconds; } };
}
