import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Button } from "./ui";

/**
 * A box to sign in with a finger, a stylus or a mouse. Hands back a PNG data
 * URL when the pen lifts, or null when cleared. Drawn black on white so it
 * prints the way it was signed.
 */
export function SignaturePad({ value, onChange, disabled }: {
  value: string | null; onChange: (dataUrl: string | null) => void; disabled?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(!value);

  // Draw a saved signature back in, and keep the drawing sharp on high-density screens.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = c.getBoundingClientRect();
    c.width = Math.round(width * ratio);
    c.height = Math.round(height * ratio);
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, width, height);
      img.src = value;
    }
    // Only when first shown; after that the canvas is the truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = point(e);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    setEmpty(false);
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (canvas.current) onChange(canvas.current.toDataURL("image/png"));
  }
  function clear() {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const { width, height } = c.getBoundingClientRect();
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    setEmpty(true);
    onChange(null);
  }

  return (
    <div>
      <div className="relative">
        <canvas
          ref={canvas}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
          className="h-40 w-full max-w-xl touch-none rounded-sm border-2 border-field-line bg-white"
          aria-label="Signature box"
        />
        {empty && !disabled && (
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-black/40">Sign here</span>
        )}
      </div>
      {!disabled && (
        <Button variant="ghost" className="mt-1" onClick={clear} disabled={empty}><Eraser className="h-4 w-4" />Clear the signature</Button>
      )}
    </div>
  );
}
