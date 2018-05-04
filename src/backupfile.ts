import * as fs from 'fs'
import * as mkdirp from 'mkdirp'
import GoogleDriveService from './googledriveservice'

export default class BackupFile {
  public driveFileId: string
  public driveFileMd5: string | undefined
  public driveFileLink: string
  public driveFileSize: number
  public driveFileModifiedTime: number | undefined
  public exportMimeType: string | undefined
  public driveDirPath: string
  public driveFilePath: string
  public driveFileName: string
  public outputDirPath: string
  public outputFilePath: string

  constructor (driveFileId: string,
               driveFileMd5: string | undefined,
               driveFileLink: string,
               driveFileSize: number,
               driveFileModifiedTime: number | undefined,
               exportMimeType: string | undefined,
               driveDirPath: string,
               driveFilePath: string,
               driveFileName: string,
               outputDirPath: string,
               outputFilePath: string) {
    this.driveFileId = driveFileId
    this.driveFileMd5 = driveFileMd5
    this.driveFileLink = driveFileLink
    this.driveFileSize = driveFileSize
    this.driveFileModifiedTime = driveFileModifiedTime
    this.exportMimeType = exportMimeType
    this.driveDirPath = driveDirPath
    this.driveFilePath = driveFilePath
    this.driveFileName = driveFileName
    this.outputDirPath = outputDirPath
    this.outputFilePath = outputFilePath
  }

  getExists (): boolean {
    return fs.existsSync(this.outputFilePath)
  }

  async save (service: GoogleDriveService, progressCallback: (progress: number, done: boolean) => void): Promise<void> {
    // Make directory structure
    if (!fs.existsSync(this.outputDirPath)) {
      mkdirp.sync(this.outputDirPath)
    }

    progressCallback(0, false)

    return new Promise<void>((resolve, reject) => {
      const responseCallback = (err: Error | undefined, response: any) => {
        if (err) {
          reject(err)
          return
        }

        // Write stream
        const writeStream = fs.createWriteStream(this.outputFilePath)

        let bytesProgress = 0
        response.data
          .on('data', (data: any) => {
            if (!this.exportMimeType && this.driveFileSize) {
              bytesProgress += data.length
              progressCallback(bytesProgress / this.driveFileSize, false)
            }
          })
          .on('end', () => {
            progressCallback(1, true)
            resolve()
          })
          .on('error', (err: Error) => {
            reject(err)
          })
          .pipe(writeStream)
      }

      // Request
      if (!this.exportMimeType) {
        service.drive.files.get(
          { fileId: this.driveFileId, alt: 'media' },
          { responseType: 'stream' },
          responseCallback
        )
      } else {
        service.drive.files.export(
          { fileId: this.driveFileId, mimeType: this.exportMimeType },
          { responseType: 'stream' },
          responseCallback
        )
      }
    })
  }
}
