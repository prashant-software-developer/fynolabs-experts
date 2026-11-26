import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

// Medium weight, blue only for the main action. Height and corners follow the density tokens
// (globals.css): 36px / 4px on the site and portal, 40px / 8px in the admin.
const base =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0";
const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground shadow-card hover:bg-primary/90",
  secondary: "border border-input bg-background text-foreground shadow-card hover:border-foreground/20 hover:bg-secondary/50",
  ghost: "text-foreground/75 hover:bg-accent hover:text-accent-foreground",
  danger: "bg-destructive text-destructive-foreground shadow-card hover:bg-destructive/90",
};
const sizes: Record<Size, string> = { sm: "h-[var(--button-sm-h)] px-3 text-[13px]", md: "h-[var(--button-h)] px-4 text-sm" };

// A height or side padding passed in `className` (e.g. "h-11" to match an h-11 input) replaces the
// size's own, instead of both classes being on the button and the size's winning in the stylesheet.
export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  const own = (className ?? "").split(/\s+/);
  const sized = sizes[size]
    .split(" ")
    .filter((c) => !(c.startsWith("h-") && own.some((o) => o.startsWith("h-"))) && !(c.startsWith("px-") && own.some((o) => o.startsWith("px-"))))
    .join(" ");
  return cn(base, variants[variant], sized, className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; variant?: Variant; size?: Size; children: ReactNode }) {
  const external = href.startsWith("/api/");
  if (external) {
    return (
      <a href={href} className={buttonClass(variant, size, className)} {...props}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}
