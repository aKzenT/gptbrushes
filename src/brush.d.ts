interface Brush {
  type: string;
  name: string;
  icon: string;
  prompt: string;
  variables?: Variable[];
}

interface Variable {
  name: string;
  description: string;
  defaultValue?: string;
}
