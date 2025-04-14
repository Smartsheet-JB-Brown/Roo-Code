# Type Filter Test Plan for Package Manager

This document outlines the test plan for the proposed improvements to the type filtering functionality in the Package Manager.

## Unit Tests

### 1. Basic Type Filtering Tests

#### Test: Filter by Package Type

- **Input**: Items with various types including "package"
- **Filter**: `{ type: "package" }`
- **Expected**: Only items with type "package" are returned
- **Verification**: Check that the returned items all have type "package"

#### Test: Filter by Mode Type

- **Input**: Items with various types including "mode"
- **Filter**: `{ type: "mode" }`
- **Expected**: Only items with type "mode" are returned
- **Verification**: Check that the returned items all have type "mode"

#### Test: Filter by MCP Server Type

- **Input**: Items with various types including "mcp server"
- **Filter**: `{ type: "mcp server" }`
- **Expected**: Only items with type "mcp server" are returned
- **Verification**: Check that the returned items all have type "mcp server"

### 2. Package with Subcomponents Tests

#### Test: Package with Matching Subcomponents

- **Input**: A package with subcomponents of various types
- **Filter**: `{ type: "mode" }`
- **Expected**: The package is returned if it contains at least one subcomponent with type "mode"
- **Verification**:
    - Check that the package is returned
    - Check that `item.matchInfo.matched` is `true`
    - Check that `item.matchInfo.matchReason.hasMatchingSubcomponents` is `true`
    - Check that subcomponents with type "mode" have `subItem.matchInfo.matched` set to `true`
    - Check that subcomponents with other types have `subItem.matchInfo.matched` set to `false`

#### Test: Package with No Matching Subcomponents

- **Input**: A package with subcomponents of various types, but none matching the filter
- **Filter**: `{ type: "prompt" }`
- **Expected**: The package is not returned
- **Verification**: Check that the package is not in the returned items

#### Test: Package with No Subcomponents

- **Input**: A package with no subcomponents
- **Filter**: `{ type: "mode" }`
- **Expected**: The package is not returned (since it's not a mode and has no subcomponents)
- **Verification**: Check that the package is not in the returned items

### 3. Combined Filtering Tests

#### Test: Type Filter and Search Term

- **Input**: Various items including packages with subcomponents
- **Filter**: `{ type: "mode", search: "test" }`
- **Expected**: Only items that match both the type filter and the search term are returned
- **Verification**:
    - Check that all returned items have type "mode" or are packages with mode subcomponents
    - Check that all returned items have "test" in their name or description, or have subcomponents with "test" in their name or description

#### Test: Type Filter and Tags

- **Input**: Various items with different tags
- **Filter**: `{ type: "mode", tags: ["test"] }`
- **Expected**: Only items that match both the type filter and have the "test" tag are returned
- **Verification**: Check that all returned items have type "mode" or are packages with mode subcomponents, and have the "test" tag

## Integration Tests

### 1. UI Display Tests

#### Test: Type Filter UI Updates

- **Action**: Apply a type filter in the UI
- **Expected**:
    - The UI shows only items that match the filter
    - For packages, subcomponents that match the filter are highlighted or marked in some way
- **Verification**: Visually inspect the UI to ensure it correctly displays which items and subcomponents match the filter

#### Test: Type Filter and Search Combination

- **Action**: Apply both a type filter and a search term in the UI
- **Expected**: The UI shows only items that match both the type filter and the search term
- **Verification**: Visually inspect the UI to ensure it correctly displays which items match both filters

### 2. Real Data Tests

#### Test: Filter with Real Package Data

- **Input**: Real package data from the default package source
- **Action**: Apply various type filters
- **Expected**: The results match the expected behavior for each filter
- **Verification**: Check that the results are consistent with the expected behavior

## Regression Tests

### 1. Search Term Filtering

#### Test: Search Term Only

- **Input**: Various items including packages with subcomponents
- **Filter**: `{ search: "test" }`
- **Expected**: The behavior is unchanged from before the type filter improvements
- **Verification**: Compare the results with the expected behavior from the previous implementation

### 2. Tag Filtering

#### Test: Tag Filter Only

- **Input**: Various items with different tags
- **Filter**: `{ tags: ["test"] }`
- **Expected**: The behavior is unchanged from before the type filter improvements
- **Verification**: Compare the results with the expected behavior from the previous implementation

### 3. No Filters

#### Test: No Filters Applied

- **Input**: Various items
- **Filter**: `{}`
- **Expected**: All items are returned
- **Verification**: Check that all items are returned and that their `matchInfo` properties are set correctly

## Edge Cases

### 1. Empty Input

#### Test: Empty Items Array

- **Input**: Empty array
- **Filter**: `{ type: "mode" }`
- **Expected**: Empty array is returned
- **Verification**: Check that an empty array is returned

### 2. Invalid Filters

#### Test: Invalid Type

- **Input**: Various items
- **Filter**: `{ type: "invalid" as ComponentType }`
- **Expected**: No items are returned (since none match the invalid type)
- **Verification**: Check that an empty array is returned

### 3. Null or Undefined Values

#### Test: Null Subcomponents

- **Input**: A package with `items: null`
- **Filter**: `{ type: "mode" }`
- **Expected**: The package is not returned (since it has no subcomponents to match)
- **Verification**: Check that the package is not in the returned items

#### Test: Undefined Metadata

- **Input**: A package with subcomponents that have `metadata: undefined`
- **Filter**: `{ type: "mode" }`
- **Expected**: The package is returned if any subcomponents have type "mode"
- **Verification**: Check that the package is returned if appropriate and that subcomponents with undefined metadata are handled correctly

## Performance Tests

### 1. Large Dataset

#### Test: Filter Large Dataset

- **Input**: A large number of items (e.g., 1000+)
- **Filter**: Various filters
- **Expected**: The filtering completes in a reasonable time
- **Verification**: Measure the time taken to filter the items and ensure it's within acceptable limits

### 2. Deep Nesting

#### Test: Deeply Nested Packages

- **Input**: Packages with deeply nested subcomponents
- **Filter**: Various filters
- **Expected**: The filtering correctly handles the nested structure
- **Verification**: Check that the results are correct for deeply nested structures

## Conclusion

This test plan covers the basic functionality, edge cases, and potential regressions for the proposed type filter improvements. By executing these tests, we can ensure that the changes work correctly and don't introduce any regressions.
