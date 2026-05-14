# Go Template Support for Environment Variables

This example demonstrates how to use Go Template syntax in environment variables, similar to how it works for `image` and `imageTag`.

## Features

Go template support for env variables allows you to:

- Use dynamic values based on Helm metadata
- Generate timestamps and dates
- Access values from `values.yaml`
- Use built-in Helm functions

## Usage Examples

### Basic Cases

```yaml
env:
  # Static value (works as usual)
  - name: STATIC_VAR
    value: "hello world"
  
  # Dynamic values with gotemplate
  - name: CURRENT_TIMESTAMP
    value: '{{ now | unixEpoch }}'
  
  - name: RELEASE_NAME
    value: '{{ .Release.Name }}'
  
  - name: CHART_VERSION
    value: '{{ .Chart.Version }}'
```

### Working with Dates

```yaml
env:
  - name: BUILD_DATE
    value: '{{ now | date "2006-01-02T15:04:05Z" }}'
  
  - name: BUILD_TIMESTAMP
    value: '{{ now | unixEpoch }}'
```

### Using Values from values.yaml

```yaml
# values.yaml
config:
  appName: "my-application"
  version: "1.0.0"

# In deployment
env:
  - name: APP_NAME
    value: '{{ .Values.config.appName }}'
  
  - name: APP_VERSION
    value: '{{ .Values.config.version | default "unknown" }}'
```

### Complex Expressions

```yaml
env:
  - name: FULL_SERVICE_NAME
    value: '{{ .Release.Name }}-{{ .Chart.Name }}'
  
  - name: NAMESPACE_AWARE_CONFIG
    value: '{{ printf "%s.%s.svc.cluster.local" .Release.Name .Release.Namespace }}'
```

## Deployment

```bash
helm install my-app idlefy-universal/idlefy-universal -f values.yaml
```

## Checking Results

After deployment, you can verify that environment variables were processed correctly:

```bash
kubectl get deployment my-app -o yaml | grep -A 10 env:
```

## Important Notes

1. **Quotes**: Always use single quotes `'{{ ... }}'` for gotemplate expressions
2. **Escaping**: If you need literal curly braces in values, use `{{"{{"}}` and `{{"}}"}}`
3. **Compatibility**: Static values without gotemplate continue to work as before
4. **Functions**: All standard Helm/Sprig functions are available 