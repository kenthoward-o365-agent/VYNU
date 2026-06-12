import { Link } from "react-router-dom";
import { ChevronRight, LucideIcon } from "lucide-react";

export interface SectionLinkItem {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  to: string;
}

export default function SectionLinks({ items }: { items: SectionLinkItem[] }) {
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {items.map((item) => (
        <Link
          key={item.key}
          to={item.to}
          className="group flex items-start gap-3 p-4 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/40 transition-colors"
        >
          <div className="p-2 rounded-md bg-primary/10 text-primary shrink-0">
            <item.icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-foreground">{item.label}</div>
            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0 mt-1" />
        </Link>
      ))}
    </div>
  );
}
