{{- define "service.name" -}}{{ .Release.Name | trunc 63 | trimSuffix "-" }}{{- end }}
{{- define "service.labels" -}}
app.kubernetes.io/name: stornx-optiscaler
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: optiscaler
{{- end }}
