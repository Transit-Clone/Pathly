# Spec Delta

## Purpose

Defines a clean transition from obsolete standalone backend scaffolding to a backend-independent mobile prototype whose documented future service architecture uses Firebase.

## ADDED Requirements

### Requirement: Obsolete standalone backend is removed
The repository SHALL NOT contain or install a standalone Node.js/Express server, MongoDB/Mongoose integration, server health endpoint, or configuration and tests that exist only for those services.

#### Scenario: Contributor installs the project
- **WHEN** a contributor installs dependencies from the repository root
- **THEN** no Express, CORS, MongoDB, Mongoose, or standalone server workspace package is installed

#### Scenario: Contributor inspects backend source
- **WHEN** a contributor reviews the runnable project structure
- **THEN** no obsolete standalone API source, health endpoint, server test, or server build configuration remains

### Requirement: Mobile prototype runs independently
The React Native/Expo prototype SHALL start, test, type-check, lint, and build without launching or contacting a standalone development API. Removing the obsolete backend MUST NOT change the prototype's existing visible functionality.

#### Scenario: Contributor starts Expo locally
- **WHEN** a contributor runs a documented development command
- **THEN** Expo starts without requiring a local API process, API URL environment variable, or health check

#### Scenario: Rider uses the prototype before Firebase integration
- **WHEN** Firebase has not been configured or is unavailable
- **THEN** the existing local screens, navigation, and mock transit content remain usable without a technical failure state

### Requirement: Documentation reflects the Firebase target architecture
Project documentation SHALL identify Firebase, Cloud Firestore, Cloud Functions for Firebase, Firebase Authentication, and Firebase Cloud Storage as the planned backend services while clearly stating that Firebase functionality is not implemented by this cleanup.

#### Scenario: Contributor reads setup documentation
- **WHEN** a contributor follows the repository setup and run instructions
- **THEN** the instructions describe the Expo-only local workflow, omit obsolete server and API environment steps, and distinguish planned Firebase services from currently implemented functionality

### Requirement: Root project configuration targets the mobile workspace
Root workspace metadata and development scripts SHALL coordinate only the currently runnable Expo mobile workspace until a future Firebase implementation introduces additional deployable packages or tooling.

#### Scenario: Contributor uses root commands
- **WHEN** a contributor runs the root start, platform, lint, test, type-check, or build command
- **THEN** the command delegates to the mobile workspace and does not reference the removed server workspace
