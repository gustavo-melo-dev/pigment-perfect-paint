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
    precision highp float;
    layout(location = 0) in vec2 a_position;
    layout(location = 1) in vec2 a_brushTexCoord;
    uniform vec2 u_resolution;
    out vec2 v_texCoord; // normalized texture coordinates passed to fragment shader
    out vec2 v_brushTexCoord; // brush texture coordinates

    void main() {
        vec2 zeroToOne = a_position / u_resolution;
        vec2 zeroToTwo = zeroToOne * 2.0;
        vec2 clipSpace = zeroToTwo - 1.0;
        gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
        // Flip Y for texture coords to match the flipped clip-space
        v_texCoord = vec2(zeroToOne.x, 1.0 - zeroToOne.y);
        v_brushTexCoord = a_brushTexCoord;
    }`;

/**
 * This fragment shader outputs a uniform color for every fragment (pixel) drawn.
 * - u_color: the RGBA color to use for the brush stroke.
 * - u_brushTexture: the brush texture to apply
 * The output color is set to u_color, allowing for transparency and color control.
 */
export let BRUSH_FRAGMENT_SHADER = `#version 300 es
    precision highp float;
    uniform vec4 u_color;
    uniform sampler2D u_previousTexture;
    uniform sampler2D u_brushTexture;
    in vec2 v_texCoord; // normalized texture coordinates from vertex shader
    in vec2 v_brushTexCoord; // brush texture coordinates
    out vec4 outColor;

    // uncomment the following line if you work in linear space
    // #define MIXBOX_COLORSPACE_LINEAR

    uniform sampler2D mixbox_lut; // bind mixbox.lutTexture(gl) here
    uniform int u_useMixbox; // 1 = use MIXBOX, 0 = use RGB

    #include "mixbox.glsl"

    void main() {
        vec4 dstColor = texture(u_previousTexture, v_texCoord);
        vec4 brushTexel = texture(u_brushTexture, v_brushTexCoord);
        
        // Get brush texture alpha as a mask
        float brushMask = brushTexel.a;
        
        // Normalize brush opacity to a 0-1 range (where 1.0 is fully opaque)
        float normalizedOpacity = u_color.a;
        
        // Calculate final brush strength based on the brush texture and opacity
        // When opacity is 1.0, we want the brush to be fully opaque
        float brushStrength;
        
        if (normalizedOpacity >= 0.99) {
            // At max opacity, use the brush mask directly for complete coverage
            brushStrength = brushMask;
        } else {
            // For lower opacity settings, use a gentler blending factor
            brushStrength = brushMask * normalizedOpacity * 0.3;
        }
        
        // No threshold - smooth blend based on actual brush texture alpha
        vec3 my_color = vec3(u_color.r, u_color.g, u_color.b);
        vec3 canvas_color = vec3(dstColor.r, dstColor.g, dstColor.b);
        
        // Choose mixing mode based on u_useMixbox flag
        vec3 mixedColor;
        if (u_useMixbox == 1) {
            // Mix colors using mixbox, with the calculated brush strength
            mixedColor = mixbox_lerp(canvas_color, my_color, brushStrength);
        } else {
            // Simple RGB linear interpolation
            mixedColor = mix(canvas_color, my_color, brushStrength);
        }
        
        // Opacity accumulation that respects the brush texture alpha
        // For full opacity (1.0), we want to reach full opacity faster
        float newAlpha;
        if (normalizedOpacity >= 0.99) {
            // At max opacity, quickly reach full opacity where brush is applied
            newAlpha = max(dstColor.a, brushMask);
        } else {
            // For lower opacity, more gentle accumulation
            newAlpha = dstColor.a + brushStrength * 0.5;
        }
        newAlpha = min(newAlpha, 1.0);
        
        outColor = vec4(mixedColor, newAlpha);
    }`;
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