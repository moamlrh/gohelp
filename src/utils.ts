import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export default class Utils {
  static async getPackageName(document: vscode.TextDocument): Promise<string> {
    const text = document.getText();
    const packageRegex = /package\s+(\w+)/;
    const match = text.match(packageRegex);
    return match ? match[1] : "main";
  }

  static getDirectoriesRecursive(dir: string): string[] {
    let depth = 0;
    let results: string[] = [];
    const list = fs.readdirSync(dir);

    list.forEach((file) => {
      const filePath = path.join(dir, file);
      if (fs.statSync(filePath).isDirectory()) {
        results.push(filePath);
        if (depth < 5) {
          results = results.concat(this.getDirectoriesRecursive(filePath));
        }
        depth++;
      }
    });

    return results;
  }

  static async promptForDirPicker(
    rootDir: string | undefined
  ): Promise<string | undefined> {
    const currentDir = path.dirname(
      vscode.window.activeTextEditor?.document.uri.fsPath || ""
    );
    const listDirectories = new Set();
    listDirectories.add(".");

    let selectedDir = "";
    const directories = rootDir ? this.getDirectoriesRecursive(rootDir) : [];
    if (directories.length === 0) {
      return currentDir;
    }

    directories.forEach((dir) => listDirectories.add(dir));

    await vscode.window.showQuickPick(
      Array.from(listDirectories) as readonly vscode.QuickPickItem[],
      {
        placeHolder: "Select the directory to move the file to",
        canPickMany: false,
        ignoreFocusOut: true,
        onDidSelectItem: async (item) => (selectedDir = item.toString()),
      }
    );

    return selectedDir === "." ? currentDir : selectedDir;
  }

  static async promptForNewFilePath(
    document: vscode.TextDocument,
    name: string
  ): Promise<string | undefined> {
    const dirPath = path.dirname(document.uri.fsPath);
    const defaultFileName = `${name.toLowerCase()}.go`;
    const defaultFilePath = path.join(dirPath, defaultFileName);

    var rootDir = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootDir) {
      vscode.window.showErrorMessage("No workspace folder found.");
      return "";
    }
    var selectedDir = await this.promptForDirPicker(rootDir);
    var fullFilePathName = selectedDir
      ? path.join(selectedDir, defaultFileName)
      : defaultFilePath;
    const result = await vscode.window.showInputBox({
      prompt: "Enter the new file path",
      value: fullFilePathName,
      valueSelection: [
        fullFilePathName.length - defaultFileName.length,
        fullFilePathName.length - 3,
      ],
      validateInput: async (input) => {
        if (!input.endsWith(".go")) {
          return "File name must end with .go";
        }
        if (fs.existsSync(input)) {
          return "File already exists";
        }
        return "";
      },
    });

    if (result) {
      const resultDir = path.dirname(result);
      if (!fs.existsSync(resultDir)) {
        await fs.promises.mkdir(resultDir, { recursive: true });
      }

      if (!fs.existsSync(result)) {
        await fs.promises.writeFile(result, "");
      }
    }

    return result;
  }

  static async extractContent(
    document: vscode.TextDocument,
    startLine: number,
    name: string
  ): Promise<string | null> {
    const text = document.getText();
    const lines = text.split("\n");
    let endLine = startLine;
    let braceCount = 0;
    let found = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes("{")) braceCount++;
      if (line.includes("}")) braceCount--;

      if (braceCount === 0 && found) {
        endLine = i;
        break;
      }

      if (line.includes(name)) found = true;
    }

    if (!found || braceCount !== 0) {
      return null;
    }

    return lines.slice(startLine, endLine + 1).join("\n");
  }

  static async createNewFileWithContent(
    filePath: string,
    packageName: string,
    content: string
  ): Promise<void> {
    const fileContent = `package ${packageName}\n\n${content}`;
    await fs.promises.writeFile(filePath, fileContent);
  }

  static async removeContentFromOriginalFile(
    document: vscode.TextDocument,
    content: string
  ): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    const fullText = document.getText();
    const startIndex = fullText.indexOf(content);
    if (startIndex !== -1) {
      const startPos = document.positionAt(startIndex);
      const endPos = document.positionAt(startIndex + content.length);
      edit.delete(document.uri, new vscode.Range(startPos, endPos));
      await vscode.workspace.applyEdit(edit);
    }
  }

  static updatePackageAndImports(
    content: string,
    oldPackage: string,
    newPackage: string
  ): string {
    // Update package declaration
    content = content.replace(/package\s+\w+/, `package ${newPackage}`);

    // Update imports if the package name changed
    if (oldPackage !== newPackage) {
      const importRegex = new RegExp(`"${oldPackage}/(\\w+)"`, "g");
      content = content.replace(importRegex, `"${newPackage}/$1"`);
    }

    return content;
  }

  static async updateImportsInOriginalFile(
    document: vscode.TextDocument,
    movedName: string,
    newPackage: string
  ): Promise<void> {
    const text = document.getText();
    const updatedText = text.replace(
      new RegExp(`(\\W)${movedName}(\\W)`, "g"),
      `$1${newPackage}.${movedName}$2`
    );

    if (text !== updatedText) {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        document.uri,
        new vscode.Range(0, 0, document.lineCount, 0),
        updatedText
      );
      await vscode.workspace.applyEdit(edit);

      // Add import if not present
      const importStatement = `import "${newPackage}"`;
      if (!updatedText.includes(importStatement)) {
        const importPosition = this.getImportPosition(document);
        edit.insert(document.uri, importPosition, importStatement + "\n");
        await vscode.workspace.applyEdit(edit);
      }
    }
  }

  static getImportPosition(document: vscode.TextDocument): vscode.Position {
    const text = document.getText();
    const lines = text.split("\n");
    let importLine = lines.findIndex((line) =>
      line.trim().startsWith("import")
    );
    if (importLine === -1) {
      importLine =
        lines.findIndex((line) => line.trim().startsWith("package")) + 1;
    } else {
      while (
        importLine < lines.length &&
        (lines[importLine].includes("(") || lines[importLine].trim() !== ")")
      ) {
        importLine++;
      }
    }
    return new vscode.Position(importLine, 0);
  }
}
