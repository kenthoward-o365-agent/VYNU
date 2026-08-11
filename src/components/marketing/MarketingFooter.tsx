import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const footerLinks = [
  {
    title: "Product",
    links: [
      { label: "Platform", href: "/features" },
      { label: "AI", href: "/features#ai" },
      { label: "H&L Pay", href: "/features#hlpay" },
      { label: "Compare", href: "/compare" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/" },
      { label: "Contact", href: "mailto:sales@hl-ordernow.com" },
      { label: "Status", href: "/" },
      { label: "Knowledge Base", href: "/knowledge-base" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Security & Compliance", href: "/" },
      { label: "Privacy", href: "/" },
      { label: "Terms", href: "/" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="bg-[hsl(203,42%,9%)] text-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12">
          <div className="lg:col-span-2 space-y-4">
            <img
              src="/brand/hl-ordernow-logo.png"
              alt="H&L OrderNOW"
              className="h-8 w-auto brightness-0 invert"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <p className="text-white/70 max-w-sm text-sm leading-relaxed">
              The agentic ordering, payments, and diner-CRM platform built for Australian hospitality groups.
            </p>
            <Button
              variant="secondary"
              className="bg-white text-[hsl(203,42%,21%)] hover:bg-white/90"
              asChild
            >
              <a href="mailto:sales@hl-ordernow.com?subject=Book%20a%20demo">Book a demo</a>
            </Button>
          </div>
          {footerLinks.map((group) => (
            <div key={group.title} className="space-y-4">
              <h4 className="font-semibold text-sm tracking-wide">{group.title}</h4>
              <ul className="space-y-2">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.href}
                      className="text-sm text-white/70 hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-16 pt-8 border-t border-white/10 flex flex-col sm:flex-row justify-between gap-4 text-sm text-white/60">
          <p>© {new Date().getFullYear()} H&L OrderNOW. All rights reserved.</p>
          <p>Built for the H&L POS ecosystem. Australia-first.</p>
        </div>
      </div>
    </footer>
  );
}
