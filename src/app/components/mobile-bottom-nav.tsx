import type { ReactNode } from "react";
import { cn } from "@/app/components/ui/utils";

type MobileNavItem = {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  badge?: number;
};

interface MobileBottomNavProps {
  items: MobileNavItem[];
  activeId: string;
}

export function MobileBottomNav({ items, activeId }: MobileBottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/70 bg-white/95 px-4 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-sm items-center justify-between gap-2">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className={cn(
                "relative flex min-w-[64px] flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium transition",
                isActive
                  ? "bg-slate-100 text-primary shadow-[0_10px_20px_-14px_rgba(15,23,42,0.6)]"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              <span className={cn("text-base", isActive ? "text-primary" : "text-slate-500")}>
                {item.icon}
              </span>
              <span className="leading-none">{item.label}</span>
              {item.badge && item.badge > 0 && (
                <span className="absolute right-2 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white">
                  {item.badge > 9 ? "9+" : item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
