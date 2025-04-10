import { GitFetcher } from '../GitFetcher';
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PackageManagerItem } from '../types';

// Mock fs.promises
jest.mock('fs/promises', () => ({
  stat: jest.fn(),
  mkdir: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn(),
  readFile: jest.fn()
}));
const mockedFs = fs as jest.Mocked<typeof fs>;

// Mock vscode
jest.mock('vscode', () => ({
  window: {
    showErrorMessage: jest.fn(),
  }
}));

describe('Parse Package Manager Items', () => {
  let gitFetcher: GitFetcher;

  const mockContext = {
    globalStorageUri: { fsPath: '/mock/storage/path' }
  } as unknown as vscode.ExtensionContext;

  beforeEach(() => {
    gitFetcher = new GitFetcher(mockContext);
    jest.clearAllMocks();
  });

  // Helper function to access private method
  const parsePackageManagerItems = async (repoDir: string, repoUrl: string) => {
    return (gitFetcher as any).parsePackageManagerItems(repoDir, repoUrl);
  };

  describe('directory structure handling', () => {
    it('should parse items from mcp-servers directory', async () => {
      // Mock directory structure
      mockedFs.stat.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('mcp-servers')) {
          return Promise.resolve({ isDirectory: () => true } as any);
        }
        if (pathStr.includes('metadata.yml')) {
          return Promise.resolve({ isFile: () => true } as any);
        }
        return Promise.reject(new Error('Not found'));
      });

      // Mock readdir to return items in mcp-servers directory
      mockedFs.readdir.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('mcp-servers')) {
          return Promise.resolve(['file-analyzer'] as any);
        }
        return Promise.resolve([] as any);
      });

      // Mock readFile to return metadata content
      mockedFs.readFile.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('file-analyzer/metadata.yml')) {
          return Promise.resolve('name: "File Analyzer MCP Server"\ndescription: "An MCP server that analyzes files"\ntype: "mcp-server"\nauthor: "Roo Team"\nversion: "1.0.0"\ntags: ["file-analyzer", "code-quality"]');
        }
        return Promise.reject(new Error('File not found'));
      });

      // Call the method
      const items = await parsePackageManagerItems('/mock/repo', 'https://github.com/example/repo');

      // Assertions
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('File Analyzer MCP Server');
      expect(items[0].type).toBe('mcp-server');
      expect(items[0].url).toBe('https://github.com/example/repo/tree/main/mcp-servers/file-analyzer');
    });

    it('should parse items from roles directory', async () => {
      // Mock directory structure
      mockedFs.stat.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('roles')) {
          return Promise.resolve({ isDirectory: () => true } as any);
        }
        if (pathStr.includes('metadata.yml')) {
          return Promise.resolve({ isFile: () => true } as any);
        }
        return Promise.reject(new Error('Not found'));
      });

      // Mock readdir to return items in roles directory
      mockedFs.readdir.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('roles')) {
          return Promise.resolve(['developer-role'] as any);
        }
        return Promise.resolve([] as any);
      });

      // Mock readFile to return metadata content
      mockedFs.readFile.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('developer-role/metadata.yml')) {
          return Promise.resolve('name: "Full-Stack Developer Role"\ndescription: "A role for a full-stack developer"\ntype: "role"\nauthor: "Roo Team"\nversion: "1.0.0"\ntags: ["developer", "full-stack"]');
        }
        return Promise.reject(new Error('File not found'));
      });

      // Call the method
      const items = await parsePackageManagerItems('/mock/repo', 'https://github.com/example/repo');

      // Assertions
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('Full-Stack Developer Role');
      expect(items[0].type).toBe('role');
      expect(items[0].url).toBe('https://github.com/example/repo/tree/main/roles/developer-role');
    });

    it('should parse items from storage-systems directory', async () => {
      // Mock directory structure
      mockedFs.stat.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('storage-systems')) {
          return Promise.resolve({ isDirectory: () => true } as any);
        }
        if (pathStr.includes('metadata.yml')) {
          return Promise.resolve({ isFile: () => true } as any);
        }
        return Promise.reject(new Error('Not found'));
      });

      // Mock readdir to return items in storage-systems directory
      mockedFs.readdir.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('storage-systems')) {
          return Promise.resolve(['github-storage'] as any);
        }
        return Promise.resolve([] as any);
      });

      // Mock readFile to return metadata content
      mockedFs.readFile.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('github-storage/metadata.yml')) {
          return Promise.resolve('name: "GitHub Storage System"\ndescription: "A storage system that uses GitHub repositories"\ntype: "storage"\nauthor: "Roo Team"\nversion: "1.0.0"\ntags: ["storage", "github"]');
        }
        return Promise.reject(new Error('File not found'));
      });

      // Call the method
      const items = await parsePackageManagerItems('/mock/repo', 'https://github.com/example/repo');

      // Assertions
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('GitHub Storage System');
      expect(items[0].type).toBe('storage');
      expect(items[0].url).toBe('https://github.com/example/repo/tree/main/storage-systems/github-storage');
    });

    it('should parse items from items directory (backward compatibility)', async () => {
      // Mock directory structure
      mockedFs.stat.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('/items')) {
          return Promise.resolve({ isDirectory: () => true } as any);
        }
        if (pathStr.includes('metadata.yml')) {
          return Promise.resolve({ isFile: () => true } as any);
        }
        return Promise.reject(new Error('Not found'));
      });

      // Mock readdir to return items in items directory
      mockedFs.readdir.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('/items')) {
          return Promise.resolve(['generic-item'] as any);
        }
        return Promise.resolve([] as any);
      });

      // Mock readFile to return metadata content
      mockedFs.readFile.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('generic-item/metadata.yml')) {
          return Promise.resolve('name: "Generic Item"\ndescription: "A generic package manager item"\ntype: "other"\nauthor: "Roo Team"\nversion: "1.0.0"\ntags: ["generic", "other"]');
        }
        return Promise.reject(new Error('File not found'));
      });

      // Call the method
      const items = await parsePackageManagerItems('/mock/repo', 'https://github.com/example/repo');

      // Assertions
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('Generic Item');
      expect(items[0].type).toBe('other');
      expect(items[0].url).toBe('https://github.com/example/repo/tree/main/items/generic-item');
    });

    it('should parse items from multiple directories', async () => {
      // Mock directory structure
      mockedFs.stat.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('mcp-servers') || pathStr.includes('roles') || pathStr.includes('storage-systems')) {
          return Promise.resolve({ isDirectory: () => true } as any);
        }
        if (pathStr.includes('metadata.yml')) {
          return Promise.resolve({ isFile: () => true } as any);
        }
        return Promise.reject(new Error('Not found'));
      });

      // Mock readdir to return items in each directory
      mockedFs.readdir.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('mcp-servers')) {
          return Promise.resolve(['file-analyzer'] as any);
        }
        if (pathStr.includes('roles')) {
          return Promise.resolve(['developer-role'] as any);
        }
        if (pathStr.includes('storage-systems')) {
          return Promise.resolve(['github-storage'] as any);
        }
        return Promise.resolve([] as any);
      });

      // Mock readFile to return metadata content
      mockedFs.readFile.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('file-analyzer/metadata.yml')) {
          return Promise.resolve('name: "File Analyzer MCP Server"\ndescription: "An MCP server that analyzes files"\ntype: "mcp-server"\nauthor: "Roo Team"\nversion: "1.0.0"\ntags: ["file-analyzer", "code-quality"]');
        }
        if (pathStr.includes('developer-role/metadata.yml')) {
          return Promise.resolve('name: "Full-Stack Developer Role"\ndescription: "A role for a full-stack developer"\ntype: "role"\nauthor: "Roo Team"\nversion: "1.0.0"\ntags: ["developer", "full-stack"]');
        }
        if (pathStr.includes('github-storage/metadata.yml')) {
          return Promise.resolve('name: "GitHub Storage System"\ndescription: "A storage system that uses GitHub repositories"\ntype: "storage"\nauthor: "Roo Team"\nversion: "1.0.0"\ntags: ["storage", "github"]');
        }
        return Promise.reject(new Error('File not found'));
      });

      // Call the method
      const items = await parsePackageManagerItems('/mock/repo', 'https://github.com/example/repo');

      // Assertions
      expect(items).toHaveLength(3);

      // Check for MCP server item
      const mcpServerItem = items.find((item: PackageManagerItem) => item.type === 'mcp-server');
      expect(mcpServerItem).toBeDefined();
      expect(mcpServerItem?.name).toBe('File Analyzer MCP Server');
      expect(mcpServerItem?.url).toBe('https://github.com/example/repo/tree/main/mcp-servers/file-analyzer');

      // Check for role item
      const roleItem = items.find((item: PackageManagerItem) => item.type === 'role');
      expect(roleItem).toBeDefined();
      expect(roleItem?.name).toBe('Full-Stack Developer Role');
      expect(roleItem?.url).toBe('https://github.com/example/repo/tree/main/roles/developer-role');

      // Check for storage system item
      const storageItem = items.find((item: PackageManagerItem) => item.type === 'storage');
      expect(storageItem).toBeDefined();
      expect(storageItem?.name).toBe('GitHub Storage System');
      expect(storageItem?.url).toBe('https://github.com/example/repo/tree/main/storage-systems/github-storage');
    });
  });
});