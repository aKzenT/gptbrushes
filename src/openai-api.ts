import vscode from 'vscode'

import axios from 'axios'
import {
  ChatCompletionRequestMessage,
  Configuration,
  OpenAIApi,
  CreateChatCompletionRequest,
} from 'openai'

import { ConfigRequestOptions } from './config/config'

import { outputChannel } from './util/channel'

export async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  const apiKey = await context.secrets.get('openaiApiKey')
  return apiKey || updateApiKey(context)
}

async function updateApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  const input = await vscode.window.showInputBox({
    prompt: 'Please enter your new OpenAI API key:',
    ignoreFocusOut: true,
    password: true,
  })

  if (input) {
    await context.secrets.store('openaiApiKey', input)
    await vscode.window.showInformationMessage('OpenAI API key has been updated.')
    return input
  } else {
    await vscode.window.showInformationMessage(
      'No API key entered. The OpenAI API key has not been updated.'
    )
  }

  return undefined
}

export function activateApiKey(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('gptbrushes.updateApiKey', async () => {
      await updateApiKey(context)
    })
  )
}

/**
 *
 * @param systemPrompt - Sets the behavior of the assistant
 * @param assistantPrompt - Provides examples of how the assistant should behave
 * @param userPrompt - Sets instructions for the assistant to follow
 * @param apiKey
 * @param cancelToken
 * @returns
 */
export async function requestCompletion(
  prompts: { role: 'system' | 'assistant' | 'user'; content: string }[],
  apiKey: string,
  cancelToken: vscode.CancellationToken,
  options?: Partial<ConfigRequestOptions>
) {
  // Create an Axios cancellation token
  // eslint-disable-next-line import/no-named-as-default-member
  const axiosCancelTokenSource = axios.CancelToken.source()

  // Map the VSCode cancellation token to cancel the Axios request
  cancelToken.onCancellationRequested(() => {
    axiosCancelTokenSource.cancel('Request cancelled by the user.')
  })

  // TODO Type should be able to be at least 'completion' | 'chat'
  // but now it's just 'chat' so we can ignore this.
  if (options?.type) {
    options.type = undefined
  }

  const configuration = new Configuration({
    apiKey: apiKey,
  })
  const openai = new OpenAIApi(configuration)

  outputChannel.appendLine(`OpenAI request: ${JSON.stringify({ ...options, prompts })}`)

  let completion

  try {
    completion = await openai.createChatCompletion(
      {
        ...options,
        messages: prompts as ChatCompletionRequestMessage[],
      } as CreateChatCompletionRequest,
      { cancelToken: axiosCancelTokenSource.token }
    )
  } catch (e: unknown) {
    outputChannel.appendLine(
      `OpenAI error: ${JSON.stringify(e)} - ${JSON.stringify({ prompts: prompts, completion })}`
    )
    await vscode.window.showErrorMessage(`Could not make completion: ${JSON.stringify(e)}`)
  }
  if (!completion) {
    return
  }

  if (cancelToken.isCancellationRequested) {
    return Promise.reject(new Error('Request cancelled'))
  }

  const lastUserMessage = prompts
    .slice()
    .reverse()
    .find((p) => p.role === 'user')

  return completion.data.choices[0].message?.content ?? lastUserMessage?.content
}
