{{- define "service.name" -}}{{ .Release.Name | trunc 63 | trimSuffix "-" }}{{- end }}
{{- define "service.labels" -}}
app.kubernetes.io/name: stornx-optibalancer
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: optibalancer
{{- end }}
