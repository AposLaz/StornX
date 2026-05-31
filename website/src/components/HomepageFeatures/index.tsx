import type { ReactNode } from "react";
import clsx from "clsx";
import Heading from "@theme/Heading";
import styles from "./styles.module.css";

type FeatureItem = {
  title: string;
  description: ReactNode;
};

const Features: FeatureItem[] = [
  {
    title: "Communication-aware placement",
    description: (
      <>
        OptiScaler picks the node and zone for every new replica based on the
        live service graph - chatty services end up together, fault tolerance is
        preserved by design.
      </>
    ),
  },
  {
    title: "Adaptive traffic balancing",
    description: (
      <>
        OptiBalancer continuously tunes Istio DestinationRule weights using
        latency, CPU and replica counts. Gradual steps and dead-zone gating
        prevent oscillation.
      </>
    ),
  },
  {
    title: "Zero application changes",
    description: (
      <>
        One Helm release, one Pod, no sidecars, no CRDs, no annotations on your
        workloads. Defers to existing HPAs and respects PDBs.
      </>
    ),
  },
  {
    title: "Lower cross-AZ cost",
    description: (
      <>
        By keeping communicating Pods in the same zone whenever fault tolerance
        allows, StornX directly attacks one of the largest hidden line items on
        a multi-AZ Kubernetes bill.
      </>
    ),
  },
  {
    title: "Graceful zone-degradation handling",
    description: (
      <>
        Traffic is shifted away from a degrading AZ within one cycle.
        Replacement replicas land in healthy zones. Error spikes become latency
        wobbles.
      </>
    ),
  },
  {
    title: "Explainable decisions",
    description: (
      <>
        Every scaling action and DestinationRule patch is one structured log
        line with the inputs and the reason. No black-box ML, no surprises.
      </>
    ),
  },
];

function Feature({ title, description }: FeatureItem) {
  return (
    <div className={clsx("col col--4", styles.featureCard)}>
      <div className={styles.featureInner}>
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className={styles.sectionHeader}>
          <Heading as="h2">What StornX gives you</Heading>
          <p>
            Six concrete properties of the controller - each rooted in a real
            problem you have probably hit in a multi-AZ Kubernetes cluster.
          </p>
        </div>
        <div className="row">
          {Features.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
