// Canvas 2D renderer. Draws the frame's points as a glowing, multicolor path.
// Each segment is stroked in its own point color with shadowBlur for the glow;
// closed gradient shapes also get a soft translucent fill for body.

import type { Frame } from "../engine";
import type { Renderer } from "./types";

export const canvas2dRenderer: Renderer = {
  draw(ctx, frame, w, h) {
    ctx.clearRect(0, 0, w, h);
    const pts = frame.points;
    if (pts.length < 2) return;

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Soft filled body for closed gradient/solid shapes.
    if (frame.fill !== "stroke" && frame.closed) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.globalAlpha = frame.opacity * 0.28;
      const grad = ctx.createLinearGradient(
        -frame.points[0].x - 80,
        0,
        80,
        0,
      );
      grad.addColorStop(0, pts[0].color);
      grad.addColorStop(0.5, pts[Math.floor(pts.length / 2)].color);
      grad.addColorStop(1, pts[pts.length - 1].color);
      ctx.fillStyle = grad;
      ctx.shadowBlur = frame.glow * 0.6;
      ctx.shadowColor = pts[Math.floor(pts.length / 2)].color;
      ctx.fill();
    }

    // Glowing multicolor outline.
    ctx.globalAlpha = frame.opacity;
    ctx.shadowBlur = frame.glow;
    const lineWidth = 3 + frame.softness * 9;
    ctx.lineWidth = lineWidth;

    const count = frame.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < count; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      ctx.strokeStyle = a.color;
      ctx.shadowColor = a.color;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    ctx.restore();
  },
};
