import * as commander from 'commander'
import GoogleDriveFile from './gdrive/googledrivefile'
import * as fs from 'fs'
import * as readline from 'readline'
import GoogleDriveBackup from './gdrive/googledrivebackup'
import GoogleBackupFile from './gdrive/googlebackupfile'

class Program {
  /**
   * Command
   */
  private command: commander.Command

  /**
   * Constructor
   * @param {commander.Command} command
   */
  constructor (command: commander.Command) {
    this.command = command
      .name('Google Drive Backup Tool')
      .version('0.1.0')
      .usage('[options] <output_dir>')
      .option('-f, --force', 'Do not ask for confirmation')
      .option('-c, --cached', 'Use cached sync')
      .option('-d, --delete', 'Delete local files and directories that do not exist on drive anymore')
      .action(this.action.bind(this))
  }

  /**
   * Run the program
   * @param {string[]} argv
   */
  run (argv: string[]): void {
    this.command.parse(argv)
  }

  /**
   * Action
   * @param {string} outputDir
   */
  protected async action (outputDir: string) {
    const clientSecretFile = 'googleapi.clientsecret.json'
    const credentialsFile = 'googleapi.credentials.json'
    const cacheFile = 'gdrive.cache.json'
    const workerCount = 3

    const backup = await GoogleDriveBackup.create(clientSecretFile, credentialsFile, cacheFile, workerCount)
    backup
      // SYNC
      .onSectionSyncStarted(() => {
        process.stdout.write('SYNCING\n')
        for (let i = 0; i < 1; ++i) {
          process.stdout.write('\n')
        }
      })
      .onSyncFileFound((file: GoogleDriveFile, totalFiles: number) => {
        this.printOutput(0, 2, true, `Found file "${file.path}"`)
        this.printOutput(1, 2, true, `Total files: ${totalFiles}`)
      })
      .onSectionSyncFinished((totalFiles: number) => {
        this.printOutput(0, 2, true, `Finished`)
        this.printOutput(1, 2, true, `Total files: ${totalFiles}`)
        process.stdout.write('\n')
      })

      // DOWNLOAD
      .onSectionDownloadStarted((totalFiles: number) => {
        process.stdout.write('DOWNLOADING \n')
        for (let i = 0; i < workerCount; ++i) {
          process.stdout.write('\n')
        }
      })
      .onDownloadSkip((file: GoogleDriveFile, processedFiles: number, totalFiles: number, workerIndex: number) => {
        this.printOutput(workerIndex, workerCount + 1, true, `Worker ${workerIndex + 1} - Skipped "${file.path}"`)
        this.printOutput(workerCount, workerCount + 1, true, `Processed: ${processedFiles} / ${totalFiles}`)
      })
      .onDownloadProgress((file: GoogleDriveFile, fileToBackup: GoogleBackupFile, progress: number, processedFiles: number, totalFiles: number, workerIndex: number) => {
        const formattedProgress = Math.round(progress * 100 * 100) / 100
        this.printOutput(workerIndex, workerCount + 1, true, `Worker ${workerIndex + 1} - Downloading "${fileToBackup.driveFilePath}" - ${formattedProgress}%`)
        this.printOutput(workerCount, workerCount + 1, true, `Processed: ${processedFiles} / ${totalFiles}`)
      })
      .onDownloadError((file: GoogleDriveFile, fileToBackup: GoogleBackupFile, error: Error, processedFiles: number, totalFiles: number, workerIndex: number) => {
        this.printOutput(workerIndex, workerCount + 1, false, `Failed to download "${fileToBackup.driveFilePath}" - ${error.message}`)
        this.printOutput(workerCount, workerCount + 1, true, `Processed: ${processedFiles} / ${totalFiles}`)
      })
      .onUnwantedGitRepo((file: GoogleDriveFile) => {
        this.printOutput(0, workerCount + 1, false, `Found unwanted git repo at "${file.path}"`)
      })
      .onSectionDownloadFinished((processedFiles: number, totalFiles: number) => {
        for (let i = 0; i < workerCount; ++i) {
          this.printOutput(i, workerCount + 1, true, `Worker ${i + 1} - Done`)
        }
        this.printOutput(workerCount, workerCount + 1, true, `Processed ${totalFiles} files`)
        process.stdout.write('\n')
      })

    await backup.start(outputDir, this.command.cached)
  }

  protected printOutput(lineIndex: number, lineCount: number, overWritable: boolean, text: string) {
    if (overWritable) {
      readline.cursorTo(process.stdout, 0)
      readline.moveCursor(process.stdout, 0, -(lineCount - 1 - lineIndex))
      readline.clearLine(process.stdout, 0)

      process.stdout.write(text)

      readline.moveCursor(process.stdout, 0, lineCount - 1 - lineIndex)
    } else {
      readline.cursorTo(process.stdout, 0)
      readline.moveCursor(process.stdout, 0, -(lineCount - 1))
      readline.clearLine(process.stdout, 0)

      process.stdout.write(text)

      readline.moveCursor(process.stdout, 0, lineCount - 1)
      process.stdout.write('\n')
    }
  }
}

new Program(commander).run(process.argv)
