import GoogleDriveService from '../googledriveservice'
import * as fs from 'fs'
import GoogleDriveFile from '../googledrivefile'
import SimpleLineReader from '../simplelinereader'
import Downloader from '../downloader'
import { isUndefined } from 'util'
import BackupFile from '../backupfile'

export default class GDriveBackup {
  private service: GoogleDriveService
  private cachePath: string
  private workerCount: number

  constructor (service: GoogleDriveService, cachePath: string, workerCount: number) {
    this.service = service
    this.cachePath = cachePath
    this.workerCount = workerCount
  }

  static async create (clientSecretPath: string, credentialsPath: string, cachePath: string, workerCount: number): Promise<GDriveBackup> {
    const service = await GoogleDriveService.create(clientSecretPath, credentialsPath)
    return new GDriveBackup(service, cachePath, workerCount)
  }

  async sync (progressCallback: (file: GoogleDriveFile, totalFiles: number) => void): Promise<number> {
    let cacheFile: fs.WriteStream
    try {
      cacheFile = fs.createWriteStream(this.cachePath, { encoding: 'utf8' })

      let totalFiles: number = 0

      for await (const file of this.service.walk()) {
        cacheFile.write(`${file.toJson()}\n`)
        ++totalFiles
        progressCallback(file, totalFiles)
      }

      return totalFiles
    } finally {
      if (cacheFile) {
        cacheFile.close()
      }
    }
  }

  async download (
    outputDir: string,
    skipCallback: (file: GoogleDriveFile, processedFiles: number, totalFiles: number, workerIndex: number, workerCount: number) => void,
    progressCallback: (file: GoogleDriveFile, fileToBackup: BackupFile, progress: number, processedFiles: number, totalFiles: number, workerIndex: number, workerCount: number) => void,
    errorCallback: (file: GoogleDriveFile, fileToBackup: BackupFile, error: Error, processedFiles: number, totalFiles: number, workerIndex: number, workerCount: number) => void
  ) {
    const totalFiles: number = await SimpleLineReader.lineCount(this.cachePath)
    let processedFiles: number = 0

    const reader = await SimpleLineReader.open(this.cachePath)

    const downloader = new Downloader(async (workerIndex: number): Promise<boolean> => {
      const line = await reader.nextLine()
      if (isUndefined(line)) {
        return false
      }
      const jsonString = line.trim()
      if (!jsonString) {
        return true
      }

      ++processedFiles

      const driveFile: GoogleDriveFile = GoogleDriveFile.fromJson(jsonString)

      if (!driveFile.getNeedsToBackup(outputDir)) {
        // Skip
        skipCallback(driveFile, processedFiles, totalFiles, workerIndex, this.workerCount)
      } else {
        const filesToBackup = driveFile.getFilesToBackup(outputDir)
        for (const fileToBackup of filesToBackup) {
          try {
            // Download
            await fileToBackup.save(this.service, (progress: number, done: boolean) => {
              progressCallback(driveFile, fileToBackup, progress, processedFiles, totalFiles, workerIndex, this.workerCount)
            })
          } catch (err) {
            // Error
            errorCallback(driveFile, fileToBackup, err, processedFiles, totalFiles, workerIndex, this.workerCount)
          }
        }
      }

      return true
    }, this.workerCount)

    await downloader.start()

    return totalFiles
  }
}
