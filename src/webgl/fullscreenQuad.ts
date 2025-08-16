/**
 * Creates a fullscreen quad for rendering.
 *
 * @export
 * @param {WebGL2RenderingContext} gl - The WebGL2 rendering context to use for creating the quad.
 * @returns {{
 *   vao: WebGLVertexArrayObject;
 *   program: WebGLProgram;
 * }} 
 */
export function createFullscreenQuad(gl: WebGL2RenderingContext): {
  vao: WebGLVertexArrayObject;
  program: WebGLProgram;
} {
  // Vertex shader to draw texture to screen
  const vsSource = `#version 300 es
  precision highp float;
  layout(location = 0) in vec2 a_position;
  out vec2 v_uv;
  void main() {
    v_uv = (a_position + 1.0) * 0.5;
    gl_Position = vec4(a_position, 0, 1);
  }`;

  // Fragment shader that samples the framebuffer texture
  const fsSource = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_texture;
  out vec4 outColor;
  void main() {
    outColor = texture(u_texture, v_uv);
  }`;

  const program = createProgram(gl, vsSource, fsSource);

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  // Fullscreen quad vertices (clip space)
  const vertices = new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    1, 1,
  ]);
  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);

  return { vao, program };
}

function createProgram(
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string
): WebGLProgram {
  const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vertexShader, vsSource);
  gl.compileShader(vertexShader);
  if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(vertexShader)!);

  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fragmentShader, fsSource);
  gl.compileShader(fragmentShader);
  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(fragmentShader)!);

  const program = gl.createProgram()!;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.bindAttribLocation(program, 0, "a_position");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program)!);

  return program;
}
