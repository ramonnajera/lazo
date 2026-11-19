import type { ReactNode } from "react";

/** Campo sin ancho: para filas que deciden el suyo (junto a `w-full`, un ancho fijo no tendría efecto). */
export const fieldCls = "rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800";
export const inputCls = `w-full ${fieldCls}`;
export const btnCls =
  "shrink-0 rounded-md bg-[#0B3D91] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#1450c0] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8FB4FF]";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <input type="checkbox" className="h-4 w-4 shrink-0 accent-[#0B3D91]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
