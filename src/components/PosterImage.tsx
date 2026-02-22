"use client";

import Image from "next/image";

type PosterImageProps = {
  src?: string | null;
  alt: string;
  className?: string;
  roundedClassName?: string;
};

export function PosterImage({ src, alt, className = "", roundedClassName = "rounded-md" }: PosterImageProps) {
  return (
    <div
      className={[
        "relative aspect-[2/3] overflow-hidden border border-white/12 bg-black/30 shadow-[0_10px_22px_rgba(0,0,0,0.28)]",
        roundedClassName,
        className,
      ].join(" ")}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 768px) 45vw, 240px"
          className="object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-white/48">No art</div>
      )}
    </div>
  );
}

