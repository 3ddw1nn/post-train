"use client";

import { useRef, useState } from "react";
import { Select } from "../interactive";
import { Icon } from "../icons";

function useImageSplitter(cols: number, rowsAuto = false) {
  const [tiles, setTiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function split(file: File, colsOverride?: number) {
    setBusy(true);
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await new Promise((resolve) => {
      img.onload = resolve;
    });
    const c = colsOverride ?? cols;
    const rows = rowsAuto ? Math.max(1, Math.round(img.height / (img.width / c))) : 1;
    const tw = img.width / c;
    const th = img.height / rows;
    const out: string[] = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < c; x++) {
        const canvas = document.createElement("canvas");
        canvas.width = tw;
        canvas.height = th;
        canvas.getContext("2d")!.drawImage(img, x * tw, y * th, tw, th, 0, 0, tw, th);
        out.push(canvas.toDataURL("image/jpeg", 0.92));
      }
    }
    URL.revokeObjectURL(img.src);
    setTiles(out);
    setBusy(false);
  }

  return { tiles, busy, split };
}

function SplitterUI({
  title,
  hint,
  cols,
  selectable,
}: {
  title: string;
  hint: string;
  cols: number;
  selectable?: boolean;
}) {
  const [n, setN] = useState(cols);
  const { tiles, busy, split } = useImageSplitter(n, !selectable);
  const input = useRef<HTMLInputElement>(null);

  return (
    <div>
      {selectable && (
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          Panels:
          <Select
            className="w-20"
            value={String(n)}
            onChange={(v) => setN(Number(v))}
            options={[2, 3, 4, 5, 6, 8, 10].map((x) => ({ value: String(x), label: String(x) }))}
          />
        </div>
      )}
      <button className="btn-primary" onClick={() => input.current?.click()} disabled={busy}>
        <Icon name="upload" size={15} /> {busy ? "Slicing..." : `Upload image for ${title}`}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => e.target.files?.[0] && split(e.target.files[0], n)}
      />
      <p className="mt-2 text-xs text-muted">{hint}</p>
      {tiles.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {tiles.map((t, i) => (
            <a key={i} href={t} download={`tile-${i + 1}.jpg`} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t} alt={`Tile ${i + 1}`} className="w-full rounded-lg border border-line" />
              <span className="absolute inset-0 hidden items-center justify-center rounded-lg bg-black/40 text-xs font-bold text-white group-hover:flex">
                Download
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function InstagramGridMaker() {
  return (
    <SplitterUI
      title="the grid"
      hint="Splits your image into 3-wide tiles, top-left to bottom-right. Post them in reverse order so the grid assembles correctly."
      cols={3}
    />
  );
}

export function CarouselSplitter() {
  return (
    <SplitterUI
      title="the carousel"
      hint="Slices a wide panorama into equal swipeable panels."
      cols={3}
      selectable
    />
  );
}
