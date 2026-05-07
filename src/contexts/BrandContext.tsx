import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Brand, resolveBrandByHost, applyBrandTheme, applyBrandHead } from "@/lib/white-label";
import { supabase } from "@/integrations/supabase/client";

interface BrandContextValue {
  brand: Brand | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const BrandContext = createContext<BrandContextValue>({
  brand: null,
  loading: true,
  refresh: async () => {},
});

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const host = typeof window !== "undefined" ? window.location.host : "";
    const b = await resolveBrandByHost(host);
    setBrand(b);
    applyBrandTheme(b.theme || {});
    applyBrandHead(b);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Re-theme on brand row updates (admin saves, etc.)
    const ch = supabase
      .channel("white_label_brands_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "white_label_brands" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <BrandContext.Provider value={{ brand, loading, refresh: load }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand(): Brand {
  const { brand } = useContext(BrandContext);
  // Components can rely on brand being non-null because App gates render on load.
  return brand as Brand;
}

export function useBrandContext() {
  return useContext(BrandContext);
}
