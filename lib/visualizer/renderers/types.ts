// A renderer turns a computed Frame into pixels. Keeping this behind an
// interface is what lets a WebGL/shader renderer drop in later WITHOUT touching
// the engine — "render style" is just one more pluggable axis.

import type { Frame } from "../engine";

export interface Renderer {
  /** Draw a frame. (w, h) are CSS pixels; the origin (0,0) is top-left and the
   *  frame's points are offsets from the visualizer center, so the renderer
   *  translates by (w/2, h/2). */
  draw(ctx: CanvasRenderingContext2D, frame: Frame, w: number, h: number): void;
}
