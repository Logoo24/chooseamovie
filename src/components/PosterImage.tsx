"use client";

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
        "aspect-[2/3] overflow-hidden border border-white/10 bg-white/5",
        roundedClassName,
        className,
      ].join(" ")}
    >
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-contain" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-white/45">No art</div>
      )}
    </div>
  );
}

