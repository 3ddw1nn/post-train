"use client";

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
  // (low fov) to guarantee edge-to-edge coverage; the section keeps its own
  // solid brand-color background underneath as a safety net regardless.
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

  return (
    <div aria-hidden className={className} style={maskStyle}>
      <ShaderGradientCanvas style={{ width: "100%", height: "100%" }} pixelDensity={1} fov={fov}>
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
  );
}
