# Browsing Packages

## Understanding the Package Manager Interface

The Package Manager interface is designed to provide a clean, intuitive experience for discovering and exploring available components. The main interface consists of several key areas:

### Main Sections

1. **Navigation Tabs**
   - **Browse**: View all available components
   - **Sources**: Manage package sources

2. **Filter Panel**
   - Type filters (Modes, MCP Servers, Packages, etc.)
   - Search box
   - Tag filters

3. **Results Area**
   - Package cards displaying component information
   - Sorting options

### Interface Layout

```
┌─────────────────────────────────────────────────────────┐
│ [Browse] [Sources]                                      │
├─────────────────────────────────────────────────────────┤
│ FILTERS                                                 │
│ Types: □ Mode □ MCP Server □ Package □ Prompt           │
│ Search: [                                          ]    │
│ Tags: [Tag cloud]                                       │
├─────────────────────────────────────────────────────────┤
│ PACKAGE CARDS                                           │
│ ┌─────────────────────────────────────────────────┐     │
│ │ Package Name                           [Type]   │     │
│ │ by Author                                       │     │
│ │                                                 │     │
│ │ Description text...                             │     │
│ │                                                 │     │
│ │ [Tags] [Tags] [Tags]                            │     │
│ │                                                 │     │
│ │ v1.0.0    Apr 12, 2025                 [View]   │     │
│ └─────────────────────────────────────────────────┘     │
│                                                         │
│ ┌─────────────────────────────────────────────────┐     │
│ │ Another Package                        [Type]   │     │
│ │ ...                                             │     │
└─────────────────────────────────────────────────────────┘
```

## Package Cards and Information Displayed

Each package in the Package Manager is represented by a card that contains essential information about the component:

### Card Elements

1. **Header Section**
   - **Package Name**: The name of the component
   - **Author**: The creator or maintainer of the component (if available)
   - **Type Badge**: Visual indicator of the component type (Mode, MCP Server, etc.)

2. **Description**
   - A brief overview of the component's purpose and functionality

3. **Tags**
   - Clickable tags that categorize the component
   - Can be used for filtering similar components

4. **Metadata**
   - **Version**: The current version of the component (if available)
   - **Last Updated**: When the component was last modified (if available)

5. **Actions**
   - **View**: Button to access the component's source repository or documentation

6. **Details Section** (expandable)
   - Shows subcomponents grouped by type
   - Displays additional information when expanded

### Example Card

```
┌─────────────────────────────────────────────────────┐
│ Data Platform Package            [Package]          │
│ by Roo Team                                         │
│                                                     │
│ A comprehensive data processing and analysis        │
│ package with tools for ETL, visualization, and ML.  │
│                                                     │
│ [data] [analytics] [machine-learning]               │
│                                                     │
│ v2.1.0    Apr 10, 2025                  [View]      │
│                                                     │
│ ▼ Component Details                                 │
│   MCP Servers:                                      │
│   1. Data Validator - Validates data formats        │
│   2. ML Predictor - Makes predictions on data       │
│                                                     │
│   Modes:                                            │
│   1. Data Analyst - Helps with data analysis        │
│   2. ETL Engineer - Assists with data pipelines     │
└─────────────────────────────────────────────────────┘
```

## Navigating Between Packages

The Package Manager provides several ways to navigate through the available packages:

### Navigation Methods

1. **Scrolling**
   - Scroll through the list of package cards to browse all available components

2. **Filtering**
   - Use the filter panel to narrow down the displayed packages
   - Click on type filters to show only specific component types
   - Enter search terms to find packages by name or description
   - Click on tags to filter by specific categories

3. **Sorting**
   - Sort packages by name or last updated date
   - Toggle between ascending and descending order

4. **Tab Navigation**
   - Switch between "Browse" and "Sources" tabs to manage package sources

### Keyboard Navigation

For accessibility and efficiency, the Package Manager supports keyboard navigation:

- **Tab**: Move focus between interactive elements
- **Space/Enter**: Activate buttons or toggle filters
- **Arrow Keys**: Navigate between package cards
- **Escape**: Close expanded details or clear filters

---

**Previous**: [Introduction to Package Manager](./01-introduction.md) | **Next**: [Searching and Filtering](./03-searching-and-filtering.md)