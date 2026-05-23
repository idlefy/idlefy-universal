# 🤝 Contributing to Idlefy Universal Chart

Thank you for your interest in contributing to Idlefy Universal Chart! This document provides guidelines and instructions for contributing to this project.

## 📑 Table of Contents
- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Process](#development-process)
- [Pull Request Process](#pull-request-process)
- [Release Process](#release-process)
- [Style Guidelines](#style-guidelines)

## 📜 Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to project maintainers.

## 🚀 Getting Started

1. Fork the repository
2. Clone your fork:
```bash
git clone https://github.com/your-username/idlefy-universal.git
cd idlefy-universal
```
3. Add upstream remote:
```bash
git remote add upstream https://github.com/idlefy/idlefy-universal.git
```

## 💻 Development Process

### Setting Up Development Environment

1. Install required tools:
   - Helm (v3.0+)
   - Kubernetes cluster (1.19+)
   - (Optional) cert-manager for certificate features
   - (Optional) Prometheus Operator for monitoring features

2. Test your changes:
```bash
# Lint the chart
helm lint .

# Test template rendering
helm template test . -f values.yaml

# Run unit tests
go test ./...
```

### Making Changes

1. Create a new branch:
```bash
git checkout -b feature/your-feature-name
```

2. Make your changes following our style guidelines

3. Test your changes thoroughly

4. Update documentation as needed

### Versioning

We follow [SemVer](https://semver.org/) for versioning:

- MAJOR version for incompatible API changes
- MINOR version for new functionality in a backwards compatible manner
- PATCH version for backwards compatible bug fixes

Update Chart.yaml version accordingly:
```yaml
version: X.Y.Z
```

## 📤 Pull Request Process

1. Update the Chart.yaml version following SemVer
2. Update documentation reflecting any changes
3. Add test cases for new functionality
4. Ensure all tests pass
5. Update examples if necessary
6. Submit pull request using our PR template

### PR Title Convention

Format: `[type]: Description`

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only changes
- `style`: Changes not affecting code logic
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Performance improvements
- `test`: Adding missing tests
- `chore`: Changes to build process or auxiliary tools

Example: `[feat]: Add support for pod topology spread constraints`

## 📦 Release Process

1. Update documentation if needed
2. Create release tag following SemVer
3. Push release to Helm repository

## 🎨 Style Guidelines

### YAML Style
- Use 2 spaces for indentation
- Keep lines under 100 characters
- Use meaningful key names
- Group related configurations

### Documentation Style
- Use Markdown for all documentation
- Include examples for new features
- Keep documentation up to date with code changes
- Use emojis for better readability

### Example Values
```yaml
deployments:
  my-app:
    replicas: 2
    containers:
      main:
        image: my-app
        imageTag: v1.0.0
```

## ✅ Validation

Before submitting PR, ensure:

1. All tests pass
2. Documentation is updated
3. Examples are working
4. No breaking changes (unless intended)
5. Proper version bump in Chart.yaml

## 🆘 Getting Help

If you need help, you can:
- Open an issue
- Start a discussion

## 🙏 Thank You

Your contributions make this project better for everyone. Thank you for being part of our community!