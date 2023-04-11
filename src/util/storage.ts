import { Memento } from 'vscode'

export class StorageService {
  constructor(public storage: Memento) {}

  public getValue<T>(key: string): T | undefined {
    return this.storage.get<T | undefined>(key, undefined)
  }

  /**
   * Attempts to get the value from storage, if it doesn't exist, it will set the value to the default value and return it.
   * @param key
   * @param defaultValue
   * @returns the value from storage or the default value if it doesn't exist.
   */
  public async getOrSetValue<T>(key: string, defaultValue: T): Promise<T> {
    const stored = this.getValue<T>(key)
    if (stored === null) {
      await this.storage.update(key, defaultValue)
      return defaultValue
    } else if (stored !== defaultValue) {
      await this.storage.update(key, defaultValue)
    }
    return defaultValue
  }

  public setValue<T>(key: string, value: T) {
    return this.storage.update(key, value)
  }
}
