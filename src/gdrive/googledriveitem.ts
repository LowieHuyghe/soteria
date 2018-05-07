import * as path from 'path'
import * as sanitize from 'sanitize-filename'

export default abstract class GoogleDriveItem {
  uniqueNameIndex: number
  protected parentPath: string | undefined
  protected driveItem: any

  constructor (parent: GoogleDriveItem, driveItem: any) {
    this.parentPath = parent ? parent.path : ''
    this.driveItem = driveItem
    this.uniqueNameIndex = 0
  }

  get id (): string {
    return this.driveItem.id
  }

  get name (): string {
    let name = this.driveItem.name
    if (this.uniqueNameIndex > 0) {
      name = `${name}, (${this.uniqueNameIndex})`
    }

    return sanitize(name)
  }

  get path (): string {
    return path.join(this.parentPath, this.name)
  }

  get mimeType (): string {
    return this.driveItem.mimeType
  }
}
