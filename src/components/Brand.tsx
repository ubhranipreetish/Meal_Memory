import Image from "next/image";

export function Brand({ size = 32 }: { size?: number }) {
  return (
    <span className="meal-memory-brand">
      <Image src="/icon.svg" width={size} height={size} alt="" unoptimized />
      <strong>Meal<span>Memory</span></strong>
    </span>
  );
}
