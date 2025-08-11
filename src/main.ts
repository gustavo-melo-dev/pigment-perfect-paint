import { Canvas } from "./canvas/Canvas";
import { Brush } from "./brush/Brush";
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

  webglCanvas.currentLine = new Line(pos, brush.color);
});

// On mouse move, add points to the current line and draw it
canvasElement.addEventListener("mousemove", (e) => {
  if (!drawing || !webglCanvas.currentLine) return;
  const pos = getCanvasRelativeCoords(e);
  webglCanvas.currentLine.addPoint(pos);

  // Draw only the new part incrementally - this allows self-interaction
  // without the over-accumulation issue
  brush.drawIncremental(webglCanvas.currentLine, canvasElement.width, canvasElement.height, webglCanvas);

  redrawScreen();
});

// On mouse up, finalize the current line and add it to the list of lines
canvasElement.addEventListener("mouseup", () => {
  drawing = false;
  if (webglCanvas.currentLine) {
    webglCanvas.lines.push(webglCanvas.currentLine);
    webglCanvas.currentLine = null;
  }
});

/** Redraws ALL lines on the WebGL canvas. 
 *  Used after the canvas is resized.
 */
function redrawAll(): void {
  webglCanvas.clear();
  for (const line of webglCanvas.lines) {
    brush.draw(line, canvasElement.width, canvasElement.height, webglCanvas);
  }
  redrawScreen();
}

/** Draws the framebuffer to the screen.
 *  Used when a new line is drawn.
 */
function redrawScreen(): void {
  webglCanvas.drawFramebufferToScreen(screenProgram, screenVAO);
}

// keydown event to change brush color
window.addEventListener("keydown", (e) => {
  if (drawing) return; // Don't change color while drawing

  if (e.key === "r" || e.key === "R") {
    brush.setColor([1, 0, 0, 0.3]); // red
  } else if (e.key === "y" || e.key === "Y") {
    brush.setColor([1, 1, 0, 0.3]); // yellow
  } else if (e.key === "b" || e.key === "B") {
    brush.setColor([0, 0, 1, 0.3]); // blue
  }
});

// amimir honk shooo
await new Promise((resolve) => setTimeout(resolve, 200));

// Initial clear and redraw
redrawAll();
