import { supabase } from "@/integrations/supabase/client";

export interface Brand {
  id: string;
  slug: string;
  name: string;
  product_name: string;
  tagline: string | null;
  is_default: boolean;
  app_host: string | null;
  consumer_host: string | null;
  api_host: string | null;
  marketing_host: string | null;
  logo_primary_url: string | null;
  logo_mono_white_url: string | null;
  logo_mono_black_url: string | null;
  favicon_url: string | null;
  app_icon_url: string | null;
  og_image_url: string | null;
  theme: Record<string, string>;
  support_email: string | null;
  support_url: string | null;
  legal_company_name: string | null;
  privacy_url: string | null;
  terms_url: string | null;
  show_developers_page: boolean;
  show_knowledge_base: boolean;
  show_powered_by: boolean;
  enabled_pos_providers: string[];
  kb_overrides: Record<string, { title?: string; body?: string }>;
  auth_email_from: string | null;
  auth_email_reply_to: string | null;
}

const SHYNDIG_FALLBACK: Brand = {
  id: "fallback",
  slug: "shyndig",
  name: "Shyndig",
  product_name: "Shyndig",
  tagline: "The agentic dining platform",
  is_default: true,
  app_host: "shyndig.lovable.app",
  consumer_host: "shyndig.lovable.app",
  api_host: "api.shyndig.io",
  marketing_host: "shyndig.com.au",
  logo_primary_url: "/brand/shyndig-icon.png",
  logo_mono_white_url: null,
  logo_mono_black_url: null,
  favicon_url: "/shyndig-icon.svg",
  app_icon_url: "/shyndig-icon.svg",
  og_image_url: null,
  theme: {},
  support_email: "support@shyndig.com",
  support_url: null,
  legal_company_name: "Shyndig Pty Ltd",
  privacy_url: null,
  terms_url: null,
  show_developers_page: true,
  show_knowledge_base: true,
  show_powered_by: false,
  enabled_pos_providers: [],
  kb_overrides: {},
  auth_email_from: null,
  auth_email_reply_to: null,
};

export async function resolveBrandByHost(host: string): Promise<Brand> {
  // Try exact host match against app_host or consumer_host
  const { data } = await supabase
    .from("white_label_brands")
    .select("*")
    .or(`app_host.eq.${host},consumer_host.eq.${host}`)
    .limit(1)
    .maybeSingle();

  if (data) return data as unknown as Brand;

  // Fallback to default brand
  const { data: def } = await supabase
    .from("white_label_brands")
    .select("*")
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();

  return (def as unknown as Brand) ?? SHYNDIG_FALLBACK;
}

export function applyBrandTheme(theme: Record<string, string>) {
  if (!theme || typeof theme !== "object") return;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(theme)) {
    if (typeof v !== "string") continue;
    const cssVar = k.startsWith("--") ? k : `--${k}`;
    root.style.setProperty(cssVar, v);
  }
}

export function applyBrandHead(brand: Brand) {
  document.title = brand.product_name;
  if (brand.favicon_url) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = brand.favicon_url;
  }
  const setMeta = (name: string, content: string | null) => {
    if (!content) return;
    let m = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (!m) {
      m = document.createElement("meta");
      m.name = name;
      document.head.appendChild(m);
    }
    m.content = content;
  };
  setMeta("description", brand.tagline);
  setMeta("application-name", brand.product_name);
}

/**
 * Returns the consumer base URL (host) for a venue's QR code.
 * IMPORTANT: existing Shyndig stickers point to shyndig.lovable.app.
 * Only newly generated QRs for venues pinned to a non-default brand emit
 * that brand's consumer_host. Default brand always returns shyndig.lovable.app.
 */
export async function getQrBaseUrlForVenue(venue: { id: string; white_label_brand_id?: string | null }): Promise<string> {
  const fallback = "https://shyndig.lovable.app";
  if (!venue.white_label_brand_id) return fallback;
  const { data } = await supabase
    .from("white_label_brands")
    .select("consumer_host,is_default")
    .eq("id", venue.white_label_brand_id)
    .maybeSingle();
  if (!data || data.is_default || !data.consumer_host) return fallback;
  return `https://${data.consumer_host}`;
}
