**Important Notes on Localization:**
- Only files with the pattern `metadata.{locale}.yml` are supported
- The Package Manager will display metadata in the user's locale if available
- If the user's locale is not available, it will fall back to English
- The English locale (`metadata.en.yml`) is required as a fallback
- Files without a locale code (e.g., just `metadata.yml`) are not supported