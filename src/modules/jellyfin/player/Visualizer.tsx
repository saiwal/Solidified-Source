// Frequency bars under the full player's controls. Mounting it is what routes
// the <audio> element through Web Audio (see analyser() in the store). Draws
// only while playing; rAF already stops in a hidden tab.
import { createEffect, onCleanup } from "solid-js";
import { analyser, playing } from "../store";

const BARS = 48; // of the 64 bins — the top ones are near-empty for music

export default function Visualizer() {
  let canvas!: HTMLCanvasElement;
  const node = analyser();
  const bins = new Uint8Array(node.frequencyBinCount);

  createEffect(() => {
    if (!playing()) return;
    const g = canvas.getContext("2d")!;
    const color = getComputedStyle(canvas).getPropertyValue("--color-accent");
    let raf = 0;
    const draw = () => {
      const { width: w, height: h } = canvas;
      node.getByteFrequencyData(bins);
      g.clearRect(0, 0, w, h);
      g.fillStyle = color;
      const bw = w / BARS;
      for (let i = 0; i < BARS; i++) {
        const bh = Math.max(2, (bins[i] / 255) * h);
        g.fillRect(i * bw + 1, h - bh, bw - 2, bh);
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    onCleanup(() => cancelAnimationFrame(raf));
  });

  return <canvas ref={canvas} width={480} height={64} class="w-full h-12 opacity-80" aria-hidden="true" />;
}
