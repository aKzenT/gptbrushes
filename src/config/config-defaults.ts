import { ConfigBrush, ConfigBrushCategory, ConfigRequestOptions } from './config'

export const categories: ConfigBrushCategory[] = [
  {
    name: 'Explain',
    icon: 'book',
    contextValue: 'category',
  },
  {
    name: 'Solve',
    icon: 'bug',
    contextValue: 'category',
  },
  {
    name: 'Conventions and style',
    icon: 'paintcan',
    contextValue: 'category',
  },
  {
    name: 'Refactor',
    icon: 'symbol-namespace',
    contextValue: 'category',
  },
]

export const brushTemplate: ConfigBrush = {
  name: 'New brush',
  icon: 'symbol-namespace',
  category: 'Uncategorized',
  prompt: '{{prompt}}',
  messages: [
    { role: 'user', content: 'Please describe the brush.' },
    { role: 'assistant', content: 'The brush is very basic.' },
    { role: 'user', content: '{{user_code}}' },
  ],
  variables: [
    {
      name: 'prompt',
      description: 'Please write the system prompt.',
    },
  ],
}

export const requestOptions: ConfigRequestOptions = {
  type: 'chat',
  model: 'gpt-4',
  temperature: 0.7,
  max_tokens: Infinity,
}

export const brushes: (Omit<ConfigBrush, 'category'> & { category?: string })[] = [
  {
    name: 'Add Tests',
    icon: 'beaker',
    prompt:
      "Please add tests to the code provided by the user. Answer directly with the test cases. Do not use a markdown code block. You can add some comments if it's not immediately clear what the test does. Write the tests for the code as it is, not for the code you would write. Write the tests for the {{framework}} framework.",
    variables: [
      {
        name: 'framework',
        description: 'Which framework should the tests be written for?',
      },
    ],
  },
  {
    name: 'Add Documentation',
    category: 'Explain',
    icon: 'book',
    prompt: 'Please add documentation to the code.',
  },
  {
    name: 'Explain with comments',
    category: 'Explain',
    icon: 'comment',
    prompt: 'Please add code comments to the code.',
  },
  {
    name: 'Fix Bugs',
    category: 'Solve',
    icon: 'bug',
    prompt:
      'Identify and fix bugs in the code provided by the user. Answer directly with the fixed code. Do not use a markdown code block. You can add a code comment to explain the fix.',
  },
  {
    name: 'Add Types',
    category: 'Conventions and style',
    icon: 'symbol-namespace',
    prompt: 'Please add type annotations to the code provided by the user.',
  },
  {
    name: 'Translate to German',
    icon: 'case-sensitive',
    category: 'Conventions and style',
    prompt: 'Translate the user text to German.',
  },
  {
    name: 'Translate to English',
    icon: 'case-sensitive',
    category: 'Conventions and style',
    prompt: 'Translate the user text to English.',
  },
  {
    name: 'Refactor Code',
    icon: 'symbol-namespace',
    category: 'Refactor',
    prompt: 'Improve the user code by refactoring it.',
  },
  {
    name: 'Custom Brush',
    icon: 'paintcan',
    category: 'Uncategorized',
    prompt: '{{prompt}}',
    variables: [
      {
        name: 'prompt',
        description: 'Please describe the brush.',
      },
    ],
  },
]
