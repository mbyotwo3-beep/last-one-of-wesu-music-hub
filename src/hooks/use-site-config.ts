import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSiteConfig } from "@/lib/pricing.functions";
import type { SiteConfig } from "@/lib/pricing.functions";

export function useSiteConfig() {
  const getSiteConfigFn = useServerFn(getSiteConfig);

  const { data, isLoading } = useQuery({
    queryKey: ["site-config"],
    queryFn: () => getSiteConfigFn(),
    staleTime: 30 * 60 * 1000, // Cache for 30 minutes
  });

  return {
    siteConfig: data,
    isLoading,
  };
}