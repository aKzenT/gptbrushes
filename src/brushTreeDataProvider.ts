import * as vscode from 'vscode';

export class BrushTreeDataProvider implements vscode.TreeDataProvider<BrushItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<BrushItem | undefined> = new vscode.EventEmitter<BrushItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<BrushItem | undefined> = this._onDidChangeTreeData.event;

  private brushes?: Brush[] = undefined;

  constructor() { }

  refresh(): void {
    this.brushes = undefined;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: BrushItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }

  async getChildren(element?: BrushItem): Promise<BrushItem[]> {
    if (element) {
      return Promise.resolve([]);
    } else {
      const result = this.brushes ??= (await vscode.commands.executeCommand('gptbrushes.getBrushes') as Brush[]);
      return result.map(brush => new BrushItem(brush));
    }
  }
}

class BrushItem extends vscode.TreeItem {
  constructor(private brush: Brush) {
    super(`${brush.name}`, vscode.TreeItemCollapsibleState.None);
    this.command = {
      command: `gptbrushes.useBrush`,
      title: 'Use Brush',
      arguments: [brush],
    };
    this.iconPath = this.getIconPath();
  }

  getIconPath(): vscode.Uri | vscode.ThemeIcon {
    if (/^[a-z0-9-]+$/i.test(this.brush.icon)) {
      return new vscode.ThemeIcon(this.brush.icon);
    }
    else {
      const emojiSvg = `<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg" >
    <style>
      .text {
        font: normal 24px sans-serif;
      }
    </style>
  
    <text x="0" y="24" class="text">${this.brush.icon}</text>
  </svg>`.replace(/\s+/g, ' ');
      return vscode.Uri.from({
        scheme: "data",
        path: 'image/svg+xml;utf8,' + emojiSvg
      });
    }
  }
}
