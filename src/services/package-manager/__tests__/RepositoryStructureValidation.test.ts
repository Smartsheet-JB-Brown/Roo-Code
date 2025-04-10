import { GitFetcher } from '../GitFetcher';
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs.promises
jest.mock('fs/promises', () => ({
  stat: jest.fn(),
  mkdir: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn().mockResolvedValue([]),
  readFile: jest.fn().mockResolvedValue('')
}));
const mockedFs = fs as jest.Mocked<typeof fs>;

// Mock vscode
jest.mock('vscode', () => ({
  window: {
    showErrorMessage: jest.fn(),
  }
}));

describe('Repository Structure Validation', () => {
  let gitFetcher: GitFetcher;

  const mockContext = {
    globalStorageUri: { fsPath: '/mock/storage/path' }
  } as unknown as vscode.ExtensionContext;

  beforeEach(() => {
    gitFetcher = new GitFetcher(mockContext);
    jest.clearAllMocks();
  });

  // Helper function to access private method
  const validateRepositoryStructure = async (repoDir: string) => {
    return (gitFetcher as any).validateRepositoryStructure(repoDir);
  };

  describe('metadata.yml validation', () => {
    it('should throw error when metadata.yml is missing', async () => {
      // Mock stat to return false for metadata.yml
      mockedFs.stat.mockImplementation((path) => {
        if (path.toString().includes('metadata.yml')) {
          return Promise.reject(new Error('File not found'));
        }
        return Promise.resolve({ isDirectory: () => true, isFile: () => true } as any);
      });

      // Call the method and expect it to throw
      await expect(validateRepositoryStructure('/mock/repo')).rejects.toThrow('Repository is missing metadata.yml file');
    });

    it('should pass when metadata.yml exists', async () => {
      // Mock stat to return true for metadata.yml and at least one item directory
      mockedFs.stat.mockImplementation((path) => {
        return Promise.resolve({ isDirectory: () => true, isFile: () => true } as any);
      });

      // Call the method and expect it not to throw
      await expect(validateRepositoryStructure('/mock/repo')).resolves.not.toThrow();
    });
  });

  describe('item directories validation', () => {
    it('should throw error when no item directories exist', async () => {
      // Mock stat to return true for metadata.yml but false for all item directories
      mockedFs.stat.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('metadata.yml')) {
          return Promise.resolve({ isFile: () => true } as any);
        }
        if (pathStr.includes('mcp-servers') || pathStr.includes('roles') ||
            pathStr.includes('storage-systems') || pathStr.includes('items')) {
          return Promise.reject(new Error('Directory not found'));
        }
        return Promise.resolve({ isDirectory: () => true } as any);
      });

      // Call the method and expect it to throw
      await expect(validateRepositoryStructure('/mock/repo')).rejects.toThrow(
        'Repository is missing item directories (mcp-servers, roles, storage-systems, or items)'
      );
    });

    it('should pass when mcp-servers directory exists', async () => {
      // Mock stat to return true for metadata.yml and mcp-servers
      mockedFs.stat.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('metadata.yml') || pathStr.includes('mcp-servers')) {
          return Promise.resolve({ isDirectory: () => true, isFile: () => true } as any);
        }
        return Promise.reject(new Error('Not found'));
      });

      // Call the method and expect it not to throw
      await expect(validateRepositoryStructure('/mock/repo')).resolves.not.toThrow();
    });

    it('should pass when roles directory exists', async () => {
      // Mock stat to return true for metadata.yml and roles
      mockedFs.stat.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('metadata.yml') || pathStr.includes('roles')) {
          return Promise.resolve({ isDirectory: () => true, isFile: () => true } as any);
        }
        return Promise.reject(new Error('Not found'));
      });

      // Call the method and expect it not to throw
      await expect(validateRepositoryStructure('/mock/repo')).resolves.not.toThrow();
    });

    it('should pass when storage-systems directory exists', async () => {
      // Mock stat to return true for metadata.yml and storage-systems
      mockedFs.stat.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('metadata.yml') || pathStr.includes('storage-systems')) {
          return Promise.resolve({ isDirectory: () => true, isFile: () => true } as any);
        }
        return Promise.reject(new Error('Not found'));
      });

      // Call the method and expect it not to throw
      await expect(validateRepositoryStructure('/mock/repo')).resolves.not.toThrow();
    });

    it('should pass when items directory exists (backward compatibility)', async () => {
      // Mock stat to return true for metadata.yml and items
      mockedFs.stat.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('metadata.yml') || pathStr.includes('/items')) {
          return Promise.resolve({ isDirectory: () => true, isFile: () => true } as any);
        }
        return Promise.reject(new Error('Not found'));
      });

      // Call the method and expect it not to throw
      await expect(validateRepositoryStructure('/mock/repo')).resolves.not.toThrow();
    });
  });

  describe('package-manager-template structure', () => {
    it('should validate the package-manager-template structure', async () => {
      // Mock stat to simulate the package-manager-template structure
      mockedFs.stat.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('metadata.yml') ||
            pathStr.includes('mcp-servers') ||
            pathStr.includes('roles') ||
            pathStr.includes('storage-systems')) {
          return Promise.resolve({ isDirectory: () => true, isFile: () => true } as any);
        }
        if (pathStr.includes('items')) {
          return Promise.reject(new Error('Directory not found'));
        }
        return Promise.resolve({ isDirectory: () => true } as any);
      });

      // Call the method and expect it not to throw
      await expect(validateRepositoryStructure('/mock/repo')).resolves.not.toThrow();
    });
  });
});