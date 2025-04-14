## Documentation Updates

Update the documentation to reflect the correct localization behavior:

```markdown
### Localization Support

You can provide metadata in multiple languages by using locale-specific files:

- `metadata.en.yml` - English metadata (required as fallback)
- `metadata.es.yml` - Spanish metadata
- `metadata.fr.yml` - French metadata

**Important Notes on Localization:**

- Only files with the pattern `metadata.{locale}.yml` are supported
- The Package Manager will display metadata in the user's locale if available
- If the user's locale is not available, it will fall back to English
- The English locale (`metadata.en.yml`) is required as a fallback
- Files without a locale code (e.g., just `metadata.yml`) are not supported
```
