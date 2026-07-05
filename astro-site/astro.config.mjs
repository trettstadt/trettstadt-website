import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwind from "@astrojs/tailwind";
import astroMermaid from "astro-mermaid";

export default defineConfig({
  site: "https://trettstadt.de",
  integrations: [mdx(), sitemap(), tailwind(), astroMermaid()],
  prefetch: true
});
