# Shared packages

- [event-contracts](event-contracts/README.md) defines and validates workload-change notifications.
- [platform](platform/README.md) provides infrastructure clients and controller lifecycle helpers.

These packages let services share transport and observation code without sharing
scaling or traffic policy. They must not import either service. Build them before
building services; the root `yarn build` command handles this order.
