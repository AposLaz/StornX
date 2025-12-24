
# in prometheus.yml mounted proRules config file to prometheys

In deployment at Pod volumeMounts added 

```yaml
- name: alert-rules-volume
    mountPath: /etc/alert-rules
```

In deployment added at Container added

```yaml
- name: alert-rules-volume
    mountPath: /etc/alert-rules
```

In deployment at Pod volumes added 

```yaml
- name: alert-rules-volume
    configMap:
        name: prometheus-alert-rules # the name of config map (promAlertRules.yaml)
```

Finally in prometheus rules_files added the new mounted file

```yaml
rule_files:
- /etc/config/recording_rules.yml
- /etc/config/alerting_rules.yml
- /etc/config/rules
- /etc/config/alerts
- /etc/alert-rules/alerting_rules.yml # this is the mount file
```