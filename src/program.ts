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

    // SYNC
    if (!this.command.cached || !fs.existsSync(cacheFile)) {
      // Prepare for multi-line output
      for (let i = 0; i < 1; ++i) {
        process.stdout.write('\n')
      }

      await backup.sync((file: GoogleDriveFile, totalFiles: number) => {
        this.printOutput(0, 2, true, `Found file "${file.path}"`)
        this.printOutput(1, 2, true, `Total files: ${totalFiles}`)
      })
    }

    // DOWNLOAD

    // Prepare for multi-line output
    for (let i = 0; i < workerCount; ++i) {
      process.stdout.write('\n')
    }

    const totalFiles = await backup.download(
      outputDir,
      (file: GoogleDriveFile, processedFiles: number, totalFiles: number, workerIndex: number) => {
        this.printOutput(workerIndex, workerCount + 1, true, `Worker ${workerIndex + 1} - Skipped "${file.path}"`)
        this.printOutput(workerCount, workerCount + 1, true, `Processed: ${processedFiles} / ${totalFiles}`)
      },
      (file: GoogleDriveFile, fileToBackup: GoogleBackupFile, progress: number, processedFiles: number, totalFiles: number, workerIndex: number) => {
        const formattedProgress = Math.round(progress * 100 * 100) / 100
        this.printOutput(workerIndex, workerCount + 1, true, `Worker ${workerIndex + 1} - Downloading "${fileToBackup.driveFilePath}" - ${formattedProgress}%`)
        this.printOutput(workerCount, workerCount + 1, true, `Processed: ${processedFiles} / ${totalFiles}`)
      },
      (file: GoogleDriveFile, fileToBackup: GoogleBackupFile, error: Error, processedFiles: number, totalFiles: number, workerIndex: number) => {
        this.printOutput(workerIndex, workerCount + 1, false, `Failed to download "${fileToBackup.driveFilePath}" - ${error.message}`)
        this.printOutput(workerCount, workerCount + 1, true, `Processed: ${processedFiles} / ${totalFiles}`)
      }
    )

    for (let i = 0; i < workerCount; ++i) {
      this.printOutput(i, workerCount + 1, true, `Worker ${i + 1} - Done`)
    }
    this.printOutput(workerCount, workerCount + 1, true, `Processed ${totalFiles} files`)
  }

  protected printOutput(lineIndex: number, lineCount: number, overWritable: boolean, text: string) {
    if (overWritable) {
      readline.cursorTo(process.stdout, 0)
      readline.moveCursor(process.stdout, 0, -(lineCount - 1 - lineIndex))
      readline.clearLine(process.stdout, 0)

      process.stdout.write(text)

      readline.cursorTo(process.stdout, 0)
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
