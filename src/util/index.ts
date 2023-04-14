import { outputChannel } from './channel'

export type AllTypes =
  | string
  | number
  | boolean
  | object
  | unknown[]
  | null
  | undefined
  | ((...args: unknown[]) => unknown)
  | bigint
  | symbol

export type AllTypesStr =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null'
  | 'undefined'
  | 'function'
  | 'bigint'
  | 'symbol'

export type MapStrTypeToType<T> = 'string' extends T
  ? string
  : 'number' extends T
  ? number
  : 'boolean' extends T
  ? boolean
  : 'object' extends T
  ? object
  : 'array' extends T
  ? unknown[]
  : 'null' extends T
  ? null
  : 'undefined' extends T
  ? undefined
  : 'function' extends T
  ? (...args: unknown[]) => unknown
  : 'bigint' extends T
  ? bigint
  : 'symbol' extends T
  ? symbol
  : never

export const hasField = <V>(
  t: unknown,
  k: Readonly<string | symbol>,
  v: Readonly<AllTypesStr> | ((v: unknown) => v is V)
): t is {
  [key in typeof k]: Readonly<AllTypesStr> extends typeof v ? MapStrTypeToType<typeof v> : V
} => {
  if (!!t && typeof t === 'object' && k in t) {
    const _t = t as Record<typeof k, MapStrTypeToType<typeof v>>
    if ((typeof v === 'string' && typeof _t[k] == v) || (typeof v === 'function' && v(_t[k]))) {
      return true
    }
  }
  return false
}

// https://stackoverflow.com/a/6969486
export const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // $& means the whole matched string
}
