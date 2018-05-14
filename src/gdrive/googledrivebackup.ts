import GoogleDriveService from './googledriveservice'
import * as fs from 'fs'
import GoogleDriveFile from './googledrivefile'
import SimpleLineReader from '../simplelinereader'
import Downloader from '../downloader'
import { isUndefined } from 'util'
import GoogleBackupFile from './googlebackupfile'
import GoogleDriveDir from './googledrivedir'
import GoogleBackupGitRepoFile from './googlebackupgitrepofile'

export default class GoogleDriveBackup {
  private service: GoogleDriveService
  private cachePath: string
  private workerCount: number
  private onSectionSyncStartedListener: () => void
  private onSectionSyncFinishedListener: (totalFiles: number) => void
  private onSectionDownloadStartedListener: (totalFiles: number) => void
  private onSectionDownloadFinishedListener: (processedFiles: number, totalFiles: number) => void
  private onSyncFileFoundListener: (file: GoogleDriveFile, totalFiles: number) => void
  private onPathInUseListener: (path: string) => void
  private onDownloadStartedListener: (file: GoogleDriveFile, processedFiles: number, totalFiles: number, workerIndex: number, workerCount: number) => void
  private onDownloadSkipListener: (file: GoogleDriveFile, processedFiles: number, totalFiles: number, workerIndex: number, workerCount: number) => void
  private onDownloadProgressListener: (file: GoogleDriveFile, fileToBackup: GoogleBackupFile, progress: number, processedFiles: number, totalFiles: number, workerIndex: number, workerCount: number) => void
  private onDownloadErrorListener: (file: GoogleDriveFile, fileToBackup: GoogleBackupFile, error: Error, processedFiles: number, totalFiles: number, workerIndex: number, workerCount: number) => void
  private onUnwantedGitRepoListener: (file: GoogleDriveFile) => void

  constructor (service: GoogleDriveService, cachePath: string, workerCount: number) {
    this.service = service
    this.cachePath = cachePath
    this.workerCount = workerCount
  }

  static async create (clientSecretPath: string, credentialsPath: string, cachePath: string, workerCount: number): Promise<GoogleDriveBackup> {
    const service = await GoogleDriveService.create(clientSecretPath, credentialsPath)
    return new GoogleDriveBackup(service, cachePath, workerCount)
  }

  onSectionSyncStarted (callback: () => void): GoogleDriveBackup {
    this.onSectionSyncStartedListener = callback
    return this
  }

  onSectionSyncFinished (callback: (totalFiles: number) => void): GoogleDriveBackup {
    this.onSectionSyncFinishedListener = callback
    return this
  }

  onSectionDownloadStarted (callback: (totalFiles: number) => void): GoogleDriveBackup {
    this.onSectionDownloadStartedListener = callback
    return this
  }

  onSectionDownloadFinished (callback: (processedFiles: number, totalFiles: number) => void): GoogleDriveBackup {
    this.onSectionDownloadFinishedListener = callback
    return this
  }

  onSyncFileFound (callback: (file: GoogleDriveFile, totalFiles: number) => void): GoogleDriveBackup {
    this.onSyncFileFoundListener = callback
    return this
  }

  onPathInUse (callback: (path: string) => void): GoogleDriveBackup {
    this.onPathInUseListener = callback
    return this
  }

  onDownloadSkip (callback: (file: GoogleDriveFile, processedFiles: number, totalFiles: number, workerIndex: number, workerCount: number) => void): GoogleDriveBackup {
    this.onDownloadSkipListener = callback
    return this
  }

  onDownloadStarted (callback: (file: GoogleDriveFile, processedFiles: number, totalFiles: number, workerIndex: number, workerCount: number) => void): GoogleDriveBackup {
    this.onDownloadStartedListener = callback
    return this
  }

  onDownloadProgress (callback: (file: GoogleDriveFile, fileToBackup: GoogleBackupFile, progress: number, processedFiles: number, totalFiles: number, workerIndex: number, workerCount: number) => void): GoogleDriveBackup {
    this.onDownloadProgressListener = callback
    return this
  }

  onDownloadError (callback: (file: GoogleDriveFile, fileToBackup: GoogleBackupFile, error: Error, processedFiles: number, totalFiles: number, workerIndex: number, workerCount: number) => void): GoogleDriveBackup {
    this.onDownloadErrorListener = callback
    return this
  }

  onUnwantedGitRepo (callback: (dir: GoogleDriveDir) => void): GoogleDriveBackup {
    this.onUnwantedGitRepoListener = callback
    return this
  }

  async start (outputDir: string, fromCacheIfAvailable: boolean = false): Promise<number> {
    if (!fromCacheIfAvailable || !fs.existsSync(this.cachePath)) {
      await this.sync()
    }

    return this.download(outputDir)
  }

  async sync (): Promise<number> {
    let cacheFile: fs.WriteStream
    try {
      this.onSectionSyncStartedListener && this.onSectionSyncStartedListener()

      cacheFile = fs.createWriteStream(this.cachePath, { encoding: 'utf8' })

      let totalFiles: number = 0

      for await (const file of this.service.walk()) {
        cacheFile.write(`${file.toJson()}\n`)
        ++totalFiles
        this.onSyncFileFoundListener && this.onSyncFileFoundListener(file, totalFiles)
      }

      this.onSectionSyncFinishedListener && this.onSectionSyncFinishedListener(totalFiles)

      return totalFiles
    } finally {
      if (cacheFile) {
        cacheFile.close()
      }
    }
  }

  async download (outputDir: string) {
    const totalFiles: number = await SimpleLineReader.lineCount(this.cachePath)
    let processedFiles: number = 0

    this.onSectionDownloadStartedListener && this.onSectionDownloadStartedListener(totalFiles)

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

      const driveFile: GoogleDriveFile = GoogleDriveFile.fromJson(jsonString)

      this.onDownloadStartedListener && this.onDownloadStartedListener(driveFile, processedFiles, totalFiles, workerIndex, this.workerCount)

      if (this.onPathInUseListener) {
        const filesToBackup = driveFile.getFilesToBackup(outputDir)
        for (const fileToBackup of filesToBackup) {
          this.onPathInUseListener(fileToBackup.outputFilePath)
          if (fileToBackup instanceof GoogleBackupGitRepoFile) {
            this.onPathInUseListener(fileToBackup.repoDirPath)
          }
        }
      }

      ++processedFiles

      if (driveFile.isUnwantedGitRepo && driveFile.name === 'config') {
        this.onUnwantedGitRepoListener && this.onUnwantedGitRepoListener(driveFile)
      }

      if (!driveFile.getNeedsToBackup(outputDir)) {
        // Skip
        this.onDownloadSkipListener && this.onDownloadSkipListener(driveFile, processedFiles, totalFiles, workerIndex, this.workerCount)
      } else {
        const filesToBackup = driveFile.getFilesToBackup(outputDir)
        for (const fileToBackup of filesToBackup) {
          try {
            // Download
            await fileToBackup.save(this.service, (progress: number, done: boolean) => {
              this.onDownloadProgressListener && this.onDownloadProgressListener(driveFile, fileToBackup, progress, processedFiles, totalFiles, workerIndex, this.workerCount)
            })
          } catch (err) {
            // Error
            this.onDownloadErrorListener && this.onDownloadErrorListener(driveFile, fileToBackup, err, processedFiles, totalFiles, workerIndex, this.workerCount)
          }
        }
      }

      return true
    }, this.workerCount)

    await downloader.start()

    this.onSectionDownloadFinishedListener && this.onSectionDownloadFinishedListener(processedFiles, totalFiles)

    return totalFiles
  }
}
