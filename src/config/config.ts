import { outputChannel } from '../util/channel'
import { CreateChatCompletionRequest, CreateCompletionRequest } from 'openai'
import vscode from 'vscode'
import { StorageService } from 'util/storage'
import fs from 'fs'
import * as defaults from './config-defaults'
import path from 'path'

// We should add config option to switch between these maybe?
import YAML from 'yaml'
import JSON5 from 'json5'
import { hasField } from '../util'
// eslint-disable-next-line import/no-extraneous-dependencies
//import JSON5 from 'json5'

export function getKeyFromSource(_key: string | { source: AnyConfigOpt }): string {
  let key = ''
  if (typeof _key !== 'string') {
    key = getIdFromItemSource(_key.source as BrushTreeItemSource)
  } else {
    key = _key
  }
  return key
}

import {
  getIdFromItemSource,
  BrushTreeItemSource,
  BrushTreeDataProvider,
} from '../brush/brush-tree'

export type ConfigRequestOptions = Partial<CreateChatCompletionRequest> &
  Partial<CreateCompletionRequest> & { model: string; type: 'chat' | 'completion' }

export function getRequestOptions(
  source: StorageService | Partial<ConfigRequestOptions> | undefined
): ConfigRequestOptions | undefined {
  if (!source) {
    return defaults.requestOptions
  }
  const cfg: Partial<ConfigRequestOptions> | undefined =
    'model' in source
      ? source
      : (source as StorageService).getValue<Partial<ConfigRequestOptions>>(
          'gptbrushes.config.requestOptions'
        )

  if (!cfg || Object.keys(cfg).length === 0) {
    return undefined
  }

  let type: 'chat' | 'completion' = 'chat'

  // TODO - Make some more cases here for different models
  if (!cfg.type && cfg.model === 'gpt-4') {
    type = 'chat'
  }

  const requestOptions = { ...defaults.requestOptions, ...cfg, type }

  return requestOptions
}

export interface ConfigBrushVariable {
  name: string
  description: string
  defaultValue?: string
}

export interface ConfigBrush {
  name: string
  prompt: string // Prompt, or system prompt if type == 'chat', to be sent to the GPT-4 API for this brush
  icon: string
  category: string // A category defined in gptbrushes.categories (default: "Uncategorized")
  messages?: {
    role: 'user' | 'assistant' // If user then you can use {{user_code}} in the content
    content: string
  }[]
  contextValue?: 'brush'
  requestOptions?: ConfigRequestOptions
  variables?: ConfigBrushVariable[]
}

export interface ConfigBrushCategory {
  name: string
  icon?: string
  contextValue: 'category' | 'uncategorized'
}

interface Config {
  brushes: ConfigBrush[]
  categories: ConfigBrushCategory[]
  requestOptions: ConfigRequestOptions
}

export async function getConfig(storage: StorageService): Promise<Config> {
  let categories = getCategories(storage)
  if (categories.length === 1) {
    categories = [...defaults.categories, ...categories]
    await storage.setValue('gptbrushes.config.categories', categories)
  }

  let brushes = getBrushes(storage, categories)
  outputChannel.appendLine('GPT-4 Brushes: brushes: ' + JSON.stringify(brushes))
  if (brushes.length === 0) {
    brushes = parseBrushes(defaults.brushes)
    await storage.setValue('gptbrushes.config.brushes', brushes)
  }

  const requestOptions = getRequestOptions(storage)
  let requestOptionsOrDefault: ConfigRequestOptions
  if (requestOptions?.type && requestOptions.model) {
    requestOptionsOrDefault = requestOptions
  } else {
    requestOptionsOrDefault = defaults.requestOptions
    await storage.setValue('gptbrushes.config.requestOptions', requestOptionsOrDefault)
  }

  return {
    brushes,
    categories,
    requestOptions: requestOptionsOrDefault,
  }
}

export function getBrushes(
  storage: StorageService,
  categories?: ConfigBrushCategory[],
  displayError?: boolean
): ConfigBrush[] {
  const brushes: unknown[] | undefined = storage.getValue('gptbrushes.config.brushes')

  if (displayError && (!Array.isArray(brushes) || !brushes.length)) {
    void vscode.window.showErrorMessage('GPT-4 Brushes: No brushes defined in the configuration.')
    outputChannel.appendLine('GPT-4 Brushes: No brushes defined in the configuration.')
  }

  return parseBrushes(brushes)
}

function parseBrushes(brushes: unknown[] | undefined | null): ConfigBrush[] {
  if (!Array.isArray(brushes) || !brushes.length) {
    return []
  }
  const parsedBrushes: ConfigBrush[] = brushes.map((maybeBrush) => {
    let parsed: Partial<ConfigBrush> = {}

    const brush = maybeBrush as ConfigBrush

    parsed.requestOptions = getRequestOptions(brush.requestOptions)

    if (!brush.name || !brush.prompt) {
      const errMessage = `GPT-4 Brushes: Brush "${brush.name}" is missing a required property in the config.`
      void vscode.window.showWarningMessage(errMessage)
      outputChannel.appendLine(errMessage)
    }

    if (!brush.icon) {
      parsed.icon = 'symbol-namespace'
    }

    parsed = { ...brush, ...parsed } // override brush values with parsed brush values

    return parsed as ConfigBrush
  })

  return parsedBrushes
}

export async function saveBrush(
  brush: ConfigBrush,
  storage: StorageService,
  brushes?: ConfigBrush[],
  categories?: ConfigBrushCategory[]
): Promise<{ success: boolean }> {
  if (!brushes) {
    brushes = getBrushes(storage, categories)
  }
  if (!categories) {
    categories = getCategories(storage)
  }
  const parsedBrushOrEmpty: ConfigBrush[] | ConfigBrush = parseBrushes([brush])

  if (!parsedBrushOrEmpty.length) {
    void vscode.window.showWarningMessage(`GPT-4 Brushes: Brush "${brush.name}" is invalid.`)
    return { success: false }
  }

  const parsedBrush = parsedBrushOrEmpty[0]
  const outputBrushes = brushes

  let found = false
  for (let i = 0; i < brushes.length; i++) {
    if (brushes[i].name === parsedBrush.name) {
      found = true
      brushes[i] = parsedBrush
      break
    }
  }

  if (!found) {
    outputBrushes.push(parsedBrush)
  }

  if (outputBrushes.length) {
    await storage.setValue('gptbrushes.config.brushes', outputBrushes)
    return { success: true }
  }

  return { success: false }
}

export async function deleteBrush(
  brush: ConfigBrush,
  storage: StorageService,
  brushes?: ConfigBrush[],
  categories?: ConfigBrushCategory[]
) {
  if (!categories) {
    categories = getCategories(storage)
  }

  if (!brushes) {
    brushes = getBrushes(storage)
  }

  const outputBrushes = brushes.filter(
    (b) => !(b.name === brush.name && b.category === brush.category)
  )

  await deleteFormattedConfig(storage, { source: brush })

  await storage.setValue('gptbrushes.config.brushes', outputBrushes)
}

export function getCategories(storage: StorageService): ConfigBrushCategory[] {
  const categories: ConfigBrushCategory[] | undefined = storage.getValue(
    'gptbrushes.config.categories'
  )

  if (categories) {
    for (const cat of categories) {
      if (cat.contextValue !== 'uncategorized') {
        cat.contextValue = 'category'
      }
    }
  }

  if (
    !Array.isArray(categories) ||
    !categories.length ||
    !categories.some((c) => c.contextValue === 'uncategorized')
  ) {
    const rest = categories?.length ? categories : []
    return [
      {
        name: 'Uncategorized',
        icon: 'book',
        contextValue: 'uncategorized',
      },
      ...rest,
    ]
  }

  return categories
}

export function omitCategoryContextValue(
  categories: ConfigBrushCategory[]
): Omit<ConfigBrushCategory, 'contextValue'>[] {
  return categories.map((c) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { contextValue, ...rest } = c
    return rest
  })
}

export async function saveCategory(
  category: ConfigBrushCategory,
  storage: StorageService,
  categories?: ConfigBrushCategory[]
) {
  if (!categories) {
    categories = getCategories(storage)
  }

  if (!category.name) {
    void vscode.window.showErrorMessage('Category does not have a name.')
    return
  }

  let found = false
  for (let i = 0; i < categories.length; i++) {
    if (categories[i].name === category.name) {
      found = true
      categories[i] = category
      break
    }
  }

  if (category.contextValue !== 'uncategorized') {
    category.contextValue = 'category'
  }

  if (!found) {
    categories.push(category)
  }

  if (categories.length) {
    await storage.setValue('gptbrushes.config.categories', categories)
  }
}

export async function saveRequestOptions(
  requestOptions: ConfigRequestOptions | undefined,
  storage: StorageService
) {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!requestOptions?.model || !requestOptions.type) {
    void vscode.window.showErrorMessage('Request options are missing required properties.')
    return
  }
  await storage.setValue('gptbrushes.config.requestOptions', requestOptions)
}

export async function deleteCategory(
  categoryName: string,
  storage: StorageService,
  categories?: ConfigBrushCategory[]
) {
  if (!categories) {
    categories = getCategories(storage)
  }

  const outputCategories = categories.filter((c) => c.name !== categoryName)

  if (categories.length) {
    await storage.setValue('gptbrushes.config.categories', outputCategories)
  }
}

export async function askForVariables(
  variables?: ConfigBrushVariable[]
): Promise<(ConfigBrushVariable & { value: string })[] | undefined> {
  const outputVariables: (ConfigBrushVariable & { value: string })[] = []

  if (variables) {
    for (const variable of variables) {
      let input = await vscode.window.showInputBox({
        prompt: variable.description,
        ignoreFocusOut: true,
      })

      if (input === undefined) {
        return undefined
      }

      if (input === '') {
        void vscode.window.showWarningMessage(
          `GPT-4 Brushes: Variable "${variable.name}" was set to the default: "${String(
            variable.defaultValue
          )}".`
        )
        if (typeof variable.defaultValue === 'undefined') {
          return undefined
        }
        input = variable.defaultValue
      }

      outputVariables.push({ ...variable, value: input })
    }
  }
  if (!outputVariables.length) {
    return undefined
  }

  return outputVariables
}

type AnyConfigOpt = ConfigBrush | ConfigBrushCategory | ConfigRequestOptions | undefined

/**
 * @param key - Key to get config from
 *  - `category.<name>` - Category
 *  - `brush.<category>.<name>` - Brush
 *  - `requestOptions` - Request options
 *
 * @param storage - Storage service
 *
 * @returns
 * - `allContents` - All contents of the config type
 * - `content` - The content of the config type
 * - `saveContent` - Function to save the content
 * - `{ allContents: undefined; content: undefined; saveContent: undefined }` if key is invalid
 *
 */

function getConfigFromKey<T extends AnyConfigOpt>(
  _key: string | { source: T },
  storage: StorageService
):
  | { allContents: undefined; content: undefined; saveContent: undefined; deleteContent: undefined }
  | {
      allContents: T[] | undefined
      content: T | undefined
      saveContent: (content: T) => Promise<void> | Promise<{ success: boolean }>
      deleteContent: (content: T) => Promise<void> | Promise<{ success: boolean }>
    } {
  const key = getKeyFromSource(_key)

  const type = key.split('.')[0]
  if (type !== 'category' && type !== 'brush' && type !== 'requestOptions') {
    void vscode.window.showErrorMessage(
      'Invalid key. Key must be in the format of `category.<name>`, `brush.<category>.<name>` or `requestOptions`'
    )
    return {
      allContents: undefined,
      content: undefined,
      saveContent: undefined,
      deleteContent: undefined,
    }
  }

  let allContents: T[] | undefined
  let content: T | undefined = undefined

  let saveContent: (content: T) => Promise<void> | Promise<{ success: boolean }>
  let deleteContent: (content: T) => Promise<void> | Promise<{ success: boolean }>

  switch (type) {
    case 'category': {
      allContents = getCategories(storage) as T[]
      const category = (allContents as ConfigBrushCategory[]).find(
        (c) => c.name === key.split('.')[1]
      )
      content = (category as T | undefined) ?? (typeof _key !== 'string' ? _key.source : undefined)

      saveContent = async (_category) =>
        await saveCategory(_category as ConfigBrushCategory, storage)
      deleteContent = async (_category) =>
        await deleteCategory((_category as ConfigBrushCategory).name, storage)

      break
    }
    case 'brush': {
      const category = key.split('.')[1]
      const name = key.split('.')[2]
      const brush = getBrushes(storage).find((b) => b.category === category && b.name === name)
      allContents = getBrushes(storage) as T[]
      saveContent = async (brush) => {
        return await saveBrush(brush as ConfigBrush, storage, allContents as ConfigBrush[])
      }
      deleteContent = async (brush) => {
        if (hasField<string | undefined>(brush, 'name', 'string')) {
          outputChannel.appendLine(`Deleting brush ${brush.name ?? ''}...`)
        }
        return await deleteBrush(brush as ConfigBrush, storage, allContents as ConfigBrush[])
      }
      content = (brush as T | undefined) ?? (typeof _key !== 'string' ? _key.source : undefined)
      break
    }
    case 'requestOptions': {
      content = getRequestOptions(storage) as T
      saveContent = async (requestOptions) => {
        return await saveRequestOptions(requestOptions as ConfigRequestOptions, storage)
      }

      deleteContent = async () => await saveRequestOptions(undefined, storage)

      break
    }
    default:
      return {
        allContents: undefined,
        content: undefined,
        saveContent: undefined,
        deleteContent: undefined,
      }
  }

  return { allContents, content, saveContent, deleteContent }
}

const editorState: {
  save?: () => Promise<void>
  doc?: unknown
} = { save: undefined, doc: undefined }

// I want to use this later so that JSON5 looks better for default configs but obviously not prioritized
// Another option would be to save default formatted configs also instead of just stringifying.
/*const wordWrap = (s: string, w: number, sourceNewLine: string, outNewLine: string) =>
  s
    .replace(
      new RegExp(
        `(?![^${'\\' + sourceNewLine}]{1,${w}}$)([^${'\\' + sourceNewLine}]{1,${w}})\\s`,
        'g'
      ),
      '$1' + outNewLine
    )
    .replace(new RegExp(`\\${outNewLine}\\s`, 'g'), outNewLine)*/

export function getFormatter() {
  const useJSON5 = vscode.workspace.getConfiguration('gptbrushes').get<boolean>('useJSON5', false)

  outputChannel.appendLine(`Using ${useJSON5 ? 'JSON5' : 'YAML'} formatter`)

  const _stringify: (val: AnyConfigOpt, r: null, s: 2) => string = useJSON5
    ? JSON5.stringify
    : YAML.stringify

  const stringify = (val: AnyConfigOpt) => _stringify(val, null, 2)

  const parse: <T>(v: string) => T = useJSON5 ? JSON5.parse : YAML.parse
  const otherParser: <T>(v: string) => T = useJSON5 ? YAML.parse : JSON5.parse

  const tryParse = (
    content: string | undefined
  ): { parsed: AnyConfigOpt; text: string | 'null' } => {
    let parsed: AnyConfigOpt
    try {
      parsed = parse(content ?? '')
    } catch (e) {
      try {
        parsed = otherParser(content ?? '')
        content = stringify(parsed)
      } catch (z) {
        throw e
      }
    }
    return { parsed: parsed, text: content ?? 'null' }
  }

  return { tryParse, stringify, parse, otherParser, formatter: useJSON5 ? 'json5' : 'yaml' }
}

export async function saveFormattedConfig(
  storage: StorageService,
  _key: string | { source: AnyConfigOpt },
  value: string
) {
  const key = getKeyFromSource(_key)

  await storage.setValue(key + '.formatted', value)
}

export async function deleteFormattedConfig(
  storage: StorageService,
  _key: string | { source: AnyConfigOpt }
) {
  const key = getKeyFromSource(_key)

  await storage.setValue(key + '.formatted', undefined)
}

export function loadFormattedConfig(
  storage: StorageService,
  _key: string | { source: AnyConfigOpt }
): string | undefined {
  const key = getKeyFromSource(_key)
  return storage.getValue<string>(key + '.formatted')
}

export function deleteAllConfig(storage: StorageService) {
  void storage.setValue('gptbrushes.config.brushes', undefined)
  void storage.setValue('gptbrushes.config.categories', undefined)
  void storage.setValue('gptbrushes.config.requestOptions', undefined)
}

export function activateConfig(
  context: vscode.ExtensionContext,
  storage: StorageService,
  brushes?: ConfigBrush[],
  categories?: ConfigBrushCategory[]
): BrushTreeDataProvider {
  const brushTreeDataProvider = new BrushTreeDataProvider(storage, brushes, categories)

  //deleteAllConfig(storage)

  const editConfigCommand = vscode.commands.registerCommand(
    'gptbrushes.config.edit',
    (key: { source: AnyConfigOpt }) => {
      const formatter = getFormatter()

      const temporaryFilePath = path.join(__dirname, `.gptbrushtemp.${formatter.formatter}`)

      const config = getConfigFromKey<AnyConfigOpt>(key, storage)

      let content = config.content

      let stringContent: string
      const savedStringContent = loadFormattedConfig(storage, { source: content })

      // If the values in our formatted config are the same as the current config
      // then we can use the formatted config as the current config

      try {
        const _formatted = formatter.tryParse(savedStringContent)
        stringContent = _formatted.text !== 'null' ? _formatted.text : formatter.stringify(content)
        content = _formatted.parsed ?? content // not sure about this line, maybe don't have to change content?
        void saveFormattedConfig(storage, key, stringContent)
      } catch (e) {
        void vscode.window.showErrorMessage(
          `Error while trying to stringify or load stringified config: ${JSON.stringify(
            e,
            null,
            2
          )}`
        )
        outputChannel.appendLine(`Error: ${JSON.stringify(e, null, 2)}`)
        return
      }

      let originalName: string | undefined

      if (hasField<string>(content, 'name', 'string')) {
        originalName = content.name
      }

      if (hasField(content, 'max_tokens', 'number')) {
        if (content.max_tokens === Infinity) {
          content.max_tokens = -1
        } else if (String(content.max_tokens) === 'Infinity') {
          content.max_tokens = -1
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!content || !config.saveContent) {
        void vscode.window.showErrorMessage(
          `Invalid config key for the gptbrushes.config.edit command: ${getIdFromItemSource(
            key.source as BrushTreeItemSource
          )}`
        )
        return
      }

      try {
        fs.writeFileSync(temporaryFilePath, stringContent)
      } catch (e) {
        void vscode.window.showErrorMessage(
          `Error when stringifying config: ${JSON.stringify(e, null, 2)}`
        )
        return
      }
      const openPath = vscode.Uri.file(temporaryFilePath)

      void vscode.workspace.openTextDocument(openPath).then((doc) => {
        editorState.doc = doc

        void vscode.window.showTextDocument(doc).then(() => {
          return
        })

        editorState.save = async function () {
          const newContentString = doc.getText()

          let newContent: AnyConfigOpt

          outputChannel.appendLine(`newContentString: ${newContentString}`)

          try {
            const formatted = formatter.tryParse(newContentString)
            newContent = formatted.parsed
          } catch (e) {
            void vscode.window.showErrorMessage(
              `Error when parsing config: ${JSON.stringify(e, null, 2)}`
            )
            return
          }

          await saveFormattedConfig(storage, { source: newContent }, newContentString)
          await config.saveContent(newContent)

          if (
            originalName &&
            hasField(newContent, 'name', 'string') &&
            originalName !== newContent.name
          ) {
            await config.deleteContent(content)
            await deleteFormattedConfig(storage, { source: content })
            //brushTreeDataProvider.refresh()
            outputChannel.appendLine(
              'Deleting:' +
                originalName +
                ' (now: ' +
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                ((newContent as any).name as string)
            )
          } else {
            outputChannel.appendLine(
              'Not deleting:' +
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                ((content as any).name as string) +
                ' (now: ' +
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                ((newContent as any).name as string) +
                ') because of hasField name on newContent?: ' +
                String(hasField(newContent, 'name', 'string'))
            )
          }

          await doc.save()
          setTimeout(() => {
            outputChannel.appendLine(
              `Should have closed editor by now.

              Old editor state:
              ${JSON.stringify(editorState, null, 2)})

              Old config:
              ${JSON.stringify(content, null, 2)})

              New:
              ${JSON.stringify(newContent, null, 2)})`
            )
            void vscode.commands.executeCommand('workbench.action.closeActiveEditor')
            fs.unlink(temporaryFilePath, (err) => {
              if (err) outputChannel.appendLine(`Error: ${JSON.stringify(err, null, 2)}`)
            })
            brushTreeDataProvider.refresh()
          }, 200)
        }
      })
    }
  )

  vscode.workspace.onWillSaveTextDocument((save_event) => {
    if (
      save_event.document == editorState.doc &&
      save_event.reason == vscode.TextDocumentSaveReason.Manual
    ) {
      if (typeof editorState.save === 'function') {
        outputChannel.appendLine(`Should save config: ${JSON.stringify(editorState)})`)
        void editorState.save()
      }
    }
  })
  // push to subscriptions list so that they are disposed automatically
  context.subscriptions.push(editConfigCommand)

  const _editCommand = (key: string | { source: BrushTreeItemSource }) => {
    void vscode.commands.executeCommand('gptbrushes.config.edit', key)
  }

  const deleteCategoryCommand = vscode.commands.registerCommand(
    'gptbrushes.deleteCategory',
    (key: string) => {
      const { content } = getConfigFromKey<ConfigBrushCategory>(key, storage)
      if (!content) {
        void vscode.window.showErrorMessage('Category not found')
        return
      }
      void deleteCategory(content.name, storage).then(() => {
        brushTreeDataProvider.refresh()
      })
    }
  )
  context.subscriptions.push(deleteCategoryCommand)

  const addCategoryCommand = vscode.commands.registerCommand('gptbrushes.addCategory', _editCommand)
  context.subscriptions.push(addCategoryCommand)

  const editCategoryCommand = vscode.commands.registerCommand(
    'gptbrushes.editCategory',
    _editCommand
  )
  context.subscriptions.push(editCategoryCommand)

  const editBrushCommand = vscode.commands.registerCommand('gptbrushes.editBrush', _editCommand)
  context.subscriptions.push(editBrushCommand)

  const addBrushCommand = vscode.commands.registerCommand(
    'gptbrushes.addBrush',
    (parentCategory: { source: BrushTreeItemSource }) => {
      outputChannel.appendLine(
        `Adding brush to category: ${JSON.stringify(parentCategory, null, 2)}`
      )
      const newBrush = defaults.brushTemplate
      newBrush.category = parentCategory.source.name
      newBrush.contextValue = 'brush'
      void vscode.commands.executeCommand('gptbrushes.config.edit', {
        source: newBrush,
      })
    }
  )
  context.subscriptions.push(addBrushCommand)

  const deleteBrushCommand = vscode.commands.registerCommand(
    'gptbrushes.deleteBrush',
    (key: string) => {
      const { content } = getConfigFromKey<ConfigBrush>(key, storage)
      if (!content) {
        void vscode.window.showErrorMessage('Brush not found')
        return
      }
      outputChannel.appendLine(`Deleting brush: ${JSON.stringify(content, null, 2)}`)
      void deleteBrush(content, storage).then(() => {
        brushTreeDataProvider.refresh()
      })
    }
  )
  context.subscriptions.push(deleteBrushCommand)

  return brushTreeDataProvider
}
