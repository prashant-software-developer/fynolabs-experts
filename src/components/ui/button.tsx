import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

// Same recipe as the website's shadcn button: 4px radius, medium weight, blue only for the main action.
// FynoLabs admin buttons: square, 40px (36px small), Inter 400; one solid (the main action), the rest outlines.
const base =
  "inline-flex shrink-0 items-center justify-center gap-2 font-normal whitespace-nowrap transition-[background-color,color,border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0";
const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "border border-input bg-background text-foreground hover:border-foreground/40 hover:bg-foreground/[0.04]",
  ghost: "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
  danger: "border border-destructive/60 bg-background text-destructive hover:border-destructive hover:bg-destructive/[0.06]",
};
const sizes: Record<Size, string> = { sm: "h-9 px-3 text-small", md: "h-10 px-5 text-small" };

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
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
