import * as path from 'path'
import * as sanitize from 'sanitize-filename'

export default abstract class GoogleDriveItem {
  uniqueNameIndex: number
  protected service: any
  protected parent: GoogleDriveItem
  protected driveItem: any

  constructor (service: any, parent: GoogleDriveItem, driveItem: any) {
    this.service = service
    this.parent = parent
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
    if (!this.parent) {
      return this.name
    }
    return path.join(this.parent.path, this.name)
  }

  get parentPath (): string {
    if (!this.parent) {
      return ''
    }

    return this.parent.path
  }

  get mimeType (): string {
    return this.driveItem.mimeType
  }
}
