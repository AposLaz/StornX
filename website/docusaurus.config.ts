import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "StornX",
  tagline:
    "Latency-Optimized Pod Scheduling & Traffic Balancing for Kubernetes",
  favicon: "img/logo/stornxLogo.png",

  future: {
    v4: true,
    faster: true,
  },

  url: "https://aposlaz.github.io",
  baseUrl: "/StornX/",

  organizationName: "AposLaz",
  projectName: "StornX",

  onBrokenLinks: "warn",

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: "warn",
    },
  },
  themes: ["@docusaurus/theme-mermaid"],

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          routeBasePath: "docs",
          editUrl: "https://github.com/AposLaz/StornX/tree/main/website/",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/logo.png",
    colorMode: {
      defaultMode: "light",
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "StornX",
      logo: {
        alt: "StornX Logo",
        src: "img/logo/red_shape_logo.png",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docs",
          position: "left",
          label: "Documentation",
        },
        {
          to: "/docs/getting-started/installation",
          label: "Get Started",
          position: "left",
        },
        {
          href: "https://artifacthub.io/packages/helm/stornx/stornx",
          label: "Helm Chart",
          position: "right",
        },
        {
          href: "https://github.com/AposLaz/StornX",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Documentation",
          items: [
            {
              label: "What is StornX",
              to: "/docs/introduction/what-is-stornx",
            },
            { label: "Architecture", to: "/docs/architecture/overview" },
            {
              label: "Getting Started",
              to: "/docs/getting-started/installation",
            },
          ],
        },
        {
          title: "Components",
          items: [
            { label: "OptiScaler", to: "/docs/architecture/optiscaler" },
            { label: "OptiBalancer", to: "/docs/architecture/optibalancer" },
            {
              label: "Configuration",
              to: "/docs/getting-started/configuration",
            },
          ],
        },
        {
          title: "Community",
          items: [
            { label: "GitHub", href: "https://github.com/AposLaz/StornX" },
            {
              label: "Issues",
              href: "https://github.com/AposLaz/StornX/issues",
            },
            {
              label: "Artifact Hub",
              href: "https://artifacthub.io/packages/helm/stornx/stornx",
            },
            {
              label: "Kube-NetLag",
              href: "https://github.com/AposLaz/kube-netlag",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Apostolos Lazidis · Apache 2.0 License · Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "yaml", "json", "typescript", "docker"],
    },
    mermaid: {
      theme: { light: "neutral", dark: "dark" },
    },
    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: false,
      },
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
