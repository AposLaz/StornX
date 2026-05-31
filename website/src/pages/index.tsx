import type { ReactNode } from "react";
import clsx from "clsx";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import HomepageFeatures from "@site/src/components/HomepageFeatures";
import Heading from "@theme/Heading";

import styles from "./index.module.css";

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx("hero", styles.heroBanner)}>
      <div className="container">
        <img
          src="img/logo.png"
          alt={`${siteConfig.title} logo`}
          className={styles.heroLogo}
        />
        <Heading as="h1" className={styles.srOnly}>
          {siteConfig.title}
        </Heading>
        <p className={styles.heroSubtitle}>{siteConfig.tagline}</p>
        <p className={styles.heroPitch}>
          A single Kubernetes controller that unifies{" "}
          <strong>autoscaling</strong>,{" "}
          <strong>communication-aware placement</strong>, and{" "}
          <strong>adaptive traffic balancing</strong> - without changing your
          applications.
        </p>
        <div className={styles.buttons}>
          <Link
            className="button button--primary button--lg"
            to="/docs/introduction/what-is-stornx"
          >
            Read the Docs
          </Link>
          <Link
            className="button button--secondary button--lg"
            to="/docs/getting-started/installation"
          >
            Install with Helm
          </Link>
        </div>
        <p className={styles.heroBadges}>
          <a href="https://artifacthub.io/packages/helm/stornx/stornx">
            <img
              src="https://img.shields.io/endpoint?url=https://artifacthub.io/badge/repository/stornx"
              alt="Artifact Hub"
            />
          </a>
          &nbsp;
          <a href="https://github.com/AposLaz/StornX/blob/main/LICENSE">
            <img
              src="https://img.shields.io/badge/License-Apache_2.0-blue.svg"
              alt="License Apache 2.0"
            />
          </a>
          &nbsp;
          <a href="https://github.com/AposLaz/StornX">
            <img
              src="https://img.shields.io/badge/Kubernetes-%E2%89%A51.19-326ce5?logo=kubernetes&logoColor=white"
              alt="Kubernetes >= 1.19"
            />
          </a>
        </p>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="StornX is a Kubernetes controller that unifies autoscaling, communication-aware placement, and adaptive traffic balancing - reducing latency and cross-AZ cost without application changes."
    >
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
