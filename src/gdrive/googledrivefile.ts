import GoogleDriveItem from './googledriveitem'
import GoogleDriveDir from './googledrivedir'
import * as path from 'path'
import * as fs from 'fs'
import * as md5File from 'md5-file'
import GoogleBackupFile from './googlebackupfile'
import GoogleBackupHtmlFile from './googlebackuphtmlfile'

export default class GoogleDriveFile extends GoogleDriveItem {
  protected static supportedMimeTypes: { [s: string]: string[]; } = {
    'application/vnd.google-apps.document': [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.oasis.opendocument.text',
      // 'application/rtf',  # Gives internal error on Google Drive API
      'application/zip',
      'text/plain'
    ],
    'application/vnd.google-apps.spreadsheet': [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/x-vnd.oasis.opendocument.spreadsheet',
      'application/zip',
      'text/csv'
    ],
    'application/vnd.google-apps.presentation': [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.presentation',
      'text/plain'
    ],
    'application/vnd.google-apps.drawing': [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/svg+xml'
    ],
    'application/vnd.google-apps.script': [
      'application/vnd.google-apps.script+json'
    ]
  }

  protected static mimeTypeExtensions: { [s: string]: string; } = {
    'application/vnd.google-apps.document': '.gdoc',
    'application/vnd.google-apps.spreadsheet': '.gsheet',
    'application/vnd.google-apps.presentation': '.gdoc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'application/vnd.oasis.opendocument.text': '.odt',
    'application/x-vnd.oasis.opendocument.spreadsheet': '.ods',
    'application/vnd.oasis.opendocument.presentation': '.odp',
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/svg+xml': '.svg',
    'application/rtf': '.rtf',
    'text/plain': '.txt',
    'text/csv': '.csv',
    'application/zip': '.zip',
    'application/vnd.google-apps.script+json': '.json'
  }

  protected static unsupportedMimeTypes: string[] = [
    'application/vnd.google-apps.form',
    'application/vnd.google-apps.map',
    'application/vnd.google-apps.site'
  ]

  get md5 (): string {
    return this.driveItem.md5Checksum
  }

  get link (): string {
    return this.driveItem.webViewLink
  }

  get size (): number {
    return this.driveItem.size
  }

  get modifiedTime (): number | undefined {
    if (!this.driveItem.modifiedTime) {
      return undefined
    }
    return new Date(this.driveItem.modifiedTime).getTime()
  }

  protected get htmlName (): string {
    return `${this.name}.html`
  }

  protected get htmlPath (): string {
    return path.join(this.parentPath, this.htmlName)
  }

  get isSupported (): boolean {
    return !GoogleDriveFile.unsupportedMimeTypes.includes(this.mimeType)
  }

  get isGoogleFile (): boolean {
    return this.mimeType in GoogleDriveFile.supportedMimeTypes
  }

  static fromJson (jsonString: string): GoogleDriveFile {
    const json = JSON.parse(jsonString)

    const instance = new GoogleDriveFile(undefined, json.driveItem)
    instance.parentPath = json.parentPath
    instance.uniqueNameIndex = json.uniqueNameIndex

    return instance
  }

  protected static getExportBakFile (path: string, extension: string): string {
    return `${path}.bak${extension}`
  }

  toJson (): string {
    return JSON.stringify(this)
  }

  getNeedsToBackup (outputDir: string): boolean {
    if (!this.isSupported) {
      return false
    }

    const outputPath = path.join(outputDir, this.path)

    if (!this.isGoogleFile) {
      if (!this.md5) {
        return true
      }

      if (!fs.existsSync(outputPath)) {
        return true
      }
      const outputPathMd5: string = md5File.sync(outputPath)
      return this.md5 !== outputPathMd5
    }

    if (!this.modifiedTime) {
      return true
    }

    const outputHtmlPath = path.join(outputDir, this.htmlPath)
    if (!fs.existsSync(outputHtmlPath)) {
      return true
    }

    for (const mimeExportType of GoogleDriveFile.supportedMimeTypes[this.mimeType]) {
      const mimeExportTypeExtension = GoogleDriveFile.mimeTypeExtensions[mimeExportType]
      const mimeExportBakPath = GoogleDriveFile.getExportBakFile(outputPath, mimeExportTypeExtension)
      if (!fs.existsSync(mimeExportBakPath)) {
        return true
      }
    }

    const outputHtmlContent = fs.readFileSync(outputHtmlPath, 'utf8')
    const pattern = new RegExp(`modifiedTime\\s*[:=]\\s*${this.modifiedTime}`)
    return !pattern.test(outputHtmlContent)
  }

  getFilesToBackup (outputDir: string): GoogleBackupFile[] {
    if (!this.isSupported) {
      return []
    }

    const outputPath = path.join(outputDir, this.path)
    const outputHtmlPath = path.join(outputDir, this.htmlPath)
    const outputParentPath = path.join(outputDir, this.parentPath)
    const filesToBackup: GoogleBackupFile[] = []

    if (!this.isGoogleFile) {
      filesToBackup.push(new GoogleBackupFile(
        this.id,
        this.md5,
        this.link,
        this.size,
        this.modifiedTime,
        undefined,
        this.parentPath,
        this.path,
        this.name,
        outputParentPath,
        outputPath
      ))
    } else {
      for (const mimeExportType of GoogleDriveFile.supportedMimeTypes[this.mimeType]) {
        const mimeExportTypeExtension = GoogleDriveFile.mimeTypeExtensions[mimeExportType]

        filesToBackup.push(new GoogleBackupFile(
          this.id,
          this.md5,
          this.link,
          this.size,
          this.modifiedTime,
          mimeExportType,
          this.parentPath,
          GoogleDriveFile.getExportBakFile(this.path, mimeExportTypeExtension),
          GoogleDriveFile.getExportBakFile(this.name, mimeExportTypeExtension),
          outputParentPath,
          GoogleDriveFile.getExportBakFile(outputPath, mimeExportTypeExtension)
        ))
      }

      // Html file last so the modifiedTIme is only updated after they are all done
      filesToBackup.push(new GoogleBackupHtmlFile(
        this.id,
        this.md5,
        this.link,
        this.size,
        this.modifiedTime,
        undefined,
        this.parentPath,
        this.htmlPath,
        this.htmlName,
        outputParentPath,
        outputHtmlPath
      ))

      return filesToBackup
    }

    return filesToBackup
  }
}
