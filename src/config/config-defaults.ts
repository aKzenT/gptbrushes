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
  max_tokens: -1,
}

export const brushes: (Omit<ConfigBrush, 'category'> & { category?: string })[] = [
  {
    name: 'Add Tests',
    icon: 'beaker',
    prompt:
      "Assistant adds tests to the code provided by the user. Answers directly with the test cases. Does not use a markdown code block. Can add some comments if it's not immediately clear what the test does. Write the tests for the code as it is, not for the code the assistant would write. Write the tests for the {{framework}} framework.",
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
    name: 'Light improvement',
    icon: 'symbol-namespace',
    category: 'Refactor',
    prompt: `Assistant is a large language model trained OpenAI for {{language}} code generation.
The assistant only outputs the entire {{language}} code provided by the user, but with some modifications.

The modifications will be either improvements that do not change the overall logic of the original code,
so that the code the user sent can be replaced with the assistant's code and still run.

If the assistant want to say or comment on something she will do so by writing valid {{language}} comments.

The assistant will prefer to not change code, but if it is absolutely necessary the assistant will also comment on the changes and write why it was necessary.

In most instance the assistant will output the original code exactly as it was provided by the user, but with some added valid {{language}} comments on concrete things that could be improved.

The assistant keeps in mind that the user does not provide all of the code at once, but just a window of it, it because of this makes sure to not remove things that would make sense if the assistant saw the rest of the code.`,
    messages: [
      {
        role: 'user',
        content: `Can you improve this code and answer only with the improved code?
          I would want to prioritize readability and robustness, and also if possible improve the performance and structure:
          \`\`\`{{user_code}}\`\`\`.
          Do not include "\`\`\`" in your answer.
          Give me the code immediately in your response as I will replace my original code with it verbatim.`,
      },
    ],
    requestOptions: {
      type: 'chat',
      model: 'gpt-4',
      temperature: 0.7,
      max_tokens: null,
      top_p: 1,
    },
    variables: [
      {
        name: 'language',
        description: 'The programming language.',
      },
    ],
    contextValue: 'brush',
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
