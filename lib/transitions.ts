// The transition catalog shared by the editor UI and the render pipeline.
//
// Every id here except "cut" is a real ffmpeg `xfade=transition=` value, so the
// server passes ids straight through to the filtergraph (lib/ffmpeg.ts) and the
// only thing that has to stay in sync is this list. ffmpeg ships 58 of them;
// these are the ~24 that read clearly on a 9:16 phone video and that we can
// approximate in CSS for the editor's live preview.
//
// `preview` drives that CSS approximation (transitionPreviewStyles below) so the
// preview player has no per-transition branching. `approx: true` marks the ones
// whose preview is a stand-in rather than a faithful simulation — the editor
// surfaces that so nobody is surprised by the render.

export type TransitionGroup = "Basic" | "Slide" | "Wipe" | "Shape" | "Slice" | "Wind" | "Motion";

type PreviewSpec =
  | { kind: "cut" }
  | { kind: "crossfade" }
  | { kind: "throughColor"; color: string }
  | { kind: "grays" }
  | { kind: "slide"; axis: "x" | "y"; sign: 1 | -1 }
  | { kind: "wipe"; edge: "left" | "right" | "top" | "bottom" }
  | { kind: "cornerWipe"; at: string }
  | { kind: "circle"; open: boolean; color?: string }
  /** A horizontal (axis "y" insets top/bottom) or vertical (axis "x" insets left/right) band growing open or shrinking closed from center. */
  | { kind: "band"; axis: "x" | "y"; open: boolean }
  | { kind: "squeeze"; axis: "x" | "y" }
  | { kind: "zoom" }
  | { kind: "blur"; max: number };

/**
 * Kept as a plain string rather than a union of the ids below: the trust
 * boundary that matters is the API, where `isTransitionId` rejects anything not
 * in this catalog before it can reach an ffmpeg filtergraph.
 */
export type TransitionId = string;

export type Transition = {
  id: TransitionId;
  label: string;
  group: TransitionGroup;
  preview: PreviewSpec;
  /** Preview is a visual stand-in; the render will differ in detail. */
  approx?: boolean;
};

export const TRANSITIONS: Transition[] = [
  { id: "cut", label: "None (hard cut)", group: "Basic", preview: { kind: "cut" } },
  { id: "fade", label: "Crossfade", group: "Basic", preview: { kind: "crossfade" } },
  { id: "fadeblack", label: "Through black", group: "Basic", preview: { kind: "throughColor", color: "#000" } },
  { id: "fadewhite", label: "Through white", group: "Basic", preview: { kind: "throughColor", color: "#fff" } },
  { id: "fadegrays", label: "Through grayscale", group: "Basic", preview: { kind: "grays" } },
  { id: "dissolve", label: "Dissolve", group: "Basic", preview: { kind: "crossfade" }, approx: true },
  { id: "distance", label: "Distance", group: "Basic", preview: { kind: "crossfade" }, approx: true },
  { id: "fadefast", label: "Quick fade", group: "Basic", preview: { kind: "crossfade" }, approx: true },
  { id: "fadeslow", label: "Slow fade", group: "Basic", preview: { kind: "crossfade" }, approx: true },

  { id: "slideleft", label: "Slide left", group: "Slide", preview: { kind: "slide", axis: "x", sign: -1 } },
  { id: "slideright", label: "Slide right", group: "Slide", preview: { kind: "slide", axis: "x", sign: 1 } },
  { id: "slideup", label: "Slide up", group: "Slide", preview: { kind: "slide", axis: "y", sign: -1 } },
  { id: "slidedown", label: "Slide down", group: "Slide", preview: { kind: "slide", axis: "y", sign: 1 } },

  { id: "wipeleft", label: "Wipe left", group: "Wipe", preview: { kind: "wipe", edge: "right" } },
  { id: "wiperight", label: "Wipe right", group: "Wipe", preview: { kind: "wipe", edge: "left" } },
  { id: "wipeup", label: "Wipe up", group: "Wipe", preview: { kind: "wipe", edge: "bottom" } },
  { id: "wipedown", label: "Wipe down", group: "Wipe", preview: { kind: "wipe", edge: "top" } },
  { id: "wipetl", label: "Wipe from corner", group: "Wipe", preview: { kind: "cornerWipe", at: "100% 100%" }, approx: true },
  { id: "wipetr", label: "Wipe from corner (top-right)", group: "Wipe", preview: { kind: "cornerWipe", at: "0% 100%" }, approx: true },
  { id: "wipebl", label: "Wipe from corner (bottom-left)", group: "Wipe", preview: { kind: "cornerWipe", at: "100% 0%" }, approx: true },
  { id: "wipebr", label: "Wipe to corner", group: "Wipe", preview: { kind: "cornerWipe", at: "0% 0%" }, approx: true },
  { id: "smoothleft", label: "Soft wipe left", group: "Wipe", preview: { kind: "wipe", edge: "right" }, approx: true },
  { id: "smoothright", label: "Soft wipe right", group: "Wipe", preview: { kind: "wipe", edge: "left" }, approx: true },
  { id: "smoothup", label: "Soft wipe up", group: "Wipe", preview: { kind: "wipe", edge: "bottom" }, approx: true },
  { id: "smoothdown", label: "Soft wipe down", group: "Wipe", preview: { kind: "wipe", edge: "top" }, approx: true },

  { id: "circleopen", label: "Circle open", group: "Shape", preview: { kind: "circle", open: true } },
  { id: "circleclose", label: "Circle close", group: "Shape", preview: { kind: "circle", open: false } },
  { id: "circlecrop", label: "Circle through black", group: "Shape", preview: { kind: "circle", open: false, color: "#000" } },
  { id: "rectcrop", label: "Rectangle through black", group: "Shape", preview: { kind: "circle", open: false, color: "#000" }, approx: true },
  { id: "radial", label: "Radial sweep", group: "Shape", preview: { kind: "circle", open: true }, approx: true },
  { id: "horzopen", label: "Horizontal open", group: "Shape", preview: { kind: "band", axis: "y", open: true } },
  { id: "horzclose", label: "Horizontal close", group: "Shape", preview: { kind: "band", axis: "y", open: false } },
  { id: "vertopen", label: "Vertical open", group: "Shape", preview: { kind: "band", axis: "x", open: true } },
  { id: "vertclose", label: "Vertical close", group: "Shape", preview: { kind: "band", axis: "x", open: false } },
  { id: "diagtl", label: "Diagonal from top-left", group: "Shape", preview: { kind: "cornerWipe", at: "0% 0%" }, approx: true },
  { id: "diagtr", label: "Diagonal from top-right", group: "Shape", preview: { kind: "cornerWipe", at: "100% 0%" }, approx: true },
  { id: "diagbl", label: "Diagonal from bottom-left", group: "Shape", preview: { kind: "cornerWipe", at: "0% 100%" }, approx: true },
  { id: "diagbr", label: "Diagonal from bottom-right", group: "Shape", preview: { kind: "cornerWipe", at: "100% 100%" }, approx: true },

  { id: "hlslice", label: "Slice left", group: "Slice", preview: { kind: "wipe", edge: "right" }, approx: true },
  { id: "hrslice", label: "Slice right", group: "Slice", preview: { kind: "wipe", edge: "left" }, approx: true },
  { id: "vuslice", label: "Slice up", group: "Slice", preview: { kind: "wipe", edge: "bottom" }, approx: true },
  { id: "vdslice", label: "Slice down", group: "Slice", preview: { kind: "wipe", edge: "top" }, approx: true },

  { id: "hlwind", label: "Wind left", group: "Wind", preview: { kind: "slide", axis: "x", sign: -1 }, approx: true },
  { id: "hrwind", label: "Wind right", group: "Wind", preview: { kind: "slide", axis: "x", sign: 1 }, approx: true },
  { id: "vuwind", label: "Wind up", group: "Wind", preview: { kind: "slide", axis: "y", sign: -1 }, approx: true },
  { id: "vdwind", label: "Wind down", group: "Wind", preview: { kind: "slide", axis: "y", sign: 1 }, approx: true },

  { id: "zoomin", label: "Zoom in", group: "Motion", preview: { kind: "zoom" } },
  { id: "squeezeh", label: "Squeeze horizontal", group: "Motion", preview: { kind: "squeeze", axis: "y" } },
  { id: "squeezev", label: "Squeeze vertical", group: "Motion", preview: { kind: "squeeze", axis: "x" } },
  { id: "pixelize", label: "Pixelize", group: "Motion", preview: { kind: "blur", max: 14 }, approx: true },
  { id: "hblur", label: "Blur", group: "Motion", preview: { kind: "blur", max: 10 }, approx: true },
];

export const TRANSITION_GROUPS: TransitionGroup[] = ["Basic", "Slide", "Wipe", "Shape", "Slice", "Wind", "Motion"];

export const DEFAULT_TRANSITION_ID = "fade";
export const DEFAULT_TRANSITION_DURATION = 0.5;
export const TRANSITION_DURATION_MIN = 0.1;
export const TRANSITION_DURATION_MAX = 2;

const BY_ID = new Map(TRANSITIONS.map((transition) => [transition.id, transition]));

export function isTransitionId(value: unknown): boolean {
  return typeof value === "string" && BY_ID.has(value);
}

export function transitionById(id: string): Transition | undefined {
  return BY_ID.get(id);
}

export function transitionLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}

export function clampTransitionDuration(value: unknown): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return DEFAULT_TRANSITION_DURATION;
  return Math.min(TRANSITION_DURATION_MAX, Math.max(TRANSITION_DURATION_MIN, seconds));
}

/** A style patch for one of the two stacked preview <video> layers. */
export type TransitionStyle = { opacity?: number; transform?: string; clipPath?: string; filter?: string };
export type TransitionPreview = {
  outgoing: TransitionStyle;
  incoming: TransitionStyle;
  /** Solid colour to show behind both layers (fade-through-black and friends). */
  backdrop?: string;
  /** Put the outgoing clip on top — needed when it is the one being clipped away. */
  swapLayers?: boolean;
};

/**
 * CSS stand-in for one xfade transition at `progress` (0 → 1) through the
 * overlap. The editor preview is two stacked <video> elements, so each
 * transition is expressed as a style patch per layer rather than a keyframe
 * animation — the playhead can land anywhere, including mid-scrub.
 */
export function transitionPreviewStyles(id: string, progress: number): TransitionPreview {
  const p = Math.min(1, Math.max(0, progress));
  const spec = BY_ID.get(id)?.preview ?? { kind: "crossfade" as const };
  const shown = p > 0 ? 1 : 0;

  switch (spec.kind) {
    case "cut":
      return { outgoing: { opacity: p >= 1 ? 0 : 1 }, incoming: { opacity: p >= 1 ? 1 : 0 } };
    case "throughColor": {
      // Two phases against a solid backdrop: out to the colour, then in from it.
      return {
        backdrop: spec.color,
        outgoing: { opacity: p <= 0.5 ? 1 - p * 2 : 0 },
        incoming: { opacity: p <= 0.5 ? 0 : (p - 0.5) * 2 },
      };
    }
    case "grays":
      return {
        outgoing: { opacity: 1 - p, filter: `grayscale(${Math.min(1, p * 2)})` },
        incoming: { opacity: p, filter: `grayscale(${Math.max(0, 1 - p * 2)})` },
      };
    case "slide": {
      const axis = spec.axis === "x" ? "translateX" : "translateY";
      return {
        outgoing: { transform: `${axis}(${spec.sign * p * 100}%)` },
        incoming: { opacity: shown, transform: `${axis}(${-spec.sign * (1 - p) * 100}%)` },
      };
    }
    case "wipe": {
      // Inset the three edges we are not revealing from, so the incoming clip
      // grows out of `edge`.
      const remaining = (1 - p) * 100;
      const inset =
        spec.edge === "left" ? `0 ${remaining}% 0 0`
        : spec.edge === "right" ? `0 0 0 ${remaining}%`
        : spec.edge === "top" ? `0 0 ${remaining}% 0`
        : `${remaining}% 0 0 0`;
      return { outgoing: {}, incoming: { opacity: shown, clipPath: `inset(${inset})` } };
    }
    case "cornerWipe":
      return { outgoing: {}, incoming: { opacity: shown, clipPath: `circle(${p * 150}% at ${spec.at})` } };
    case "band": {
      // Inset toward 0 to grow a centered band open; inset toward 50% to shrink one closed.
      const inset = spec.open ? (1 - p) * 50 : p * 50;
      const clip = spec.axis === "y" ? `${inset}% 0 ${inset}% 0` : `0 ${inset}% 0 ${inset}%`;
      if (spec.open) return { outgoing: {}, incoming: { opacity: shown, clipPath: `inset(${clip})` } };
      return { swapLayers: true, outgoing: { clipPath: `inset(${clip})` }, incoming: { opacity: shown } };
    }
    case "circle": {
      if (spec.open) {
        return { outgoing: {}, incoming: { opacity: shown, clipPath: `circle(${p * 75}% at 50% 50%)` } };
      }
      // Closing: the outgoing clip is the one shrinking, so it has to sit on top.
      return {
        backdrop: spec.color,
        swapLayers: true,
        outgoing: { clipPath: `circle(${(1 - p) * 75}% at 50% 50%)` },
        incoming: { opacity: spec.color ? (p <= 0.5 ? 0 : (p - 0.5) * 2) : shown },
      };
    }
    case "squeeze": {
      const axis = spec.axis === "x" ? "scaleX" : "scaleY";
      return { outgoing: { opacity: 1 - p }, incoming: { opacity: shown, transform: `${axis}(${Math.max(0.02, p)})` } };
    }
    case "zoom":
      return {
        outgoing: { opacity: 1 - p },
        incoming: { opacity: p, transform: `scale(${0.4 + p * 0.6})` },
      };
    case "blur": {
      // Blur peaks halfway through, so both layers are softest at the seam.
      const peak = (1 - Math.abs(p - 0.5) * 2) * spec.max;
      return {
        outgoing: { opacity: 1 - p, filter: `blur(${peak}px)` },
        incoming: { opacity: p, filter: `blur(${peak}px)` },
      };
    }
    default:
      return { outgoing: {}, incoming: { opacity: p } };
  }
}
