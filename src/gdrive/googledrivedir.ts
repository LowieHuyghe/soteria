import GoogleDriveItem from './googledriveitem'

export default class GoogleDriveDir extends GoogleDriveItem {
  protected static dirMimeType = 'application/vnd.google-apps.folder'

  static isDir (driveItem: any): boolean {
    return driveItem.mimeType === this.dirMimeType
  }
}
