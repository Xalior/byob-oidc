# Changelog



## Release v0.2.1

### Minor changes
- Full type coverage enforced during linting

## Release v0.2.0

### Major Changes
- **TypeScript Migration**: The project has been fully migrated to TypeScript with complete type coverage at the point of linting
  - TypeScript is executed directly, not transpiled
  - All source files have been converted to .ts format

- **Configuration System**: Moved from file-based configuration to environment variables
  - Removed `/data/config.js` in favor of environment variables
  - See `_env_sample` file for all available configuration options
  - Environment variables provide better security and deployment flexibility

- **Data Directory Purpose**: The `/data` directory is now used for:
  - Page formatter (page.ts) - Customize the HTML structure of pages
  - JSON Web Key Set (jkws.json) - Generated with our new tool

### Documentation Updates
- Moved Docker documentation to the docs folder
- Updated README with current project structure and setup instructions
- Added this changelog to track project evolution

## Release v0.1.3
- **Testing Framework**: Implemented comprehensive testing with WebDriver.IO
  - End-to-end testing for authentication flows
  - Test suites for login, registration, and error scenarios
  - Mocha test framework integration
