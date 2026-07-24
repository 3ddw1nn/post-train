"use client";

import { useEffect, useState } from "react";
import { ShaderGradientCanvas, ShaderGradient } from "@shadergradient/react";

const VARIANTS = {
  // Tall, narrow container (auth rail) — diagonal plane tuned to that aspect ratio.
  rail: {
    fov: 45,
    cDistance: 3.6,
    positionX: -1.4,
    rotationY: 10,
    rotationZ: 50,
  },
  // Wide, short container (landing page banners). A flat plane runs out of
  // horizontal coverage at these extreme aspect ratios, so it's zoomed in
  // (low fov) to guarantee edge-to-edge coverage; pair with StaticGradientBg
  // underneath so there's no solid-color flash before the canvas can paint.
  banner: {
    fov: 16,
    cDistance: 1.6,
    positionX: 0,
    rotationY: 0,
    rotationZ: 0,
  },
} as const;

/**
 * Animated brand-teal shader gradient, layered as a decorative overlay over
 * whatever solid background color the container already has. Pass `fadeAt`
 * (px) where it needs to dissolve into an adjacent lighter area, eased into a
 * long, gradual fade rather than a hard cutoff.
 */
export function ShaderGradientBg({
  className,
  fadeAt,
  variant = "banner",
}: {
  className?: string;
  fadeAt?: number;
  variant?: keyof typeof VARIANTS;
}) {
  const { fov, ...v } = VARIANTS[variant];
  const maskStyle: React.CSSProperties = fadeAt
    ? {
        maskImage: [
          "linear-gradient(100deg",
          "black 0px",
          `black ${fadeAt * 0.19}px`,
          `rgba(0,0,0,0.82) ${fadeAt * 0.38}px`,
          `rgba(0,0,0,0.55) ${fadeAt * 0.58}px`,
          `rgba(0,0,0,0.28) ${fadeAt * 0.78}px`,
          `transparent ${fadeAt}px)`,
        ].join(", "),
      }
    : {};
  if (maskStyle.maskImage) maskStyle.WebkitMaskImage = maskStyle.maskImage;

  // The shader's plane is displaced by its own distortion field, so its
  // silhouette isn't a clean rectangle — at wide aspect ratios its warped
  // edge can enter the frame as a visible curved line with the static
  // background peeking through past it. Oversizing the canvas well beyond
  // the visible box (clipped by the section's own overflow-hidden) keeps
  // that edge permanently off-screen instead of chasing exact camera math.
  //
  // The canvas also starts life as a blank/transparent frame until WebGL
  // spins up, which reads as a flash against StaticGradientBg underneath.
  // Hold it invisible briefly, then ease it in once a frame has had time to
  // render, so the switch from static to animated is a fade, not a pop.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div aria-hidden className={className} style={maskStyle}>
      <div
        style={{
          position: "absolute",
          inset: "-20%",
          opacity: ready ? 1 : 0,
          transition: "opacity 900ms ease",
        }}
      >
        {/* lazyLoad (the library default) fully unmounts/remounts the WebGL
            canvas on every scroll in/out of view via IntersectionObserver —
            that remount is the black "recompiling" flash. Keep it mounted. */}
        <ShaderGradientCanvas
          style={{ width: "100%", height: "100%" }}
          pixelDensity={1}
          fov={fov}
          lazyLoad={false}
        >
          <ShaderGradient
            type="plane"
            animate="on"
            shader="defaults"
            color1="#0a5f59"
            color2="#0e8177"
            color3="#1fae9d"
            cAzimuthAngle={180}
            cPolarAngle={90}
            cameraZoom={1}
            positionY={0}
            positionZ={0}
            rotationX={0}
            uDensity={1.3}
            uFrequency={5.5}
            uSpeed={0.4}
            uStrength={4}
            uAmplitude={1}
            brightness={1.1}
            envPreset="city"
            lightType="3d"
            grain="on"
            reflection={0.1}
            {...v}
          />
        </ShaderGradientCanvas>
      </div>
    </div>
  );
}

// Inline SVG "TV static" grain — dense, fine, edge-to-edge duotone speckle
// (turbulence → grayscale → contrast-punched → mapped to navy/green), not a
// smooth gradient with sparse light flecks. A static data URI: no canvas, no
// JS chunk, nothing to animate in.
const GRAIN_URL =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1900' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.6' numOctaves='1' seed='5' stitchTiles='stitch' result='t'/%3E%3CfeColorMatrix in='t' type='matrix' values='0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 0 1' result='gray'/%3E%3CfeComponentTransfer in='gray' result='contrast'%3E%3CfeFuncR type='linear' slope='4.6' intercept='-2.0'/%3E%3CfeFuncG type='linear' slope='4.6' intercept='-2.0'/%3E%3CfeFuncB type='linear' slope='4.6' intercept='-2.0'/%3E%3C/feComponentTransfer%3E%3CfeComponentTransfer in='contrast' result='duotone'%3E%3CfeFuncR type='table' tableValues='0.01 0.16'/%3E%3CfeFuncG type='table' tableValues='0.015 0.52'/%3E%3CfeFuncB type='table' tableValues='0.03 0.26'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.8'/%3E%3C/svg%3E\")";

/**
 * Static CSS approximation of ShaderGradientBg's "banner" palette. Renders
 * instantly (no JS, no canvas), so stack it underneath ShaderGradientBg —
 * same `absolute inset-0`, painted first — as its background: the WebGL
 * canvas is transparent until its first frame, so without this the section's
 * flat fallback color shows through and then hard-cuts to the gradient once
 * the shader paints. With it, the cut is gradient-to-gradient and invisible.
 */
export function StaticGradientBg({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={className}
      style={{
        backgroundImage: `${GRAIN_URL}, radial-gradient(140% 160% at 58% 10%, #1fae9d 0%, #0e8177 32%, #0a5f59 64%, #063b36 100%)`,
        backgroundSize: "100% 100%, 100% 100%",
        backgroundRepeat: "no-repeat, no-repeat",
      }}
    />
  );
}
