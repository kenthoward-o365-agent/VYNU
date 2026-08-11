import { MarketingNav } from "./MarketingNav";
import { MarketingFooter } from "./MarketingFooter";
import { DemoPill } from "./DemoPill";

interface MarketingLayoutProps {
  children: React.ReactNode;
  darkNav?: boolean;
}

export function MarketingLayout({ children, darkNav }: MarketingLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
      <DemoPill />
    </div>
  );
}
