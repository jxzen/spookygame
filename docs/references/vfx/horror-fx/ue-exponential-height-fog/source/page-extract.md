# Extract (fetched 2026-11-12)

## Epic docs: Exponential Height Fog (URL 1)
- Fog Density: global density factor (thickness of the layer).
- Fog Height Falloff: how fast density rises as height falls. Smaller value = wider transition.
- Fog Max Opacity: 1 = fully opaque, 0 = invisible.
- Start Distance: distance from the camera where fog starts.
- End Distance: horizontal distance where fog stops accumulating (0 = off).
- Fog Cutoff Distance: beyond it, nothing receives fog (for baked skyboxes).
- Fog Inscattering Color: primary fog colour.
- Second Fog Data: a second layer with its own Density, Height Falloff, Height Offset.
- Directional Inscattering: Exponent (cone size), Start Distance, Color. Needs a Directional Light with Atmosphere Sun Light.
- Volumetric Fog: Scattering Distribution (0 = even, 0.9 = forward toward the light; side-visible shafts need values near 0), Albedo, Emissive, Extinction Scale (>1 absorbs more), View Distance, Start Distance, Near Fade In Distance. Volumetric fog ignores Start Distance, Max Opacity and Cutoff of the height fog.
- The page says density is higher low down and lower high up, with a smooth transition, and the Actor's Z sets the base height. No defaults and no formula are given on the page.

## Forum quote of HeightFogCommon (URL 2), verbatim lines
- "// The exponential fog density function is d = GlobalDensity * exp(-HeightFalloff * z)"
- "// Calculate the line integral of the ray from the camera to the receiver position through the fog density function"
- `float ExponentialHeightLineIntegralShared = RayOriginTerms * (1.0f - exp2(-Falloff) ) / Falloff;`
- `float ExponentialHeightLineIntegral = ExponentialHeightLineIntegralShared * max(RayLength - ExponentialFogParameters.w, 0.0f);`
- `float ExpFogFactor = max(saturate(exp2(-ExponentialHeightLineIntegral)), MinFogOpacity);`
