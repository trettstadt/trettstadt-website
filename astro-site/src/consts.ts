import type { Site, Metadata, Socials } from "@types";

export const SITE: Site = {
  NAME: "Thomas Trettstadt",
  EMAIL: "mail@trettstadt.de",
  NUM_POSTS_ON_HOMEPAGE: 3,
  NUM_WORKS_ON_HOMEPAGE: 2,
  NUM_PROJECTS_ON_HOMEPAGE: 3,
};

export const HOME: Metadata = {
  TITLE: "Thomas Trettstadt — IT-Consulting & Cloud Engineering",
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
    NAME: "github",
    HREF: "https://github.com/trettstadt"
  },
  {
    NAME: "linkedin",
    HREF: "https://linkedin.com/in/trettstadt"
  },
];
