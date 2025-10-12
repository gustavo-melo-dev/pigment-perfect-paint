import mixbox from 'mixbox';

/**
 * @constant
 * This vertex shader transforms 2D canvas coordinates into clip space for WebGL rendering.
 * - a_position: the input vertex position in pixel coordinates.
 * - a_brushTexCoord: texture coordinates for the brush texture
 * - u_resolution: the canvas resolution (width, height).
 * The shader normalizes the position to [0,1], then to [-1,1] (clip space),
 * and flips the y-axis so that (0,0) is at the top-left (matching canvas coordinates).
 *
 */
export const BRUSH_VERTEX_SHADER = `#version 300 es

#define MAX_ROTATION 0.25

precision highp float;
    layout(location = 0) in vec2 a_position;
    
    // We'll get the resolution from layer dimensions now
    uniform float layer_width;
    uniform float layer_height;
    uniform vec2 u_translate; // translation to apply to the brush quad
    uniform float size; // brush size for calculating texture coordinates
    uniform float u_randomSeed;  // seed to randomize a little bit the brush texture coords
    
    out vec2 v_texCoord; // normalized texture coordinates passed to fragment shader
    out vec2 v_brushTexCoord; // brush texture coordinates
    
    float random(float seed) {
       return fract(sin(seed * 12.9898) * 43758.5453);
    }

    void main() {
        float randomAngle = (random(u_randomSeed) - 0.5) * MAX_ROTATION;
        
        // rotate the position
        float cosA = cos(randomAngle);
        float sinA = sin(randomAngle);
        vec2 rotatedPos = vec2(
            a_position.x * cosA - a_position.y * sinA,
            a_position.x * sinA + a_position.y * cosA
        );
        
        // apply the translation
        vec2 translatedPos = a_position + u_translate;

        vec2 resolution = vec2(layer_width, layer_height);
        vec2 zeroToOne = translatedPos / resolution;
        vec2 zeroToTwo = zeroToOne * 2.0;
        vec2 clipSpace = zeroToTwo - 1.0;
        gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
        // Flip Y for texture coords to match the flipped clip-space
        v_texCoord = vec2(zeroToOne.x, 1.0 - zeroToOne.y);
        v_brushTexCoord = (rotatedPos / (size * 0.5)) * 0.5 + 0.5;
    }`;

/**
 * This fragment shader outputs a uniform color for every fragment (pixel) drawn.
 * - u_color: the RGBA color to use for the brush stroke.
 * - u_brushTexture: the brush texture to apply
 * The output color is set to u_color, allowing for transparency and color control.
 */

export let BRUSH_FRAGMENT_SHADER = `#version 300 es
precision highp float;

// Blend modes
#define BRUSH_BLEND_NORMAL 0
#define BRUSH_BLEND_MULTIPLY 1
#define BRUSH_BLEND_SUBTRACT 2
#define BRUSH_BLEND_DARKEN 3
#define BRUSH_BLEND_HEIGHT 4
#define MIXMODE_MIXBOX 0
#define MIXMODE_RGB 1

// Brush parameters
uniform float size;
uniform float opacity;
uniform float flow;
uniform vec3 color;
uniform float mask_width;
uniform float mask_height;
uniform sampler2D mask_texture;
uniform float layer_width;
uniform float layer_height;
uniform sampler2D layer_stroke_texture;
uniform int mix_mode;
uniform sampler2D mixbox_lut;

in vec2 v_texCoord;
in vec2 v_brushTexCoord;
out vec4 fragColor;

#include "mixbox.glsl"

void main(void) {
    float radius = size/2.0;
    vec2 localUV = v_brushTexCoord;
    
    // calculate alpha mask
    float maskAlpha = texture(mask_texture, localUV).r;
    if (maskAlpha < 0.01) discard;
    maskAlpha = flow*maskAlpha;

    vec4 layerData = texture(layer_stroke_texture,vec2(gl_FragCoord.xy)/vec2(layer_width,layer_height)).rgba;
    
    float alphaA = maskAlpha;
    float alphaB = layerData.a;
    
    // For the alpha output, still use the normal alpha blending
    float fullOpacityAlpha = mix(layerData.a, 1.0, maskAlpha);
    
    // First, calculate the full-strength color using MIXBOX (or RGB) without any opacity limitation
    mixbox_latent latA = mixbox_rgb_to_latent(color); // Use the original color for rich MIXBOX mixing
    mixbox_latent latB = mixbox_rgb_to_latent(layerData.rgb);
    float denom = (alphaA + alphaB * (1.0 - alphaA));
    vec3 fullStrengthRGB = vec3(0.0);
    
    if(denom > 0.0) {
        if (mix_mode == MIXMODE_MIXBOX) {
            // Use MIXBOX for rich color mixing
            fullStrengthRGB = mixbox_latent_to_rgb((latB * alphaB * (1.0 - alphaA) + alphaA * latA) / denom);
        } else {
            // Use RGB mixing
            fullStrengthRGB = (layerData.rgb * alphaB * (1.0 - alphaA) + alphaA * color) / denom;
        }
    }
    
    // Now apply opacity as a cap by blending between the canvas color and the full-strength color
    // For darker colors like black, this ensures they can only reach the opacity-defined darkness
    float whiteValue = 1.0 - opacity; // Minimum lightness value based on opacity
    
    // Get the perceived brightness of the mixed color (average of RGB components)
    float brightness = (fullStrengthRGB.r + fullStrengthRGB.g + fullStrengthRGB.b) / 3.0;
    
    // Calculate how much we need to lighten the color to respect the opacity cap
    float targetBrightness = max(brightness, whiteValue);
    float lightenAmount = targetBrightness - brightness;
    
    // Apply the lightening while preserving the color's hue
    vec3 cappedRGB;
    if (lightenAmount > 0.0) {
        // Lighten the color while preserving its hue
        cappedRGB = mix(fullStrengthRGB, vec3(1.0), lightenAmount);
    } else {
        cappedRGB = fullStrengthRGB;
    }
    
    // For the final result, blend between the original canvas and the capped color
    vec3 finalRGB = mix(layerData.rgb, cappedRGB, maskAlpha);
    float finalAlpha = fullOpacityAlpha;
    
    fragColor = vec4(finalRGB, finalAlpha);
}
`;
BRUSH_FRAGMENT_SHADER = BRUSH_FRAGMENT_SHADER.replace('#include "mixbox.glsl"', mixbox.glsl());

// Simple full-screen copy shaders used to blit the previous texture into the current target
export const COPY_VERTEX_SHADER = `#version 300 es
precision highp float;
// Full-screen triangle in clip space
const vec2 pos[3] = vec2[3](
    vec2(-1.0, -1.0),
    vec2( 3.0, -1.0),
    vec2(-1.0,  3.0)
);
out vec2 v_uv;
void main(){
    gl_Position = vec4(pos[gl_VertexID], 0.0, 1.0);
    // map clip-space triangle verts into 0-1 UV range
    v_uv = (pos[gl_VertexID]*0.5)+0.5;
}`;

export const COPY_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_src; // previous texture
in vec2 v_uv;
out vec4 outColor;
void main(){
    outColor = texture(u_src, v_uv);
}`;