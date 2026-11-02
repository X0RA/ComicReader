"use client";

import { useEffect, useState } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { Moon, Palette, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const themes = [
  { name: "light", label: "Light", icon: Sun },
  { name: "dark", label: "Dark", icon: Moon },
  { name: "gruvbox", label: "Gruvbox", icon: Palette },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const currentIndex = themes.findIndex((item) => item.name === theme);
  const current = themes[Math.max(0, currentIndex)];
  const next = themes[(Math.max(0, currentIndex) + 1) % themes.length];
  const Icon = mounted ? current.icon : Sun;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-11 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
      disabled={!mounted}
      onClick={() => setTheme(next.name)}
      aria-label={mounted ? `Theme: ${current.label}. Switch to ${next.label}` : "Theme"}
      title={mounted ? `Theme: ${current.label}. Switch to ${next.label}` : "Theme"}
    >
      <Icon aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
    </Button>
  );
}

export function ThemeControls({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" themes={themes.map((item) => item.name)} defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
