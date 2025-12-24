need to install metrics server if not exists:

`kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml`

helm install --set cr.create=true --set cr.namespace=istio-system --set cr.spec.auth.strategy="anonymous" --namespace istio-system --create-namespace kiali-operator kiali/kiali-operator