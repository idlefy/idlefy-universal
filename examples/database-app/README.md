# Database Application Example

This example demonstrates how to deploy an application with:
- PostgreSQL database
- Database migrations
- Secrets management
- Backup cronjob

## Configuration
```yaml
# Database secrets
configs:
  db-secrets:
    type: secret
    data:
      DB_PASSWORD: your-db-password-here
      DB_USER: your-db-user-here

# Main application with migrations
deployments:
  app:
    replicas: 2
    autoCreateService: true
    autoCreateIngress: true
    
    # Database migrations configuration
    migrations:
      enabled: true
      args: ["migrate", "up"]
      backoffLimit: 3
    
    containers:
      main:
        image: my-app  # Replace with your image
        imageTag: v1.0.0
        ports:
          http:
            containerPort: 8080
        env:
          - name: DB_HOST
            value: postgresql
          - name: DB_NAME
            value: myapp
          - name: DB_USER
            valueFrom:
              secretKeyRef:
                name: db-secrets
                key: DB_USER
          - name: DB_PASSWORD
            valueFrom:
              secretKeyRef:
                name: db-secrets
                key: DB_PASSWORD
        resources:
          requests:
            cpu: 100m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 512Mi

  # PostgreSQL database
  postgresql:
    replicas: 1
    autoCreateService: true
    autoCreatePdb: true
    pdbConfig:
      minAvailable: 1
    
    containers:
      main:
        image: postgres
        imageTag: "14-alpine"
        ports:
          postgresql:
            containerPort: 5432
        env:
          - name: POSTGRES_DB
            value: myapp
          - name: POSTGRES_USER
            valueFrom:
              secretKeyRef:
                name: db-secrets
                key: DB_USER
          - name: POSTGRES_PASSWORD
            valueFrom:
              secretKeyRef:
                name: db-secrets
                key: DB_PASSWORD
        resources:
          requests:
            cpu: 100m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 1Gi
        volumeMounts:
          - name: data
            mountPath: /var/lib/postgresql/data
    
    volumes:
      - name: data
        persistentVolumeClaim:
          claimName: postgresql-data

# Database backup job
cronJobs:
  db-backup:
    schedule: "0 1 * * *"  # Every day at 1 AM
    successfulJobsHistoryLimit: 3
    failedJobsHistoryLimit: 1
    containers:
      main:
        image: postgres
        imageTag: "14-alpine"
        command: 
          - "/bin/sh"
          - "-c"
          - |
            pg_dump -h postgresql -U $DB_USER -d myapp > /backup/backup-$(date +%Y%m%d).sql
        env:
          - name: PGPASSWORD
            valueFrom:
              secretKeyRef:
                name: db-secrets
                key: DB_PASSWORD
          - name: DB_USER
            valueFrom:
              secretKeyRef:
                name: db-secrets
                key: DB_USER
        volumeMounts:
          - name: backup
            mountPath: /backup
    volumes:
      - name: backup
        persistentVolumeClaim:
          claimName: db-backups

# Storage configuration
persistentVolumeClaims:
  postgresql-data:
    accessModes:
      - ReadWriteOnce
    size: 10Gi
  
  db-backups:
    accessModes:
      - ReadWriteOnce
    size: 5Gi
```

## Usage

1. Update the secret values
2. Replace image references
3. Adjust resource limits and storage sizes
4. Apply the configuration:

```bash
helm upgrade --install my-db-app idlefy-universal/idlefy-universal -f values.yaml
```

## Notes

- The migrations job runs before the main application starts
- Daily backups are stored in a separate persistent volume
- Database has a PodDisruptionBudget for availability
- Secrets are managed through Kubernetes secrets