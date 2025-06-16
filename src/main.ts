import { Canvas } from "./Canvas";
import { Brush } from "./Brush";
import { Line } from "./Line";
import { createFullscreenQuad } from "./fullscreenQuad";

// create a full-screen canvas and attach it to the html
const canvasElement = document.createElement("canvas");
canvasElement.style.border = "1px solid black";
canvasElement.width = window.innerWidth;
canvasElement.height = window.innerHeight;
document.body.appendChild(canvasElement);

// create a WebGL2 context and initialize the canvas
const webglCanvas = new Canvas(canvasElement);
const gl = webglCanvas.gl;

const brush = new Brush(gl);

const lines: Line[] = [];
let currentLine: Line | null = null;
let drawing = false;

const { vao: screenVAO, program: screenProgram } = createFullscreenQuad(gl);

// on resize, update canvas size and WebGL viewport
window.addEventListener("resize", () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvasElement.width = w;
  canvasElement.height = h;
  webglCanvas.resize(w, h);
  webglCanvas.clear();
  redrawAll();
});

/**
 * Converts a MouseEvent's client coordinates to coordinates relative to the canvas element.
 * This is useful for drawing on the canvas, as it accounts for the canvas's position on the page.
 *
 * @param {MouseEvent} event - The mouse event containing the coordinates
 * @returns {{ x: number; y: number; }} 
 */
function getCanvasRelativeCoords(event: MouseEvent): { x: number; y: number; } {
  const rect = canvasElement.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}


// On mouse down, start a new line
canvasElement.addEventListener("mousedown", (e) => {
  drawing = true;
  const pos = getCanvasRelativeCoords(e);
  currentLine = new Line(pos);
});

// On mouse move, add points to the current line and draw it
canvasElement.addEventListener("mousemove", (e) => {
  if (!drawing || !currentLine) return;
  const pos = getCanvasRelativeCoords(e);
  currentLine.addPoint(pos);

  // Draw current stroke to framebuffer
  webglCanvas.drawToFramebuffer(() => {
    brush.draw(currentLine!, canvasElement.width, canvasElement.height);
  });

  redrawScreen();
});

// On mouse up, finalize the current line and add it to the list of lines
canvasElement.addEventListener("mouseup", () => {
  drawing = false;
  if (currentLine) {
    lines.push(currentLine);
    currentLine = null;
  }
});

/** Redraws ALL lines on the WebGL canvas. 
 *  Used after the canvas is resized.
 */
function redrawAll(): void {
  webglCanvas.clear();
  webglCanvas.drawToFramebuffer(() => {
    for (const line of lines) {
      brush.draw(line, canvasElement.width, canvasElement.height);
    }
  });
  redrawScreen();
}

/** Draws the framebuffer to the screen.
 *  Used when a new line is drawn.
 */
function redrawScreen(): void {
  webglCanvas.drawFramebufferToScreen(screenProgram, screenVAO);
}

// Initial clear and redraw
redrawAll();
