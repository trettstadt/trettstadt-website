import type { Site, Metadata, Socials } from "@types";

export const SITE: Site = {
  NAME: "Tobias Rettstadt",
  EMAIL: "tobias(AT)rettstadt.de",
  NUM_POSTS_ON_HOMEPAGE: 3,
  NUM_WORKS_ON_HOMEPAGE: 2,
  NUM_PROJECTS_ON_HOMEPAGE: 3,
};

export const HOME: Metadata = {
  TITLE: "Tobias Rettstadt — IT-Consulting & Software-Architektur | Banking & Modernisierung",
  DESCRIPTION: "Hands-on IT-Architektur & Lead-Entwicklung für Banken und FinTechs. Risikofreie Modernisierung geschäftskritischer Mainframe-Systeme mit Spring Boot & Kubernetes.",
};

export const BLOG: Metadata = {
  TITLE: "Fachartikel & Architecture Insights",
  DESCRIPTION: "Praxisberichte zu Mainframe-Modernisierung, Spring Boot, Helm-Governance und DORA-Compliance im regulierten Finanzsektor.",
};

export const WORK: Metadata = {
  TITLE: "Erfahrung & Referenzen",
  DESCRIPTION: "Stationen und geschäftskritische Modernisierungsprojekte im Banken- und Enterprise-Umfeld.",
};

export const PROJECTS: Metadata = {
  TITLE: "Blueprints & Open Source",
  DESCRIPTION: "Praxiserprobte Architektur-Blueprints, Spring-Boot-Templates und standardisierte Helm-Charts.",
};

export const SOCIALS: Socials = [
  {
    NAME: "xing",
    HREF: "https://www.xing.com/profile/Tobias_Rettstadt"
  },
  {
    NAME: "linkedin",
    HREF: "https://linkedin.com/in/trettstadt"
  },
  {
    NAME: "github",
    HREF: "https://github.com/trettstadt"
  },
];

export const BOOKING: {
  EMBED_URL: string;
  CAL_LINK: string;
} = {
  EMBED_URL: "https://book.trettstadt.de/embed/embed.js",
  CAL_LINK: "trettstadt/beratung",
};
