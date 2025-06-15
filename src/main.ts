import p5 from 'p5';
import { Canvas } from './Canvas';
import { Brush } from './Brush';
import { Line } from './Line';

const sketch = (p: p5) => {
  let canvas: Canvas;
  let brush: Brush;
  let drawing = false;

  let currentLine: Line | null = null;
  let lines: Line[] = [];

  p.setup = () => {
    canvas = new Canvas(p);
    canvas.setupCanvas(800, 600);
    brush = new Brush(p, p.color(0), 3);
  };

  p.mousePressed = () => {
    drawing = true;

    const pVector = p.createVector(p.mouseX, p.mouseY);
    currentLine = new Line(pVector);
  };

  p.mouseDragged = () => {
    if (!drawing || !currentLine) return;

    const pVector = p.createVector(p.mouseX, p.mouseY);
    currentLine.addPoint(pVector);

    brush.draw(currentLine);
  };

  p.mouseReleased = () => {
    drawing = false;

    if (currentLine) {
      lines.push(currentLine);
      currentLine = null;
    }
  };

  p.draw = () => {
    if (!drawing) return;

    if (currentLine) {
      brush.draw(currentLine);
    }

  };
};

new p5(sketch);
