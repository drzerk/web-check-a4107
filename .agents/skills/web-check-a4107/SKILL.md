```markdown
# web-check-a4107 Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the `web-check-a4107` JavaScript repository. It covers file naming, import/export styles, commit message habits, and testing patterns, providing clear examples and step-by-step workflows for efficient contribution and maintenance.

## Coding Conventions

### File Naming
- Use **camelCase** for all file names.
  - Example: `webCheckUtils.js`, `statusHandler.js`

### Import Style
- Use **relative imports** for modules within the project.
  - Example:
    ```javascript
    import { checkStatus } from './statusHandler.js';
    ```

### Export Style
- Use **named exports** for functions, objects, or constants.
  - Example:
    ```javascript
    // In webCheckUtils.js
    export function validateUrl(url) { ... }
    export const DEFAULT_TIMEOUT = 5000;
    ```

### Commit Messages
- Commit messages are **freeform** (no strict prefixes), typically around 40 characters.
  - Example: `fix timeout issue in status checker`

## Workflows

### Adding a New Utility Function
**Trigger:** When you need to add a reusable function.
**Command:** `/add-utility`

1. Create a new file using camelCase (e.g., `newUtility.js`).
2. Write your function and export it using a named export.
    ```javascript
    export function newUtility(params) { ... }
    ```
3. Import your function where needed using a relative path.
    ```javascript
    import { newUtility } from './newUtility.js';
    ```
4. Add or update tests in a corresponding `*.test.js` file.
5. Commit your changes with a clear, concise message.

### Writing and Running Tests
**Trigger:** When you add or modify code that requires testing.
**Command:** `/run-tests`

1. Create or update a test file with the pattern `*.test.js`.
2. Write tests for your functions or modules.
    ```javascript
    // In webCheckUtils.test.js
    import { validateUrl } from './webCheckUtils.js';

    test('validateUrl returns true for valid URLs', () => {
      expect(validateUrl('https://example.com')).toBe(true);
    });
    ```
3. Run tests using your preferred JavaScript test runner (framework not specified).
4. Review test results and fix any failing tests before committing.

### Refactoring Existing Code
**Trigger:** When improving code structure or readability.
**Command:** `/refactor`

1. Identify the file(s) to refactor.
2. Rename files using camelCase if needed.
3. Update imports/exports to maintain relative paths and named exports.
4. Update or add tests to reflect changes.
5. Commit with a message describing the refactor.

## Testing Patterns

- Test files follow the `*.test.js` naming convention.
- The specific test framework is not detected; use standard JavaScript testing practices.
- Example test structure:
    ```javascript
    import { functionName } from './moduleName.js';

    test('description', () => {
      // assertions
    });
    ```

## Commands
| Command        | Purpose                                      |
|----------------|----------------------------------------------|
| /add-utility   | Add a new utility function/module            |
| /run-tests     | Run all test files matching `*.test.js`      |
| /refactor      | Refactor code while following conventions    |
```