// Unable to resolve path to module 'vscode'.eslintimport/no-unresolved module "vscode"
// Type Definition for Visual Studio Code 1.76 Extension API See https://code.visualstudio.com/api for more information
import vscode from 'vscode'
// The fix to the issue
import {
  ConfigBrush,
  ConfigBrushCategory,
  ConfigRequestOptions,
  getBrushes,
  getCategories,
} from '../config/config'
export { ConfigBrush }
import { outputChannel } from '../util/channel'
import { brushTemplate, brushes, categories } from '../config/config-defaults'
import { StorageService } from 'util/storage'

// The issue with the below class is that I for some reason can't get the tree list items to have children.
// I have managed to get both categories and items show up in the root of the tree using this approach or
// a minimal modification of this approach but I don't know how to make it so that the categories have the brushes
// as children and that you can expand the categories.
export class BrushTreeDataProvider implements vscode.TreeDataProvider<AnyBrushTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<AnyBrushTreeItem> =
    new vscode.EventEmitter<AnyBrushTreeItem>()

  readonly onDidChangeTreeData: vscode.Event<AnyBrushTreeItem> = this._onDidChangeTreeData.event

  public items!: AnyBrushTreeItem[]
  public rootItems: AnyBrushTreeItem[] = []
  public categories!: AnyBrushTreeItem[]
  public brushes!: AnyBrushTreeItem[]
  public storage!: StorageService
  private firstRun = false
  private badBrushes?: ConfigBrush[]
  private badCategories?: ConfigBrushCategory[]

  constructor(
    storage: StorageService,
    brushes?: ConfigBrush[],
    categories?: ConfigBrushCategory[]
  ) {
    this.firstRun = true
    this.storage = storage
    this.refresh()
    this.badBrushes = brushes
    this.badCategories = categories
  }

  public refresh() {
    this.categories = []
    this.brushes = []
    this.rootItems = []
    this.items = []

    let brushes = this.badBrushes
    let categories = this.badCategories

    if (!this.firstRun || !brushes || !categories) {
      categories = getCategories(this.storage)
      brushes = getBrushes(this.storage, categories)
    }

    this.categories = categories.map((v, i) => {
      const val = v as ConfigBrushCategory & {
        contextValue: string
      }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!val.contextValue) {
        val.contextValue = 'category'
      }
      const categoryItem = new BrushTreeItem(val, i)
      this.rootItems.push(categoryItem)
      return categoryItem
    })
    this.rootItems.push(
      new BrushTreeItem(
        { name: 'Add new category', contextValue: 'addCategory' },
        this.rootItems.length
      )
    )
    this.rootItems.push(
      new BrushTreeItem(
        { name: 'Save selection', contextValue: 'saveSelection' },
        this.rootItems.length
      )
    )

    this.brushes = brushes.map((v, i) => {
      const val = v as ConfigBrush & { contextValue: string }
      val.contextValue = 'brush'
      const brushItem = new BrushTreeItem(val, i)

      const found = this.categories.find((c) => c.label === val.category)
      if (found) {
        found.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
        found.children.push(brushItem)
      } else {
        const uncategorized = this.categories.find((c) => c.label === 'Uncategorized')
        uncategorized?.children.push(brushItem)
      }

      return brushItem
    })
    this.items = [...this.categories, ...this.brushes]

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    this._onDidChangeTreeData.fire(undefined as any)

    if (this.firstRun) {
      this.firstRun = false
      this.badBrushes = []
      this.badCategories = []
    }
  }

  public getTreeItem(element: AnyBrushTreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
    switch (element.contextValue) {
      case 'category':
      case 'uncategorized':
        break
      case 'brush':
        if (typeof element.id === 'string' && element.id.length) {
          element.command = {
            command: 'gptbrushes.useBrush',
            title: 'Use Brush',
            arguments: [element.id],
          }
        }
        if (element.systemPrompt) {
          element.tooltip = element.systemPrompt
        }
        break
      case 'addBrush':
        element.iconPath = new vscode.ThemeIcon('add')
        element.command = {
          command: 'gptbrushes.addBrush',
          title: 'Add new brush',
          arguments: [{ source: brushTemplate }],
        }
        break
      case 'addCategory':
        element.iconPath = new vscode.ThemeIcon('add')
        element.command = {
          command: 'gptbrushes.addCategory',
          title: 'Add new category',
          arguments: [
            { source: { name: 'New category', contextValue: 'category', icon: 'folder' } },
          ],
        }
        break
      case 'saveSelection':
        {
          const selection = this.storage.getValue('gptbrushes.current_selection')
          element.iconPath =
            typeof selection === 'undefined'
              ? new vscode.ThemeIcon('list-selection')
              : new vscode.ThemeIcon('pass-filled')
          element.command = {
            command: 'gptbrushes.saveSelection',
            title: 'Save selection',
          }
        }
        break
    }

    return element as vscode.TreeItem
  }

  // and getChildren
  public getChildren(element?: AnyBrushTreeItem): vscode.ProviderResult<AnyBrushTreeItem[]> {
    if (element === undefined) {
      return this.rootItems
    } else {
      return element.children
    }
  }
}

export interface BrushTreeItemSource {
  contextValue: string
  name: string
  category?: string
  icon?: string
  prompt?: string
  messages?: { role: 'user' | 'assistant' | 'system'; content: string }[]
}

type AnyBrushTreeItem = BrushTreeItem<BrushTreeItemSource>

export const getIdFromItemSource = (source: BrushTreeItemSource): string => {
  return (
    (source.contextValue === 'uncategorized' || source.contextValue === 'category'
      ? 'category.'
      : '') +
    (source.contextValue === 'brush'
      ? source.category
        ? 'brush.' + source.category + '.'
        : 'brush.Uncategorized.'
      : '') +
    source.name
  )
}

type IconType = string | vscode.ThemeIcon | vscode.Uri | { light: vscode.Uri; dark: vscode.Uri }

class BrushTreeItem<T extends BrushTreeItemSource>
  extends vscode.TreeItem
  implements BrushTreeItemSource
{
  public name!: string
  public id!: string
  public contextValue!: string
  public children: BrushTreeItem<BrushTreeItemSource>[] = []

  public systemPrompt?: string
  public tooltip?: string | vscode.MarkdownString | undefined
  public category?: string

  public command?: vscode.Command
  public iconPath?: vscode.ThemeIcon | vscode.Uri | { light: vscode.Uri; dark: vscode.Uri }

  public addChild(child: BrushTreeItem<BrushTreeItemSource>) {
    this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
    this.children.push(child)
  }

  constructor(public source: T, public index?: number) {
    super(`${source.name}`, vscode.TreeItemCollapsibleState.None)

    this.id = getIdFromItemSource(source)

    if (source.icon) {
      this.iconPath = new vscode.ThemeIcon(source.icon)
    } else {
      this.iconPath = new vscode.ThemeIcon('symbol-namespace')
    }

    if (source.category) {
      this.category = source.category
    }

    this.contextValue = source.contextValue
    this.tooltip = source.prompt ? source.prompt : undefined

    this.collapsibleState = vscode.TreeItemCollapsibleState.None
  }
}
