export const BACKGROUND_VERTEX_SHADER = `#version 300 es
precision highp float;
// Fullscreen quad vertices in clip space
const vec2 positions[4] = vec2[4](
    vec2(-1.0, -1.0),
    vec2( 1.0, -1.0), 
    vec2(-1.0,  1.0),
    vec2( 1.0,  1.0)
);
out vec2 v_uv;
void main() {
    gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
    v_uv = (positions[gl_VertexID] + 1.0) * 0.5; // Convert to 0-1 range
}`;

export const BACKGROUND_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_backgroundTexture;
uniform float u_opacity;
in vec2 v_uv;
out vec4 outColor;

void main() {
    // Apply opacity and blend with white
    vec4 textureColor = texture(u_backgroundTexture, v_uv);
    vec3 finalColor = mix(vec3(1.0), textureColor.rgb, u_opacity);
    outColor = vec4(finalColor, 1.0);
}`;