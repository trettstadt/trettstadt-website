import type { Site, Metadata, Socials, Analytics } from "@types";

export const SITE: Site = {
  NAME: "Tobias Rettstadt",
  EMAIL: "tobias(AT)rettstadt.de",
  NUM_POSTS_ON_HOMEPAGE: 3,
  NUM_WORKS_ON_HOMEPAGE: 2,
  NUM_PROJECTS_ON_HOMEPAGE: 3,
};

export const HOME: Metadata = {
  TITLE: "Tobias Rettstadt — IT-Consulting & Cloud Engineering",
  DESCRIPTION: "IT-Consulting & Cloud Engineering aus Nürnberg. DSGVO-konforme Infrastruktur, Docker, Kubernetes und moderne Webentwicklung.",
};

export const BLOG: Metadata = {
  TITLE: "Blog",
  DESCRIPTION: "Fachartikel zu Cloud Engineering, DevOps und IT-Infrastruktur.",
};

export const WORK: Metadata = {
  TITLE: "Work",
  DESCRIPTION: "Stationen meiner beruflichen Laufbahn.",
};

export const PROJECTS: Metadata = {
  TITLE: "Projects",
  DESCRIPTION: "Eine Übersicht meiner Projekte mit Links zu Repositories und Demos.",
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

export const ANALYTICS: Analytics = {
  WEBSITE_ID: "e2992813-804b-4c0a-bd2a-3402d276bb5e",
  SRC: "https://analytics.trettstadt.de/script.js",
};
