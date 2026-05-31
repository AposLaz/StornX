import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docs: [
    {
      type: "category",
      label: "Introduction",
      collapsed: false,
      items: [
        "introduction/what-is-stornx",
        "introduction/why-stornx",
        "introduction/core-concepts",
      ],
    },
    {
      type: "category",
      label: "Architecture",
      collapsed: false,
      items: [
        "architecture/overview",
        "architecture/optiscaler",
        "architecture/optibalancer",
        "architecture/integrations",
      ],
    },
    {
      type: "category",
      label: "Getting Started",
      collapsed: false,
      items: [
        "getting-started/prerequisites",
        "getting-started/installation",
        "getting-started/configuration",
      ],
    },
    {
      type: "category",
      label: "Guides",
      items: ["guides/use-cases", "guides/tuning", "guides/troubleshooting"],
    },
    {
      type: "category",
      label: "Validation & Benchmarks",
      items: [
        "benchmarks/overview",
        "benchmarks/load-tests",
        "benchmarks/stress-tests",
        "benchmarks/availability",
        "benchmarks/comparison",
      ],
    },
    "roadmap",
    "faq",
  ],
};

export default sidebars;
