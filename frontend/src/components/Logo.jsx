import { House, Coins } from "lucide-react";

export default function Logo({ size = "md" }) {
  const sizes = { sm: { icon: 18, text: "text-lg" }, md: { icon: 24, text: "text-2xl" }, lg: { icon: 32, text: "text-3xl" } };
  const s = sizes[size] || sizes.md;
  return (
    <div className="flex items-center gap-2" data-testid="app-logo">
      <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-linear-to-br from-amber-400 to-amber-600 shadow-md">
        <House className="text-white absolute" size={s.icon} strokeWidth={2.5} />
        <Coins className="text-amber-100 absolute -bottom-0.5 -right-0.5" size={s.icon * 0.6} />
      </div>
      <span className={`${s.text} font-extrabold tracking-tight`} style={{ fontFamily: "Manrope, sans-serif" }}>
        <span className="text-teal-800">Ahorro</span>
        <span className="text-amber-600">Familiar</span>
      </span>
    </div>
  );
}
