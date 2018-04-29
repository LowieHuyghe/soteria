import GoogleDriveItem from './googledriveitem'

export default class GoogleDriveDir extends GoogleDriveItem {
  protected static dirMimeType = 'application/vnd.google-apps.folder'

  constructor (service: any, parent: GoogleDriveDir, driveItem: any) {
    super(service, parent, driveItem)
  }

  static isDir (driveItem: any): boolean {
    return driveItem.mimeType === this.dirMimeType
  }
}
