import * as fs from 'fs'
import * as mkdirp from 'mkdirp'
import GoogleDriveService from './googledriveservice'

export default class BackupFile {
  protected service: GoogleDriveService
  protected driveFileId: string
  protected driveFileMd5: string
  protected driveFileLink: string
  protected driveFileSize: number
  protected exportMimeType: string | undefined
  protected driveDirPath: string
  protected driveFilePath: string
  protected driveFileName: string
  protected outputDirPath: string
  protected outputFilePath: string

  constructor (service: GoogleDriveService,
               driveFileId: string,
               driveFileMd5: string,
               driveFileLink: string,
               driveFileSize: number,
               exportMimeType: string | undefined,
               driveDirPath: string,
               driveFilePath: string,
               driveFileName: string,
               outputDirPath: string,
               outputFilePath: string) {
    this.service = service
    this.driveFileId = driveFileId
    this.driveFileMd5 = driveFileMd5
    this.driveFileLink = driveFileLink
    this.driveFileSize = driveFileSize
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

  async save (progressCallback: (progress: number, done: boolean) => void): Promise<void> {
    // Make directory structure
    if (!fs.existsSync(this.outputDirPath)) {
      mkdirp.sync(this.outputDirPath)
    }

    // Write stream
    const writeStream = fs.createWriteStream(this.outputFilePath)
    // Request
    let request: any
    if (!this.exportMimeType) {
      request = this.service.drive.files.get({
        fileId: this.driveFileId
      }, {
        responseType: 'stream'
      })
    } else {
      request = this.service.drive.files.export({
        fileId: this.driveFileId,
        mimeType: this.exportMimeType
      }, {
        responseType: 'stream'
      })
    }

    progressCallback(0, false)

    return new Promise<void>((resolve, reject) => {
      let bytesProgress = 0
      request.data
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
    })
  }
}
