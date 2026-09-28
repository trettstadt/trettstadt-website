import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwind from "@astrojs/tailwind";
import astroMermaid from "astro-mermaid";
import umami from "@yeskunall/astro-umami";

export default defineConfig({
  site: "https://trettstadt.de",
  integrations: [
    mdx(),
    sitemap(),
    tailwind(),
    astroMermaid({
      mermaidConfig: {
        // Top-Level fontSize steuert die Schriften in Sequenzdiagrammen
        // (actor/message/note). NICHT themeVariables.fontSize verwenden –
        // der Sequenz-Renderer ignoriert diesen Wert (setConf überschreibt ihn).
        fontSize: "30px",
        themeVariables: {
          fontSize: "30px", // relevant für andere Diagrammtypen (z. B. Flowchart auf der Startseite)
        },
      },
    }),
    umami({
      id: "e2992813-804b-4c0a-bd2a-3402d276bb5e",
      endpointUrl: "https://analytics.trettstadt.de",
    }),
  ],
  prefetch: true
});
