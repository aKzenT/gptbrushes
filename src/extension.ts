// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import vscode from 'vscode'
import { StorageService } from './util/storage'
import { getConfig, activateConfig } from './config/config'
import { activateSelectionHelper } from './util/selection'
import { outputChannel } from './util/channel'
import { activateApiKey } from './openai-api'
import { activateUseBrush } from './brush/use-brush'

export async function activate(context: vscode.ExtensionContext) {
  const storageManager = new StorageService(context.globalState)

  context.globalState.setKeysForSync(['gptbrushes.config', 'gptbrushes.apiKey'])

  const config = await getConfig(storageManager)
  const brushTreeDataProvider = activateConfig(context, storageManager) // registers edit and delete commands

  if (!config.brushes.length) {
    await vscode.window.showErrorMessage('No brushes in the config! Could not start extension.')
    return
  }

  activateApiKey(context)

  const editor = vscode.window.activeTextEditor
  if (!editor) {
    await vscode.window.showErrorMessage('Please open a text editor to use GPT-4 Brushes.')
    return
  }

  const sel = activateSelectionHelper(context, editor, storageManager)

  activateUseBrush(storageManager, context, editor, sel)

  const treeView = vscode.window.createTreeView('gptbrushes.brushList', {
    treeDataProvider: brushTreeDataProvider,
  })

  sel.savedSelectionEvents.addListener(() => brushTreeDataProvider.refresh())

  treeView.title = 'GPT-4 Brushes!'
  treeView.message = 'Select some text and click a brush to use it.'

  outputChannel.appendLine('GPT-4 Brushes extension activated.')
}

export function deactivate() {
  outputChannel.appendLine('GPT-4 Brushes extension deactivated.')
}
